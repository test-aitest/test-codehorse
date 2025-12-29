/**
 * Phase 1: Intelligent Comment Persistence System
 *
 * インテリジェントコメント永続化システムのエクスポート
 */

// 型定義
export * from "./types";

// フィンガープリント生成
export {
  generateFingerprint,
  calculateSimilarity,
  areSimilar,
  normalizeContent,
  extractKeywords,
  detectCategory,
  detectPatternType,
  generateHash,
} from "./comment-fingerprint";

// 履歴管理
export {
  findSimilarFingerprint,
  recordCommentOccurrence,
  markAsResolved,
  processUserAction,
  getCommentHistory,
  getCommentHistoryStats,
  calculateProgressiveSeverity,
  cleanupExpiredFingerprints,
} from "./comment-history-store";

// 重複排除
export {
  deduplicateComments,
  formatDeduplicationSummary,
  isDuplicate,
  getDuplicateInfo,
} from "./deduplication-engine";
