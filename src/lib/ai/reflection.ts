/**
 * Self-Reflection Protocol
 *
 * AIが自身の提案を検証・スコアリングする
 * 低品質な提案をフィルタリングしてレビュー品質を向上
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import type { InlineComment } from "./schemas";

// ========================================
// 設定
// ========================================

// 反省機能の有効/無効
const REFLECTION_ENABLED = process.env.AI_REFLECTION_ENABLED !== "false";

// 提案を採用する最低スコア（1-10）
const REFLECTION_THRESHOLD = parseInt(process.env.AI_REFLECTION_THRESHOLD || "7", 10);

// ========================================
// スキーマ定義
// ========================================

const SuggestionValidationSchema = z.object({
  index: z.number().describe("元のコメントのインデックス（0始まり）"),
  score: z.number().min(1).max(10).describe("提案の品質スコア（1-10）"),
  isRelevant: z.boolean().describe("この提案は実際に有用か"),
  reasoning: z.string().describe("スコアの理由（簡潔に）"),
  improvement: z.string().optional().describe("改善案（あれば）"),
});

const ReflectionResultSchema = z.object({
  overallQuality: z.number().min(1).max(10).describe("レビュー全体の品質スコア"),
  suggestions: z.array(SuggestionValidationSchema),
  summary: z.string().describe("反省の要約"),
});

export type SuggestionValidation = z.infer<typeof SuggestionValidationSchema>;
export type ReflectionResult = z.infer<typeof ReflectionResultSchema>;

// ========================================
// 反省プロンプト
// ========================================

function buildReflectionPrompt(params: {
  prTitle: string;
  prBody: string;
  diffContent: string;
  comments: InlineComment[];
}): string {
  const { prTitle, prBody, diffContent, comments } = params;

  const commentsSection = comments
    .map((c, i) => {
      return `
### コメント ${i} (${c.severity})
- ファイル: ${c.path}
- 行: ${c.endLine}
- 内容: ${c.body}
${c.suggestion ? `- 修正提案: ${c.suggestion}` : ""}
`;
    })
    .join("\n");

  return `あなたはコードレビューの品質管理者です。
以下のAIが生成したコードレビューコメントを検証し、各提案の品質をスコアリングしてください。

## PR情報
**タイトル**: ${prTitle}
**説明**: ${prBody || "(なし)"}

## Diff内容
\`\`\`diff
${diffContent.slice(0, 5000)}
\`\`\`

## AIが生成したコメント
${commentsSection}

## 検証タスク

各コメントを以下の基準でスコアリングしてください（1-10）:

### スコア基準
- **9-10**: 非常に重要で正確な指摘。修正必須。
- **7-8**: 有用で正確な指摘。修正推奨。
- **5-6**: ある程度有用だが、必須ではない。
- **3-4**: 価値が低い、または文脈を無視している。
- **1-2**: 不正確、または完全に的外れ。

### 評価観点
1. **正確性**: コードの解釈は正しいか？
2. **関連性**: PRの目的に関連しているか？
3. **実行可能性**: 提案は実際に適用可能か？
4. **重要度**: 修正する価値があるか？
5. **明確さ**: 開発者が理解できる説明か？

### 注意
- 誤検知（false positive）を厳しくチェック
- スタイル的な指摘は低めにスコアリング
- セキュリティやバグの指摘は適切に評価
- 文脈を無視した一般論は減点`;
}

// ========================================
// 反省実行
// ========================================

export interface ReflectOnReviewParams {
  prTitle: string;
  prBody: string;
  diffContent: string;
  comments: InlineComment[];
}

// JSON出力を要求するプロンプト拡張
const JSON_OUTPUT_INSTRUCTION = `

## 出力形式

必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。

\`\`\`json
{
  "overallQuality": 全体の品質スコア（1-10の数値）,
  "suggestions": [
    {
      "index": コメントのインデックス（0始まり）,
      "score": 品質スコア（1-10の数値）,
      "isRelevant": この提案は有用か（true/false）,
      "reasoning": "スコアの理由（簡潔に）",
      "improvement": "改善案（あれば、省略可）"
    }
  ],
  "summary": "反省の要約"
}
\`\`\``;

/**
 * レビュー結果を反省し、各コメントをスコアリング
 */
