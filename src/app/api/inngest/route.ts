import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  reviewPR,
  reviewPRIncremental,
  indexRepositoryJob,
  incrementalIndexJob,
  indexOnInstallJob,
  deleteIndexJob,
  chatResponseJob,
  // Phase 4: テスト生成
  generateTestsForPR,
  // Phase 5: ドキュメント分析
  analyzeDocumentationForPR,
  // Phase 8: パフォーマンス分析
  analyzePerformanceForPR,
  // Phase 9: CI失敗分析
  analyzeCIFailure,
  handleCheckRunCompleted,
  // Phase 10: セキュリティスキャン
  scanSecurityForPR,
  // Phase 1: コメント永続化
  trackCommentResolution,
  recordCommentOccurrences,
  handleUserAction,
  cleanupExpiredComments,
  scheduledCleanup,
  // LeetCode最適解提案
  leetcodeSolutionSubmitted,
  onUserBenchmarkCompleted,
  onAllBenchmarksCompleted,
} from "@/inngest/functions";

// Inngest サーバーハンドラーを作成
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Core functions
    reviewPR,
    reviewPRIncremental,
    indexRepositoryJob,
    incrementalIndexJob,
    indexOnInstallJob,
    deleteIndexJob,
    chatResponseJob,
    // Phase 1: コメント永続化
    trackCommentResolution,
    recordCommentOccurrences,
    handleUserAction,
    cleanupExpiredComments,
    scheduledCleanup,
    // Phase 4: テスト生成
    generateTestsForPR,
    // Phase 5: ドキュメント分析
    analyzeDocumentationForPR,
    // Phase 8: パフォーマンス分析
    analyzePerformanceForPR,
    // Phase 9: CI失敗分析
    analyzeCIFailure,
    handleCheckRunCompleted,
    // Phase 10: セキュリティスキャン
    scanSecurityForPR,
    // LeetCode最適解提案
    leetcodeSolutionSubmitted,
    onUserBenchmarkCompleted,
    onAllBenchmarksCompleted,
  ],
});
