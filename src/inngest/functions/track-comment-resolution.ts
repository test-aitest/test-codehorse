/**
 * Phase 1: Track Comment Resolution
 *
 * コメント解決追跡のInngest関数
 * - コメントの解決を記録
 * - コメント発生を記録
 * - ユーザーアクションを処理
 * - 期限切れフィンガープリントのクリーンアップ
 */

import { inngest } from "../client";
import {
  markAsResolved,
  recordCommentOccurrence,
  processUserAction,
  cleanupExpiredFingerprints,
} from "@/lib/ai/persistence/comment-history-store";
import { Severity } from "@prisma/client";

/**
 * コメント解決追跡関数
 */
export const trackCommentResolution = inngest.createFunction(
  {
    id: "track-comment-resolution",
    retries: 3,
  },
  { event: "comment/track-resolution" },
  async ({ event, step }) => {
    const { pullRequestId, fingerprintId, resolutionType, commitSha } =
      event.data;

    // 解決を記録
    await step.run("mark-as-resolved", async () => {
      await markAsResolved({
        fingerprintId,
        pullRequestId,
        resolutionType,
        commitSha,
      });
    });

    return {
      success: true,
      fingerprintId,
      resolutionType,
    };
  }
);

/**
 * コメント発生記録関数
 */
export const recordCommentOccurrences = inngest.createFunction(
  {
    id: "record-comment-occurrences",
    retries: 3,
  },
  { event: "comment/record-occurrence" },
  async ({ event, step }) => {
    const { repositoryId, reviewId, pullRequestId, comments } = event.data;

    // 各コメントの発生を記録
    const results = await step.run("record-occurrences", async () => {
      const occurrenceResults = [];

      for (const comment of comments) {
        // Severityの変換
        const severityMap: Record<string, Severity> = {
          CRITICAL: Severity.CRITICAL,
          IMPORTANT: Severity.IMPORTANT,
          INFO: Severity.INFO,
          NITPICK: Severity.NITPICK,
        };

        const result = await recordCommentOccurrence({
          repositoryId,
          reviewId,
          pullRequestId,
          filePath: comment.filePath,
          lineNumber: comment.lineNumber,
          commentBody: comment.commentBody,
          severity: comment.severity
            ? severityMap[comment.severity]
            : undefined,
          category: comment.category,
          patternType: comment.patternType,
        });

        occurrenceResults.push({
          filePath: comment.filePath,
          lineNumber: comment.lineNumber,
          occurrenceId: result.occurrenceId,
          isNewFingerprint: result.isNewFingerprint,
          previousOccurrenceCount: result.previousOccurrenceCount,
          wasReintroduced: result.wasReintroduced,
        });
      }

      return occurrenceResults;
    });

    // 統計を計算
    const stats = {
      totalComments: comments.length,
      newFingerprints: results.filter((r) => r.isNewFingerprint).length,
      existingFingerprints: results.filter((r) => !r.isNewFingerprint).length,
      reintroducedIssues: results.filter((r) => r.wasReintroduced).length,
    };

    return {
      success: true,
      stats,
      results,
    };
  }
);

/**
 * ユーザーアクション処理関数
 */
export const handleUserAction = inngest.createFunction(
  {
    id: "handle-comment-user-action",
    retries: 3,
  },
  { event: "comment/user-action" },
  async ({ event, step }) => {
    const { occurrenceId, actionType, userResponse } = event.data;

    // ユーザーアクションを処理
    await step.run("process-user-action", async () => {
      await processUserAction({
        occurrenceId,
        actionType,
        userResponse,
      });
    });

    return {
      success: true,
      occurrenceId,
      actionType,
    };
  }
);

/**
 * 期限切れフィンガープリントのクリーンアップ関数
 */
export const cleanupExpiredComments = inngest.createFunction(
  {
    id: "cleanup-expired-comments",
    retries: 3,
  },
  { event: "comment/cleanup-expired" },
  async ({ event, step }) => {
    const { repositoryId, expirationDays = 90 } = event.data;

    // repositoryIdが指定されていない場合はスキップ
    if (!repositoryId) {
      console.log("[Inngest] No repositoryId provided, skipping cleanup");
      return {
        success: true,
        skipped: true,
        reason: "No repositoryId provided",
      };
    }

    // クリーンアップを実行
    const deletedCount = await step.run("cleanup-fingerprints", async () => {
      return await cleanupExpiredFingerprints(repositoryId, expirationDays);
    });

    return {
      success: true,
      repositoryId,
      deletedCount,
      expirationDays,
    };
  }
);

/**
 * 定期的なクリーンアップ（週1回）
 */
export const scheduledCleanup = inngest.createFunction(
  {
    id: "scheduled-comment-cleanup",
  },
  { cron: "0 3 * * 0" }, // 毎週日曜日の午前3時
  async ({ step }) => {
    // TODO: すべてのアクティブなリポジトリに対してクリーンアップを実行
    // 現在は単純なログのみ
    await step.run("log-cleanup", async () => {
      console.log("Scheduled cleanup triggered at", new Date().toISOString());
      // 実際の実装では、アクティブなリポジトリを取得してクリーンアップイベントを発行
    });

    return {
      success: true,
      message: "Scheduled cleanup completed",
    };
  }
);