export async function reflectOnReview(
  params: ReflectOnReviewParams
): Promise<ReflectionResult> {
  const { prTitle, prBody, diffContent, comments } = params;

  // コメントがない場合は早期リターン
  if (comments.length === 0) {
    return {
      overallQuality: 10,
      suggestions: [],
      summary: "レビューコメントなし",
    };
  }

  const basePrompt = buildReflectionPrompt({ prTitle, prBody, diffContent, comments });
  const prompt = basePrompt + JSON_OUTPUT_INSTRUCTION;

  try {
    const result = await generateText({
      model: google("gemini-2.0-flash-exp"),
      prompt,
      temperature: 0.3,
    });

    // JSONをパース
    let jsonStr = result.text;
    const codeBlockMatch = result.text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const jsonObjectMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonStr = jsonObjectMatch[0];
      }
    }

    const parsed = JSON.parse(jsonStr);
    const validated = ReflectionResultSchema.parse(parsed);

    console.log(`[Reflection] Quality: ${validated.overallQuality}/10, Comments validated: ${validated.suggestions.length}`);

    return validated;
  } catch (error) {
    console.error("[Reflection] Failed:", error);
    // エラー時は全コメントを採用（反省をスキップ）
    return {
      overallQuality: 7,
      suggestions: comments.map((_, i) => ({
        index: i,
        score: 7,
        isRelevant: true,
        reasoning: "反省処理がスキップされました",
      })),
      summary: "反省処理に失敗したため、全コメントを採用しました",
    };
  }
}

/**
 * 反省結果に基づいてコメントをフィルタリング
 */
export function filterCommentsByReflection(
  comments: InlineComment[],
  reflection: ReflectionResult,
  threshold: number = REFLECTION_THRESHOLD
): {
  accepted: InlineComment[];
  rejected: Array<{ comment: InlineComment; validation: SuggestionValidation }>;
} {
  const accepted: InlineComment[] = [];
  const rejected: Array<{ comment: InlineComment; validation: SuggestionValidation }> = [];

  for (const validation of reflection.suggestions) {
    const comment = comments[validation.index];
    if (!comment) continue;

    if (validation.score >= threshold && validation.isRelevant) {
      accepted.push(comment);
    } else {
      rejected.push({ comment, validation });
    }
  }

  console.log(`[Reflection] Accepted: ${accepted.length}/${comments.length} (threshold: ${threshold})`);

  return { accepted, rejected };
}

/**
 * レビューに反省プロセスを適用
 * 有効な場合のみ実行、無効な場合は元のコメントをそのまま返す
 */
export async function applyReflection(params: {
  prTitle: string;
  prBody: string;
  diffContent: string;
  comments: InlineComment[];
}): Promise<{
  comments: InlineComment[];
  reflection?: ReflectionResult;
  filtered: boolean;
}> {
  const { comments } = params;

  // 反省が無効な場合はスキップ
  if (!REFLECTION_ENABLED) {
    console.log("[Reflection] Disabled, skipping");
    return { comments, filtered: false };
  }

  // コメントが少ない場合はスキップ（オーバーヘッドを避ける）
  if (comments.length <= 2) {
    console.log("[Reflection] Too few comments, skipping");
    return { comments, filtered: false };
  }

  const reflection = await reflectOnReview(params);
  const { accepted } = filterCommentsByReflection(comments, reflection);

  return {
    comments: accepted,
    reflection,
    filtered: true,
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * 反省機能が有効かどうかを確認
 */
export function isReflectionEnabled(): boolean {
  return REFLECTION_ENABLED;
}

/**
 * 現在の閾値を取得
 */
export function getReflectionThreshold(): number {
  return REFLECTION_THRESHOLD;
}

/**
 * 反省結果のサマリーを生成
 */
export function formatReflectionSummary(reflection: ReflectionResult): string {
  const avgScore =
    reflection.suggestions.length > 0
      ? reflection.suggestions.reduce((sum, s) => sum + s.score, 0) / reflection.suggestions.length
      : 0;

  const highQuality = reflection.suggestions.filter((s) => s.score >= 8).length;
  const lowQuality = reflection.suggestions.filter((s) => s.score < 5).length;

  return `
## 🔍 Self-Reflection Summary

- **Overall Quality**: ${reflection.overallQuality}/10
- **Average Score**: ${avgScore.toFixed(1)}/10
- **High Quality (8+)**: ${highQuality}
- **Low Quality (<5)**: ${lowQuality}
- **Summary**: ${reflection.summary}
`.trim();
}
