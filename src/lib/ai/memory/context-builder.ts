/**
 * Context Builder
 *
 * 会話履歴と学習インサイトから適応コンテキストを構築
 * AIプロンプトに注入するためのコンテキストを生成
 */

import {
  getRecentConversations,
  getLearningInsights,
} from "./conversation-store";
import type {
  AdaptiveContext,
  BuildAdaptiveContextOptions,
  ConversationEntry,
  ConversationMetadata,
  LearningInsightData,
  RepositoryPreferences,
  ConversationTokenBudget,
  ConversationSummary,
} from "./types";
import type {
  ConversationType,
  ConversationRole,
  InsightCategory,
} from "@prisma/client";

// ========================================
// 定数
// ========================================

// 1トークン ≈ 4文字（日本語の場合は約2文字）
const CHARS_PER_TOKEN = 3;

// デフォルトのトークン予算
const DEFAULT_MAX_CONVERSATION_TOKENS = 4000;

// ========================================
// コンテキスト構築
// ========================================

/**
 * 適応コンテキストを構築
 */
export async function buildAdaptiveContext(
  options: BuildAdaptiveContextOptions
): Promise<AdaptiveContext> {
  const {
    pullRequestId,
    repositoryId,
    maxConversationEntries = 20,
    conversationTypes,
    includeLearningInsights = true,
  } = options;

  // 会話履歴を取得
  const conversationHistory = await getRecentConversations(
    pullRequestId,
    maxConversationEntries
  );

  // タイプでフィルタリング
  const filteredHistory = conversationTypes
    ? conversationHistory.filter((entry) =>
        conversationTypes.includes(entry.type)
      )
    : conversationHistory;

  // 学習インサイトを取得
  let learningInsights: LearningInsightData[] = [];
  let repositoryPreferences: RepositoryPreferences | undefined;

  if (includeLearningInsights) {
    learningInsights = await getLearningInsights(repositoryId);
    repositoryPreferences = derivePreferencesFromInsights(learningInsights);
  }

  return {
    conversationHistory: filteredHistory,
    learningInsights,
    repositoryPreferences,
  };
}

/**
 * 学習インサイトからリポジトリ設定を導出
 */
function derivePreferencesFromInsights(
  insights: LearningInsightData[]
): RepositoryPreferences | undefined {
  if (insights.length === 0) {
    return undefined;
  }

  const insightMap = new Map(insights.map((i) => [i.category, i]));

  // 厳しさレベルを決定
  let preferredSeverityLevel: "strict" | "balanced" | "lenient" = "balanced";
  const severityInsight = insightMap.get("SEVERITY" as InsightCategory);
  if (severityInsight && severityInsight.confidence > 0.6) {
    if (
      severityInsight.insight.includes("厳しすぎ") ||
      severityInsight.insight.includes("too strict")
    ) {
      preferredSeverityLevel = "lenient";
    } else if (
      severityInsight.insight.includes("緩すぎ") ||
      severityInsight.insight.includes("too lenient")
    ) {
      preferredSeverityLevel = "strict";
    }
  }

  // 重視する観点を抽出
  const focusAreas: string[] = [];
  const focusInsight = insightMap.get("FOCUS_AREA" as InsightCategory);
  if (focusInsight && focusInsight.examples) {
    focusAreas.push(...focusInsight.examples);
  }

  // 無視パターンを抽出
  const ignoredPatterns: string[] = [];
  const ignoreInsight = insightMap.get("IGNORE_PATTERN" as InsightCategory);
  if (ignoreInsight && ignoreInsight.examples) {
    ignoredPatterns.push(...ignoreInsight.examples);
  }

  return {
    preferredSeverityLevel,
    focusAreas,
    ignoredPatterns,
  };
}

// ========================================
// プロンプトセクション生成
// ========================================

/**
 * 適応コンテキストからプロンプトセクションを構築
 */
export function buildAdaptivePromptSection(context: AdaptiveContext): string {
  const sections: string[] = [];

  // 学習インサイトセクション
  if (context.learningInsights.length > 0) {
    sections.push(buildInsightsSection(context.learningInsights));
  }

  // リポジトリ設定セクション
  if (context.repositoryPreferences) {
    sections.push(buildPreferencesSection(context.repositoryPreferences));
  }

  // 会話履歴セクション
  if (context.conversationHistory.length > 0) {
    sections.push(buildConversationSection(context.conversationHistory));
  }

  return sections.join("\n\n");
}

/**
 * 学習インサイトのプロンプトセクションを構築
 */
function buildInsightsSection(insights: LearningInsightData[]): string {
  let section = "## 学習済みの傾向\n";
  section +=
    "このリポジトリでの過去のフィードバックから学習した傾向です。レビュー時に考慮してください。\n\n";

  for (const insight of insights) {
    const confidenceLevel = getConfidenceLabel(insight.confidence);
    section += `### ${categoryToLabel(
      insight.category
    )}（${confidenceLevel}）\n`;
    section += `${insight.insight}\n`;
    if (insight.examples && insight.examples.length > 0) {
      section += "例:\n";
      for (const example of insight.examples.slice(0, 3)) {
        section += `- ${example}\n`;
      }
    }
    section += "\n";
  }

  return section;
}

/**
 * リポジトリ設定のプロンプトセクションを構築
 */
function buildPreferencesSection(prefs: RepositoryPreferences): string {
  let section = "## リポジトリの設定\n";

  section += `- **厳しさレベル**: ${severityLevelToLabel(
    prefs.preferredSeverityLevel
  )}\n`;

  if (prefs.focusAreas.length > 0) {
    section += `- **重視する観点**: ${prefs.focusAreas.join(", ")}\n`;
  }

  if (prefs.ignoredPatterns.length > 0) {
    section += `- **無視するパターン**: ${prefs.ignoredPatterns.join(", ")}\n`;
  }

  return section;
}

