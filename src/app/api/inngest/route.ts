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
  generateTestsForPR,
  analyzeDocumentationForPR,
  analyzePerformanceForPR,
  analyzeCIFailure,
  handleCheckRunCompleted,
  scanSecurityForPR,
  trackCommentResolution,
  recordCommentOccurrences,
  handleUserAction,
  cleanupExpiredComments,
  scheduledCleanup,
} from "@/inngest/functions";

// Inngest サーバーハンドラーを作成
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Core review functions
    reviewPR,
    reviewPRIncremental,
    // Indexing functions
    indexRepositoryJob,
    incrementalIndexJob,
    indexOnInstallJob,
    deleteIndexJob,
    // Chat
    chatResponseJob,
    // Phase 4: Test generation
    generateTestsForPR,
    // Phase 5: Documentation analysis
    analyzeDocumentationForPR,
    // Phase 8: Performance analysis
    analyzePerformanceForPR,
    // Phase 9: CI failure analysis
    analyzeCIFailure,
    handleCheckRunCompleted,
    // Phase 10: Security scan
    scanSecurityForPR,
    // Phase 1: Comment persistence
    trackCommentResolution,
    recordCommentOccurrences,
    handleUserAction,
    cleanupExpiredComments,
    scheduledCleanup,
  ],
});
