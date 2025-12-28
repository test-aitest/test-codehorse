/**
 * Memory Module
 *
 * 会話履歴・適応学習システムのエントリポイント
 */

// 型定義
export type {
  ConversationEntry,
  ConversationMetadata,
  SaveConversationParams,
  GetConversationOptions,
  SaveFeedbackParams,
  FeedbackSummary,
  LearningInsightData,
  UpdateInsightParams,
  AdaptiveContext,
  RepositoryPreferences,
  BuildAdaptiveContextOptions,
  FeedbackAnalysisResult,
  AnalyzeFeedbackOptions,
  ConversationTokenBudget,
  ConversationSummary,
} from "./types";

// 会話ストア
export {
  saveConversation,
  saveConversationBatch,
  getConversationHistory,
  getRecentConversations,
  getConversationCount,
  saveFeedback,
  getFeedbackSummary,
  getFeedbacksForAnalysis,
  updateLearningInsight,
  getLearningInsights,
  getLearningInsightByCategory,
  deleteLearningInsight,
  clearConversationHistory,
  clearRepositoryMemory,
} from "./conversation-store";

// コンテキストビルダー
export {
  buildAdaptiveContext,
  buildAdaptivePromptSection,
  calculateTokenBudget,
  trimConversationHistory,
  generateConversationSummary,
  createEmptyAdaptiveContext,
  hasValidContext,
  deserializeAdaptiveContext,
} from "./context-builder";

// フィードバック分析
export {
  analyzeFeedback,
  analyzeBasicTrends,
  compareWithExistingInsights,
  runScheduledAnalysis,
} from "./feedback-analyzer";
