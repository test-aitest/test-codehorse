/**
 * Review PR Integration Tests
 *
 * クロスPR重複排除とコメント永続化の統合テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deduplicateComments,
  recordCommentOccurrence,
  formatDeduplicationSummary,
  type DeduplicationComment,
} from "@/lib/ai/persistence";

// Prismaのモック
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commentFingerprint: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    commentOccurrence: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("クロスPR重複排除統合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AIレビュー結果のフィルタリング", () => {
    it("重複コメントを除外してオリジナルのみを返す", async () => {
      // 履歴に類似なし
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

      const comments: DeduplicationComment[] = [
        {
          tempId: "comment-0",
          body: "SQL Injection vulnerability detected in query",
          filePath: "src/db.ts",
          lineNumber: 42,
          severity: "CRITICAL",
        },
        {
          tempId: "comment-1",
          body: "SQL Injection vulnerability detected in query", // 重複
          filePath: "src/api.ts",
          lineNumber: 100,
          severity: "CRITICAL",
        },
        {
          tempId: "comment-2",
          body: "Consider adding error handling here",
          filePath: "src/handler.ts",
          lineNumber: 50,
          severity: "INFO",
        },
      ];

      const result = await deduplicateComments({
        repositoryId: "repo-1",
        comments,
        similarityThreshold: 0.85,
      });

      // 重複1件が除外される
      expect(result.originalComments).toHaveLength(2);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].tempId).toBe("comment-1");

      // サマリーが正しくフォーマットされる
      const summary = formatDeduplicationSummary(result);
      expect(summary).toContain("重複: 1件");
    });

    it("履歴から重複を検出して除外する", async () => {
      // 履歴に類似あり（最近報告された）
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 1);

      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
        id: "existing-fp",
        occurrenceCount: 3,
        lastSeenAt: recentDate,
        resolvedAt: null,
        userAcknowledged: false,
        occurrences: [{ commentBody: "Missing error handling" }],
      } as never);
      vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

      const comments: DeduplicationComment[] = [
        {
          tempId: "comment-0",
          body: "Missing error handling in async function",
          filePath: "src/service.ts",
          lineNumber: 25,
          severity: "IMPORTANT",
        },
      ];

      const result = await deduplicateComments({
        repositoryId: "repo-1",
        comments,
      });

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].reason).toBe("RECENTLY_REPORTED");
    });

    it("解決済みのコメントを重複として扱う", async () => {
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
        id: "resolved-fp",
        occurrenceCount: 2,
        lastSeenAt: new Date(),
        resolvedAt: new Date(),
        userAcknowledged: false,
        occurrences: [{ commentBody: "Fixed issue" }],
      } as never);
      vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

      const result = await deduplicateComments({
        repositoryId: "repo-1",
        comments: [
          {
            tempId: "comment-0",
            body: "Fixed issue in previous PR",
            filePath: "src/fix.ts",
            lineNumber: 10,
          },
        ],
        includeResolved: false,
      });

      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].reason).toBe("RESOLVED_ISSUE");
    });
  });

  describe("コメント発生の記録", () => {
    it("新しいコメントをフィンガープリントとして記録する", async () => {
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.commentFingerprint.create).mockResolvedValue({
        id: "new-fp-1",
      } as never);
      vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
        id: "occ-1",
      } as never);

      const result = await recordCommentOccurrence({
        repositoryId: "repo-1",
        reviewId: "review-1",
        pullRequestId: "pr-1",
        filePath: "src/new-file.ts",
        lineNumber: 100,
        commentBody: "New unique issue found",
        severity: "IMPORTANT",
      });

      expect(result.isNewFingerprint).toBe(true);
      expect(result.previousOccurrenceCount).toBe(0);
      expect(prisma.commentFingerprint.create).toHaveBeenCalled();
    });

    it("既存のフィンガープリントを更新する", async () => {
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
        id: "existing-fp",
        occurrenceCount: 5,
        resolvedAt: null,
      } as never);
      vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);
      vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
        id: "occ-2",
      } as never);

      const result = await recordCommentOccurrence({
        repositoryId: "repo-1",
        reviewId: "review-2",
        filePath: "src/existing.ts",
        lineNumber: 50,
        commentBody: "Existing issue recurring",
      });

      expect(result.isNewFingerprint).toBe(false);
      expect(result.previousOccurrenceCount).toBe(5);
      expect(prisma.commentFingerprint.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-fp" },
          data: expect.objectContaining({
            occurrenceCount: 6,
          }),
        })
      );
    });

    it("解決済みの問題が再発した場合を検出する", async () => {
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
        id: "resolved-fp",
        occurrenceCount: 3,
        resolvedAt: new Date("2024-01-01"),
      } as never);
      vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);
      vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
        id: "occ-3",
      } as never);

      const result = await recordCommentOccurrence({
        repositoryId: "repo-1",
        reviewId: "review-3",
        filePath: "src/reintroduced.ts",
        lineNumber: 75,
        commentBody: "Previously fixed issue reappearing",
      });

      expect(result.wasReintroduced).toBe(true);
    });
  });

  describe("レビューフローの統合シナリオ", () => {
    it("完全なレビューフロー: AIレビュー → 重複排除 → 記録", async () => {
      // Step 1: AIレビューの模擬結果
      const aiReviewComments: DeduplicationComment[] = [
        {
          tempId: "comment-0",
          body: "Critical security issue: SQL injection vulnerability",
          filePath: "src/api/users.ts",
          lineNumber: 42,
          severity: "CRITICAL",
        },
        {
          tempId: "comment-1",
          body: "Consider using async/await instead of callbacks",
          filePath: "src/services/data.ts",
          lineNumber: 88,
          severity: "INFO",
        },
        {
          tempId: "comment-2",
          body: "Critical security issue: SQL injection vulnerability", // 重複
          filePath: "src/api/orders.ts",
          lineNumber: 55,
          severity: "CRITICAL",
        },
      ];

      // Step 2: 重複排除
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

      const dedupResult = await deduplicateComments({
        repositoryId: "repo-1",
        comments: aiReviewComments,
        similarityThreshold: 0.85,
      });

      // バッチ内重複が検出される
      expect(dedupResult.originalComments).toHaveLength(2);
      expect(dedupResult.duplicates).toHaveLength(1);

      // Step 3: オリジナルコメントの記録
      vi.mocked(prisma.commentFingerprint.create).mockResolvedValue({
        id: "fp-new",
      } as never);
      vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
        id: "occ-new",
      } as never);

      for (const comment of dedupResult.originalComments) {
        const recordResult = await recordCommentOccurrence({
          repositoryId: "repo-1",
          reviewId: "review-1",
          filePath: comment.filePath,
          lineNumber: comment.lineNumber,
          commentBody: comment.body,
          severity: comment.severity,
        });

        expect(recordResult.isNewFingerprint).toBe(true);
      }

      // 2つのコメントが記録された
      expect(prisma.commentFingerprint.create).toHaveBeenCalledTimes(2);
    });

    it("増分レビューでの履歴活用", async () => {
      // 前回のレビューで記録されたコメント
      vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
        id: "previous-fp",
        occurrenceCount: 1,
        lastSeenAt: new Date(),
        resolvedAt: null,
        userAcknowledged: false,
        occurrences: [{ commentBody: "Missing null check" }],
      } as never);
      vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

      const incrementalComments: DeduplicationComment[] = [
        {
          tempId: "inc-0",
          body: "Missing null check on user input",
          filePath: "src/input.ts",
          lineNumber: 30,
          severity: "IMPORTANT",
        },
      ];

      const result = await deduplicateComments({
        repositoryId: "repo-1",
        comments: incrementalComments,
      });

      // 履歴との重複として検出
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].duplicateOfFingerprintId).toBe("previous-fp");
    });
  });
});

describe("重複排除統計", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("統計が正しく計算される", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const comments: DeduplicationComment[] = [
      { tempId: "0", body: "Issue A", filePath: "a.ts", lineNumber: 1 },
      { tempId: "1", body: "Issue A", filePath: "b.ts", lineNumber: 2 }, // 重複
      { tempId: "2", body: "Issue B", filePath: "c.ts", lineNumber: 3 },
      { tempId: "3", body: "Issue C", filePath: "d.ts", lineNumber: 4 },
      { tempId: "4", body: "Issue C", filePath: "e.ts", lineNumber: 5 }, // 重複
    ];

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments,
    });

    expect(result.stats.totalInput).toBe(5);
    expect(result.stats.originalCount).toBe(3);
    expect(result.stats.duplicateCount).toBe(2);
    expect(result.stats.duplicateRate).toBeCloseTo(0.4, 2);
    expect(result.stats.byReason.EXACT_MATCH).toBe(2);
  });
});
