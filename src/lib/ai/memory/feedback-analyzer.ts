/**
 * Feedback Analyzer
 *
 * ユーザーフィードバックを分析し、学習インサイトを生成
 */

import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { FeedbackType, InsightCategory } from "@prisma/client";
import {
  getFeedbacksForAnalysis,
  updateLearningInsight,
  getLearningInsights,
} from "./conversation-store";
import type {
  LearningInsightData,
  FeedbackAnalysisResult,
  AnalyzeFeedbackOptions,
} from "./types";

// ========================================
// スキーマ定義
// ========================================

const InsightSchema = z.object({
  category: z.enum(["STYLE", "SEVERITY", "FOCUS_AREA", "LANGUAGE", "IGNORE_PATTERN"]),
  insight: z.string().describe("このカテゴリで学習した傾向の説明"),
  confidence: z.number().min(0).max(1).describe("信頼度 (0.0-1.0)"),
  examples: z.array(z.string()).optional().describe("具体例"),
});

const AnalysisResultSchema = z.object({
  insights: z.array(InsightSchema),
  overallSummary: z.string().describe("全体的な傾向のまとめ"),
});

// ========================================
// 分析プロンプト
// ========================================

function buildAnalysisPrompt(
  feedbacks: Array<{
    feedbackType: FeedbackType;
    userComment: string | null;
    originalContent: string;
    createdAt: Date;
  }>
): string {
  const feedbackList = feedbacks
    .map((f, i) => {
      return `
### フィードバック ${i + 1}
- タイプ: ${feedbackTypeToJapanese(f.feedbackType)}
- ユーザーコメント: ${f.userComment || "なし"}
- 元のAIコメント:
\`\`\`
${f.originalContent}
\`\`\`
`;
    })
    .join("\n");

  return `
あなたはコードレビューAIの改善アナリストです。
以下のユーザーフィードバックを分析し、このリポジトリでのレビュー品質を向上させるためのインサイトを生成してください。

## フィードバック一覧
${feedbackList}

## 分析タスク

以下のカテゴリについて、フィードバックから学べる傾向を特定してください：

1. **STYLE**: コードスタイルに関する傾向
   - ユーザーが好むコーディング規約
   - 指摘を歓迎するスタイル vs 無視されがちなスタイル

2. **SEVERITY**: 厳しさレベルの傾向
   - 厳しすぎると感じられた指摘のパターン
   - 適切と評価された厳しさのレベル

3. **FOCUS_AREA**: 重視する観点
   - ユーザーが価値を感じる指摘の種類
   - あまり関心がない観点

4. **LANGUAGE**: 言語・フレームワーク特有の傾向
   - 特定の技術に関するフィードバック
   - ベストプラクティスへの反応

5. **IGNORE_PATTERN**: 無視すべきパターン
   - 繰り返し「役に立たない」と評価されるパターン
   - 誤検知の傾向

## 重要な注意点
- 信頼度(confidence)は、そのインサイトを裏付けるフィードバックの数と一貫性に基づいて設定してください
- サンプル数が少ない場合は、信頼度を低めに設定してください
- 明確なパターンがないカテゴリは省略しても構いません
`;
}

function feedbackTypeToJapanese(type: FeedbackType): string {
  const map: Record<FeedbackType, string> = {
    HELPFUL: "役に立った",
    NOT_HELPFUL: "役に立たなかった",
    INCORRECT: "間違っている",
    TOO_STRICT: "厳しすぎる",
    TOO_LENIENT: "緩すぎる",
  };
  return map[type] || type;
}

// ========================================
// 分析関数
// ========================================

/**
 * リポジトリのフィードバックを分析し、学習インサイトを生成
 */
export async function analyzeFeedback(
  options: AnalyzeFeedbackOptions
): Promise<FeedbackAnalysisResult> {
  const { repositoryId, minSampleCount = 5, lookbackDays = 30 } = options;

  // フィードバックを取得
  const feedbacks = await getFeedbacksForAnalysis(repositoryId, {
    lookbackDays,
    limit: 100,
  });

  // 最低サンプル数に満たない場合は空の結果を返す
  if (feedbacks.length < minSampleCount) {
    return {
      insights: [],
      analyzedCount: feedbacks.length,
      overallConfidence: 0,
    };
  }

  // AIで分析
  const prompt = buildAnalysisPrompt(feedbacks);

  try {
    const result = await generateObject({
      model: google("gemini-2.0-flash-exp"),
      schema: AnalysisResultSchema,
      prompt,
    });

    const insights: LearningInsightData[] = result.object.insights.map((insight) => ({
      category: insight.category as InsightCategory,
      insight: insight.insight,
      confidence: insight.confidence,
      sampleCount: feedbacks.length,
      examples: insight.examples,
    }));

    // 学習インサイトをDBに保存
    await Promise.all(
      insights.map((insight) =>
        updateLearningInsight({
          repositoryId,
          category: insight.category,
          insight: insight.insight,
          confidence: insight.confidence,
          sampleCount: insight.sampleCount,
        })
      )
    );

    // 全体の信頼度を計算（各インサイトの信頼度の平均）
    const overallConfidence =
      insights.length > 0
        ? insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length
        : 0;

    return {
      insights,
      analyzedCount: feedbacks.length,
      overallConfidence,
    };
  } catch (error) {
    console.error("Feedback analysis failed:", error);
    return {
      insights: [],
      analyzedCount: feedbacks.length,
      overallConfidence: 0,
    };
  }
}