/**
 * 会話履歴のプロンプトセクションを構築
 */
function buildConversationSection(history: ConversationEntry[]): string {
  let section = "## このPRでの会話履歴\n";
  section +=
    "以下は同じPR内での過去の会話です。一貫性のある回答を心がけてください。\n\n";

  for (const entry of history) {
    const role = entry.role === "AI" ? "🤖 AI" : "👤 ユーザー";
    const type = conversationTypeToLabel(entry.type);
    section += `### ${role}（${type}）\n`;
    section += `${truncateContent(entry.content, 500)}\n\n`;
  }

  return section;
}

// ========================================
// トークン管理
// ========================================

/**
 * 会話履歴のトークン予算を計算
 */
export function calculateTokenBudget(
  history: ConversationEntry[],
  maxTokens: number = DEFAULT_MAX_CONVERSATION_TOKENS
): ConversationTokenBudget {
  let currentTokens = 0;

  for (const entry of history) {
    currentTokens += estimateTokens(entry.content);
    if (entry.metadata) {
      currentTokens += estimateTokens(JSON.stringify(entry.metadata));
    }
  }

  return {
    maxTokens,
    currentTokens,
    remainingTokens: Math.max(0, maxTokens - currentTokens),
  };
}

/**
 * トークン予算内に収まるように会話履歴をトリム
 */
export function trimConversationHistory(
  history: ConversationEntry[],
  maxTokens: number = DEFAULT_MAX_CONVERSATION_TOKENS
): ConversationEntry[] {
  const result: ConversationEntry[] = [];
  let currentTokens = 0;

  // 新しい順に追加（重要な最近の会話を優先）
  const reversedHistory = [...history].reverse();

  for (const entry of reversedHistory) {
    const entryTokens = estimateTokens(entry.content);
    if (currentTokens + entryTokens <= maxTokens) {
      result.unshift(entry);
      currentTokens += entryTokens;
    } else {
      break;
    }
  }

  return result;
}

/**
 * 文字列のトークン数を推定
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ========================================
// 会話サマリー
// ========================================

/**
 * 会話履歴のサマリーを生成（トークン節約用）
 */
export function generateConversationSummary(
  pullRequestId: string,
  history: ConversationEntry[]
): ConversationSummary {
  const aiEntries = history.filter((e) => e.role === "AI").length;
  const userEntries = history.filter((e) => e.role === "USER").length;

  // トピックを抽出（簡易実装：最初の50文字を使用）
  const topics = history
    .slice(0, 5)
    .map((e) => e.content.slice(0, 50))
    .join("; ");

  const lastEntry = history[history.length - 1];

  return {
    pullRequestId,
    totalEntries: history.length,
    aiEntries,
    userEntries,
    topicsSummary: topics,
    lastActivityAt: lastEntry?.createdAt || new Date(),
  };
}

// ========================================
// ヘルパー関数
// ========================================

function categoryToLabel(category: InsightCategory): string {
  const labels: Record<InsightCategory, string> = {
    STYLE: "コードスタイル",
    SEVERITY: "厳しさレベル",
    FOCUS_AREA: "重視する観点",
    LANGUAGE: "言語・フレームワーク",
    IGNORE_PATTERN: "無視するパターン",
  };
  return labels[category] || category;
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "高信頼度";
  if (confidence >= 0.5) return "中信頼度";
  return "低信頼度";
}

function severityLevelToLabel(
  level: "strict" | "balanced" | "lenient"
): string {
  const labels = {
    strict: "厳格（細かい問題も指摘）",
    balanced: "バランス（重要な問題を中心に）",
    lenient: "寛容（重大な問題のみ指摘）",
  };
  return labels[level];
}

function conversationTypeToLabel(type: ConversationType): string {
  const labels: Record<ConversationType, string> = {
    REVIEW: "レビュー",
    USER_COMMENT: "コメント",
    CHAT_RESPONSE: "チャット応答",
    CHAT_QUESTION: "チャット質問",
  };
  return labels[type] || type;
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + "...";
}

// ========================================
// エクスポート用のファクトリ関数
// ========================================

/**
 * 空の適応コンテキストを作成
 */
export function createEmptyAdaptiveContext(): AdaptiveContext {
  return {
    conversationHistory: [],
    learningInsights: [],
    repositoryPreferences: undefined,
  };
}

/**
 * コンテキストが有効かどうかをチェック
 */
export function hasValidContext(context: AdaptiveContext): boolean {
  return (
    context.conversationHistory.length > 0 ||
    context.learningInsights.length > 0 ||
    context.repositoryPreferences !== undefined
  );
}

/**
 * シリアライズされた適応コンテキストを復元
 * Inngestのステップ間でDateがstringになる問題を解決
 */
export function deserializeAdaptiveContext(
  serialized: unknown
): AdaptiveContext | undefined {
  if (!serialized || typeof serialized !== "object") {
    return undefined;
  }

  const ctx = serialized as {
    conversationHistory?: unknown[];
    learningInsights?: unknown[];
    repositoryPreferences?: RepositoryPreferences;
  };

  return {
    conversationHistory: (ctx.conversationHistory || []).map((entry) => {
      const e = entry as {
        id: string;
        type: ConversationType;
        role: ConversationRole;
        content: string;
        metadata?: ConversationMetadata;
        createdAt: string | Date;
      };
      return {
        ...e,
        createdAt:
          typeof e.createdAt === "string" ? new Date(e.createdAt) : e.createdAt,
      };
    }),
    learningInsights: (ctx.learningInsights || []) as LearningInsightData[],
    repositoryPreferences: ctx.repositoryPreferences,
  };
}
