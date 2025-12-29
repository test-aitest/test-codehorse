/**
 * Phase 6: Error Handling Module
 *
 * 開発者フレンドリーなエラーメッセージを提供するモジュール
 */

// エラーハンドラー（メインAPI）
export {
  handleError,
  handleGitHubError,
  handleWebhookError,
  handleInngestError,
  withErrorHandling,
  withApiErrorHandling,
  type ErrorHandlerOptions,
  type ErrorHandlerResult,
} from "./error-handler";

// エラー翻訳
export {
  translateError,
  translateGitHubError,
  translateAIError,
  formatErrorForUser,
  formatErrorForLog,
  formatErrorForPR,
  type TranslatedError,
  type ErrorContext,
} from "./error-translator";

// エラー追跡
export {
  trackError,
  trackGitHubError,
  getErrorStats,
  getRecentErrors,
  markErrorResolved,
  cleanupOldErrors,
  isErrorFrequent,
  getErrorRate,
  type TrackErrorOptions,
  type ErrorStats,
} from "./error-tracker";

// エラーパターン
export {
  matchErrorPattern,
  getPatternsByType,
  getPatternByCode,
  getPatternByName,
  getAllPatterns,
  getDefaultFriendlyMessage,
  getDefaultResolution,
  type ErrorPattern,
  type ErrorMatch,
} from "./error-registry";