/**
 * フィードバックの傾向を簡易分析（AI不使用）
 * 統計ベースの高速な分析
 */
export async function analyzeBasicTrends(
  repositoryId: string,
  lookbackDays: number = 30
): Promise<{
  severityTrend: "too_strict" | "too_lenient" | "balanced";
  helpfulRate: number;
  totalFeedbacks: number;
  topIssues: string[];
}> {
  const feedbacks = await getFeedbacksForAnalysis(repositoryId, {
    lookbackDays,
    limit: 100,
  });

  if (feedbacks.length === 0) {
    return {
      severityTrend: "balanced",
      helpfulRate: 0,
      totalFeedbacks: 0,
      topIssues: [],
    };
  }

  // 各タイプのカウント
  const counts: Record<FeedbackType, number> = {
    HELPFUL: 0,
    NOT_HELPFUL: 0,
    INCORRECT: 0,
    TOO_STRICT: 0,
    TOO_LENIENT: 0,
  };

  for (const f of feedbacks) {
    counts[f.feedbackType as FeedbackType]++;
  }

  // 厳しさの傾向を判定
  let severityTrend: "too_strict" | "too_lenient" | "balanced" = "balanced";
  const strictRatio = counts.TOO_STRICT / feedbacks.length;
  const lenientRatio = counts.TOO_LENIENT / feedbacks.length;

  if (strictRatio > 0.3) {
    severityTrend = "too_strict";
  } else if (lenientRatio > 0.3) {
    severityTrend = "too_lenient";
  }

  // 有用性レート
  const helpfulRate = counts.HELPFUL / feedbacks.length;

  // 主な問題点を抽出（ユーザーコメントから）
  const topIssues = feedbacks
    .filter((f) => f.userComment && f.feedbackType !== "HELPFUL")
    .map((f) => f.userComment as string)
    .slice(0, 5);

  return {
    severityTrend,
    helpfulRate,
    totalFeedbacks: feedbacks.length,
    topIssues,
  };
}

/**
 * 既存のインサイトとの差分を計算
 * 新しい分析結果との変化を検出
 */
export async function compareWithExistingInsights(
  repositoryId: string,
  newInsights: LearningInsightData[]
): Promise<{
  added: LearningInsightData[];
  updated: Array<{
    category: InsightCategory;
    oldInsight: string;
    newInsight: string;
    confidenceChange: number;
  }>;
  unchanged: InsightCategory[];
}> {
  const existingInsights = await getLearningInsights(repositoryId);

  const existingMap = new Map(
    existingInsights.map((i) => [i.category, i])
  );

  const added: LearningInsightData[] = [];
  const updated: Array<{
    category: InsightCategory;
    oldInsight: string;
    newInsight: string;
    confidenceChange: number;
  }> = [];
  const unchanged: InsightCategory[] = [];

  for (const newInsight of newInsights) {
    const existing = existingMap.get(newInsight.category);

    if (!existing) {
      added.push(newInsight);
    } else if (existing.insight !== newInsight.insight) {
      updated.push({
        category: newInsight.category,
        oldInsight: existing.insight,
        newInsight: newInsight.insight,
        confidenceChange: newInsight.confidence - existing.confidence,
      });
    } else {
      unchanged.push(newInsight.category);
    }
  }

  return { added, updated, unchanged };
}

/**
 * 定期的なフィードバック分析をスケジュール実行するための関数
 * Inngestから呼び出されることを想定
 */
export async function runScheduledAnalysis(
  repositoryId: string
): Promise<{
  success: boolean;
  insightsGenerated: number;
  message: string;
}> {
  try {
    const result = await analyzeFeedback({
      repositoryId,
      minSampleCount: 5,
      lookbackDays: 30,
    });

    if (result.insights.length === 0) {
      return {
        success: true,
        insightsGenerated: 0,
        message:
          result.analyzedCount < 5
            ? "フィードバック数が不足しています（最低5件必要）"
            : "明確なパターンが検出されませんでした",
      };
    }

    return {
      success: true,
      insightsGenerated: result.insights.length,
      message: `${result.insights.length}件のインサイトを生成しました（信頼度: ${(result.overallConfidence * 100).toFixed(0)}%）`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      insightsGenerated: 0,
      message: `分析に失敗しました: ${errorMessage}`,
    };
  }
}
