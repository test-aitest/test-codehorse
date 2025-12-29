/**
 * Conversation Memory & Adaptive Learning Types
 *
 * 会話履歴の記録と適応学習のための型定義
 */

import type {
  ConversationType,
  ConversationRole,
  FeedbackType,
  InsightCategory,
} from "@prisma/client";

// ========================================
// 会話履歴の型
// ========================================

/**
 * 会話エントリのメタデータ
 */
export interface ConversationMetadata {
  filePath?: string;
  lineNumber?: number;
  endLine?: number;
  severity?: string;
  suggestionApplied?: boolean;
  reviewId?: string;
  commentId?: string;
}

/**
 * 会話エントリ
 */
export interface ConversationEntry {
  id: string;
  type: ConversationType;
  role: ConversationRole;
  content: string;
  metadata?: ConversationMetadata;
  createdAt: Date;
}

/**
 * 会話履歴の保存パラメータ
 */
export interface SaveConversationParams {
  pullRequestId: string;
  type: ConversationType;
  role: ConversationRole;
  content: string;
  metadata?: ConversationMetadata;
}

/**
 * 会話履歴の取得オプション
 */
export interface GetConversationOptions {
  pullRequestId: string;
  limit?: number;
  types?: ConversationType[];
  since?: Date;
}

// ========================================
// フィードバックの型
// ========================================

/**
 * フィードバックの保存パラメータ
 */
export interface SaveFeedbackParams {
  repositoryId: string;
  commentId?: string;
  feedbackType: FeedbackType;
  userComment?: string;
  originalContent: string;
}

/**
 * フィードバックのサマリー
 */
export interface FeedbackSummary {
  repositoryId: string;
  totalCount: number;
  byType: Record<FeedbackType, number>;
  recentFeedbacks: Array<{
    feedbackType: FeedbackType;
    userComment?: string;
    originalContent: string;
    createdAt: Date;
  }>;
}

// ========================================
// 学習インサイトの型
// ========================================

/**
 * 学習インサイト
 */
export interface LearningInsightData {
  category: InsightCategory;
  insight: string;
  confidence: number; // 0.0 - 1.0
  sampleCount: number;
  examples?: string[];
}

/**
 * 学習インサイトの更新パラメータ
 */
export interface UpdateInsightParams {
  repositoryId: string;
  category: InsightCategory;
  insight: string;
  confidence: number;
  sampleCount: number;
}

/**
 * リポジトリの学習済み設定
 */
export interface RepositoryPreferences {
  preferredSeverityLevel: "strict" | "balanced" | "lenient";
  focusAreas: string[];
  ignoredPatterns: string[];
}

// ========================================
// 適応コンテキストの型
// ========================================

/**
 * 適応コンテキスト（AIプロンプトに注入される）
 */
export interface AdaptiveContext {
  // PR内の会話履歴
  conversationHistory: ConversationEntry[];

  // リポジトリの学習インサイト
  learningInsights: LearningInsightData[];

  // リポジトリの設定（インサイトから導出）
  repositoryPreferences?: RepositoryPreferences;
}

/**
 * 適応コンテキストの構築オプション
 */
export interface BuildAdaptiveContextOptions {
  pullRequestId: string;
  repositoryId: string;

  // 会話履歴の取得設定
  maxConversationEntries?: number;
  conversationTypes?: ConversationType[];

  // 学習インサイトを含めるか
  includeLearningInsights?: boolean;
}

// ========================================
// フィードバック分析の型
// ========================================

/**
 * フィードバック分析結果
 */
export interface FeedbackAnalysisResult {
  // 導出されたインサイト
  insights: LearningInsightData[];

  // 分析に使用したフィードバック数
  analyzedCount: number;

  // 分析の信頼度
  overallConfidence: number;
}

/**
 * フィードバック分析のオプション
 */
export interface AnalyzeFeedbackOptions {
  repositoryId: string;
  minSampleCount?: number; // 最低サンプル数（デフォルト: 5）
  lookbackDays?: number; // 過去何日分を分析するか（デフォルト: 30）
}

// ========================================
// ユーティリティ型
// ========================================

/**
 * 会話履歴のトークン予算
 */
export interface ConversationTokenBudget {
  maxTokens: number;
  currentTokens: number;
  remainingTokens: number;
}

/**
 * 会話のサマリー（トークン節約用）
 */
export interface ConversationSummary {
  pullRequestId: string;
  totalEntries: number;
  aiEntries: number;
  userEntries: number;
  topicsSummary: string;
  lastActivityAt: Date;
}
