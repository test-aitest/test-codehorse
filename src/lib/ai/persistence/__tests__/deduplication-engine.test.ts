/**
 * Phase 1: Deduplication Engine Tests
 *
 * 重複排除エンジンの機能要件テスト
 * - バッチ内重複検出
 * - 履歴との重複検出
 * - 重複理由の分類
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deduplicateComments,
  formatDeduplicationSummary,
  isDuplicate,
  getDuplicateInfo,
} from "../deduplication-engine";

// Prismaのモック
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commentFingerprint: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("deduplicateComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("バッチ内の重複を検出する", async () => {
    // 履歴に類似なし
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "SQL Injection vulnerability detected",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
        {
          tempId: "2",
          body: "SQL Injection vulnerability detected", // 完全一致
          filePath: "src/b.ts",
          lineNumber: 20,
        },
        {
          tempId: "3",
          body: "Performance issue with N+1 query", // 異なるコメント
          filePath: "src/c.ts",
          lineNumber: 30,
        },
      ],
    });

    expect(result.originalComments).toHaveLength(2);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].tempId).toBe("2");
    expect(result.duplicates[0].reason).toBe("EXACT_MATCH");
  });

  it("履歴との重複を検出する", async () => {
    // 履歴に類似あり
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "existing-fp",
      occurrenceCount: 3,
      lastSeenAt: new Date("2024-01-01"), // 古い
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "SQL Injection in query" }],
    } as never);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);
    vi.mocked(prisma.commentFingerprint.findUnique).mockResolvedValue({
      id: "existing-fp",
      patternType: "sql_injection",
    } as never);

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "SQL Injection vulnerability in database",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
      ],
    });

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].duplicateOfFingerprintId).toBe("existing-fp");
  });

  it("解決済みコメントを除外できる", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "resolved-fp",
      occurrenceCount: 2,
      lastSeenAt: new Date(),
      resolvedAt: new Date(), // 解決済み
      userAcknowledged: false,
      occurrences: [{ commentBody: "Fixed issue" }],
    } as never);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    // includeResolved = false (デフォルト)
    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "Fixed issue",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
      ],
      includeResolved: false,
    });

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toBe("RESOLVED_ISSUE");
  });

  it("認識済みコメントを除外できる", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "ack-fp",
      occurrenceCount: 4,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: true, // 認識済み
      occurrences: [{ commentBody: "Known issue" }],
    } as never);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "Known issue",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
      ],
      includeAcknowledged: false,
    });

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toBe("ACKNOWLEDGED");
  });

  it("最近報告されたコメントを検出する", async () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 1); // 1時間前

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "recent-fp",
      occurrenceCount: 1,
      lastSeenAt: recentDate, // 最近
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Recent issue" }],
    } as never);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "Recent issue",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
      ],
    });

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].reason).toBe("RECENTLY_REPORTED");
  });

  it("統計を正しく計算する", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "SQL Injection vulnerability",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
        {
          tempId: "2",
          body: "SQL Injection vulnerability", // 重複
          filePath: "src/b.ts",
          lineNumber: 20,
        },
        {
          tempId: "3",
          body: "XSS vulnerability",
          filePath: "src/c.ts",
          lineNumber: 30,
        },
        {
          tempId: "4",
          body: "XSS vulnerability", // 重複
          filePath: "src/d.ts",
          lineNumber: 40,
        },
      ],
    });

    expect(result.stats.totalInput).toBe(4);
    expect(result.stats.originalCount).toBe(2);
    expect(result.stats.duplicateCount).toBe(2);
    expect(result.stats.duplicateRate).toBe(0.5);
    expect(result.stats.byReason.EXACT_MATCH).toBe(2);
  });

  it("類似度閾値を調整できる", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    // 高い閾値では重複なし
    const result1 = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "SQL Injection vulnerability in query",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
        {
          tempId: "2",
          body: "SQL Injection risk in database query",
          filePath: "src/b.ts",
          lineNumber: 20,
        },
      ],
      similarityThreshold: 0.99,
    });

    expect(result1.duplicates).toHaveLength(0);

    // 低い閾値では重複あり
    const result2 = await deduplicateComments({
      repositoryId: "repo-1",
      comments: [
        {
          tempId: "1",
          body: "SQL Injection vulnerability in query",
          filePath: "src/a.ts",
          lineNumber: 10,
        },
        {
          tempId: "2",
          body: "SQL Injection risk in database query",
          filePath: "src/b.ts",
          lineNumber: 20,
        },
      ],
      similarityThreshold: 0.5,
    });

    expect(result2.duplicates).toHaveLength(1);
  });
});

describe("formatDeduplicationSummary", () => {
  it("サマリを正しくフォーマットする", () => {
    const result = {
      originalComments: [],
      duplicates: [
        {
          tempId: "1",
          duplicateOfFingerprintId: "fp-1",
          similarityScore: 1.0,
          reason: "EXACT_MATCH" as const,
        },
        {
          tempId: "2",
          duplicateOfFingerprintId: "fp-2",
          similarityScore: 0.9,
          reason: "HIGH_SIMILARITY" as const,
        },
      ],
      stats: {
        totalInput: 5,
        originalCount: 3,
        duplicateCount: 2,
        duplicateRate: 0.4,
        byReason: {
          EXACT_MATCH: 1,
          HIGH_SIMILARITY: 1,
          SAME_PATTERN: 0,
          ACKNOWLEDGED: 0,
          RECENTLY_REPORTED: 0,
          RESOLVED_ISSUE: 0,
        },
      },
    };

    const summary = formatDeduplicationSummary(result);

    expect(summary).toContain("重複排除結果:");
    expect(summary).toContain("入力: 5件");
    expect(summary).toContain("オリジナル: 3件");
    expect(summary).toContain("重複: 2件");
    expect(summary).toContain("40.0%");
    expect(summary).toContain("完全一致: 1件");
    expect(summary).toContain("高類似度: 1件");
  });

  it("重複がない場合のサマリ", () => {
    const result = {
      originalComments: [],
      duplicates: [],
      stats: {
        totalInput: 3,
        originalCount: 3,
        duplicateCount: 0,
        duplicateRate: 0,
        byReason: {
          EXACT_MATCH: 0,
          HIGH_SIMILARITY: 0,
          SAME_PATTERN: 0,
          ACKNOWLEDGED: 0,
          RECENTLY_REPORTED: 0,
          RESOLVED_ISSUE: 0,
        },
      },
    };

    const summary = formatDeduplicationSummary(result);

    expect(summary).toContain("重複: 0件");
    expect(summary).not.toContain("内訳:");
  });
});

describe("isDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("重複の場合はtrueを返す", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-1",
      occurrenceCount: 2,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Existing" }],
    } as never);

    const result = await isDuplicate("repo-1", "Existing");

    expect(result).toBe(true);
  });

  it("重複でない場合はfalseを返す", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await isDuplicate("repo-1", "Unique comment");

    expect(result).toBe(false);
  });
});

describe("getDuplicateInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完全一致の重複情報を返す", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-1",
      occurrenceCount: 3,
      lastSeenAt: new Date("2024-01-01"),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Exact match" }],
    } as never);

    const result = await getDuplicateInfo("repo-1", "Exact match");

    expect(result).not.toBeNull();
    expect(result?.duplicateOfFingerprintId).toBe("fp-1");
    expect(result?.reason).toBe("EXACT_MATCH");
  });

  it("認識済みの重複情報を返す（類似度が高い場合）", async () => {
    // 完全一致(score >= 0.99)の場合はEXACT_MATCHが優先される
    // 認識済みはスコアが低い場合にのみ返される
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([{
      id: "fp-2",
      category: "security",
      patternType: "sql_injection",
      occurrenceCount: 2,
      lastSeenAt: new Date("2024-01-01"),
      resolvedAt: null,
      userAcknowledged: true,
      occurrences: [{ commentBody: "SQL Injection issue in query" }],
    }] as never);

    const result = await getDuplicateInfo("repo-1", "SQL Injection vulnerability in database", 0.5);

    expect(result).not.toBeNull();
    expect(result?.reason).toBe("ACKNOWLEDGED");
  });

  it("解決済みの重複情報を返す（類似度が高い場合）", async () => {
    // 完全一致(score >= 0.99)の場合はEXACT_MATCHが優先される
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([{
      id: "fp-3",
      category: "performance",
      patternType: "n_plus_one",
      occurrenceCount: 1,
      lastSeenAt: new Date("2024-01-01"),
      resolvedAt: new Date(),
      userAcknowledged: false,
      occurrences: [{ commentBody: "N+1 query issue detected" }],
    }] as never);

    const result = await getDuplicateInfo("repo-1", "N+1 query problem in loop", 0.5);

    expect(result).not.toBeNull();
    expect(result?.reason).toBe("RESOLVED_ISSUE");
  });

  it("完全一致の場合はEXACT_MATCHを返す（認識済みでも）", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-4",
      occurrenceCount: 3,
      lastSeenAt: new Date("2024-01-01"),
      resolvedAt: null,
      userAcknowledged: true, // 認識済みでも
      occurrences: [{ commentBody: "Exact same comment" }],
    } as never);

    const result = await getDuplicateInfo("repo-1", "Exact same comment");

    expect(result?.reason).toBe("EXACT_MATCH");
  });

  it("重複でない場合はnullを返す", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await getDuplicateInfo("repo-1", "Unique");

    expect(result).toBeNull();
  });
});
