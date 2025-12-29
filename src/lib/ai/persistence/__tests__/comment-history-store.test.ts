/**
 * Phase 1: Comment History Store Tests
 *
 * 履歴管理の機能要件テスト
 * - フィンガープリントの保存・更新
 * - コメント発生記録
 * - 進行型重要度計算
 * - 解決状態の追跡
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findSimilarFingerprint,
  recordCommentOccurrence,
  markAsResolved,
  processUserAction,
  getCommentHistory,
  getCommentHistoryStats,
  calculateProgressiveSeverity,
  cleanupExpiredFingerprints,
} from "../comment-history-store";

// Prismaのモック
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commentFingerprint: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    commentOccurrence: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    commentResolution: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

describe("findSimilarFingerprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完全一致するフィンガープリントを見つける", async () => {
    const mockFingerprint = {
      id: "fp-1",
      repositoryId: "repo-1",
      fingerprint: "abc123",
      occurrenceCount: 3,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "SQL Injection vulnerability" }],
    };

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(
      mockFingerprint as never
    );

    const result = await findSimilarFingerprint(
      "repo-1",
      "SQL Injection vulnerability"
    );

    expect(result).not.toBeNull();
    expect(result?.score).toBe(1.0);
    expect(result?.fingerprintId).toBe("fp-1");
    expect(result?.occurrenceCount).toBe(3);
  });

  it("類似するフィンガープリントを見つける", async () => {
    // 完全一致なし
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);

    // 類似候補
    const mockCandidates = [
      {
        id: "fp-2",
        repositoryId: "repo-1",
        fingerprint: "def456",
        category: "security",
        patternType: "sql_injection",
        occurrenceCount: 2,
        lastSeenAt: new Date(),
        resolvedAt: null,
        userAcknowledged: false,
        occurrences: [{ commentBody: "SQL Injection risk in query" }],
      },
    ];

    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue(
      mockCandidates as never
    );

    const result = await findSimilarFingerprint(
      "repo-1",
      "SQL Injection vulnerability in database query",
      0.5 // 低い閾値
    );

    expect(result).not.toBeNull();
    expect(result?.fingerprintId).toBe("fp-2");
    expect(result?.score).toBeGreaterThan(0.5);
  });

  it("類似するフィンガープリントがない場合はnullを返す", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await findSimilarFingerprint(
      "repo-1",
      "Completely unique comment"
    );

    expect(result).toBeNull();
  });

  it("解決済みフィンガープリントの状態を正しく返す", async () => {
    const mockFingerprint = {
      id: "fp-3",
      repositoryId: "repo-1",
      fingerprint: "ghi789",
      occurrenceCount: 5,
      lastSeenAt: new Date(),
      resolvedAt: new Date(),
      userAcknowledged: false,
      occurrences: [{ commentBody: "Fixed issue" }],
    };

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(
      mockFingerprint as never
    );

    const result = await findSimilarFingerprint("repo-1", "Fixed issue");

    expect(result?.isResolved).toBe(true);
  });

  it("認識済みフィンガープリントの状態を正しく返す", async () => {
    const mockFingerprint = {
      id: "fp-4",
      repositoryId: "repo-1",
      fingerprint: "jkl012",
      occurrenceCount: 2,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: true,
      occurrences: [{ commentBody: "Acknowledged issue" }],
    };

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(
      mockFingerprint as never
    );

    const result = await findSimilarFingerprint("repo-1", "Acknowledged issue");

    expect(result?.isAcknowledged).toBe(true);
  });
});

describe("recordCommentOccurrence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("新しいフィンガープリントを作成する", async () => {
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
      filePath: "src/index.ts",
      lineNumber: 42,
      commentBody: "New SQL Injection vulnerability",
    });

    expect(result.isNewFingerprint).toBe(true);
    expect(result.previousOccurrenceCount).toBe(0);
    expect(result.wasReintroduced).toBe(false);
    expect(prisma.commentFingerprint.create).toHaveBeenCalled();
  });

  it("既存のフィンガープリントを更新する", async () => {
    const existingFp = {
      id: "existing-fp-1",
      occurrenceCount: 3,
      resolvedAt: null,
    };

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(
      existingFp as never
    );
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);
    vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
      id: "occ-2",
    } as never);

    const result = await recordCommentOccurrence({
      repositoryId: "repo-1",
      reviewId: "review-2",
      filePath: "src/index.ts",
      lineNumber: 42,
      commentBody: "Existing issue",
    });

    expect(result.isNewFingerprint).toBe(false);
    expect(result.previousOccurrenceCount).toBe(3);
    expect(prisma.commentFingerprint.update).toHaveBeenCalled();
  });

  it("解決済みの問題が再発した場合を検出する", async () => {
    const resolvedFp = {
      id: "resolved-fp-1",
      occurrenceCount: 2,
      resolvedAt: new Date("2024-01-01"),
    };

    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(
      resolvedFp as never
    );
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);
    vi.mocked(prisma.commentOccurrence.create).mockResolvedValue({
      id: "occ-3",
    } as never);

    const result = await recordCommentOccurrence({
      repositoryId: "repo-1",
      reviewId: "review-3",
      filePath: "src/index.ts",
      lineNumber: 42,
      commentBody: "Reintroduced issue",
    });

    expect(result.wasReintroduced).toBe(true);
  });
});

describe("markAsResolved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("フィンガープリントを解決済みとしてマークする", async () => {
    vi.mocked(prisma.commentResolution.create).mockResolvedValue({} as never);
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);

    await markAsResolved({
      fingerprintId: "fp-1",
      pullRequestId: "pr-1",
      resolutionType: "FIXED",
      commitSha: "abc123",
    });

    expect(prisma.commentResolution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fingerprintId: "fp-1",
        resolutionType: "FIXED",
      }),
    });
    expect(prisma.commentFingerprint.update).toHaveBeenCalled();
  });

  it("ACKNOWLEDGEDの場合はuserAcknowledgedをtrueにする", async () => {
    vi.mocked(prisma.commentResolution.create).mockResolvedValue({} as never);
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);

    await markAsResolved({
      fingerprintId: "fp-2",
      pullRequestId: "pr-2",
      resolutionType: "ACKNOWLEDGED",
    });

    expect(prisma.commentFingerprint.update).toHaveBeenCalledWith({
      where: { id: "fp-2" },
      data: expect.objectContaining({
        userAcknowledged: true,
      }),
    });
  });
});

describe("processUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ADDRESSEDアクションを処理する", async () => {
    vi.mocked(prisma.commentOccurrence.findUnique).mockResolvedValue({
      id: "occ-1",
      fingerprintId: "fp-1",
      fingerprint: { id: "fp-1" },
    } as never);
    vi.mocked(prisma.commentOccurrence.update).mockResolvedValue({} as never);
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);

    await processUserAction({
      occurrenceId: "occ-1",
      actionType: "ADDRESSED",
    });

    expect(prisma.commentOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-1" },
      data: expect.objectContaining({
        wasAddressed: true,
      }),
    });
  });

  it("IGNOREDアクションを処理する", async () => {
    vi.mocked(prisma.commentOccurrence.findUnique).mockResolvedValue({
      id: "occ-2",
      fingerprintId: "fp-2",
      fingerprint: { id: "fp-2" },
    } as never);
    vi.mocked(prisma.commentOccurrence.update).mockResolvedValue({} as never);
    vi.mocked(prisma.commentFingerprint.update).mockResolvedValue({} as never);

    await processUserAction({
      occurrenceId: "occ-2",
      actionType: "IGNORED",
    });

    expect(prisma.commentOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-2" },
      data: expect.objectContaining({
        wasIgnored: true,
      }),
    });
  });

  it("存在しない発生IDの場合はエラーをスローする", async () => {
    vi.mocked(prisma.commentOccurrence.findUnique).mockResolvedValue(null);

    await expect(
      processUserAction({
        occurrenceId: "non-existent",
        actionType: "ADDRESSED",
      })
    ).rejects.toThrow("Occurrence not found");
  });
});

describe("calculateProgressiveSeverity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("新しいコメントはDETAILEDレベル", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    const result = await calculateProgressiveSeverity(
      "repo-1",
      "New unique comment"
    );

    expect(result.level).toBe("DETAILED");
    expect(result.recommendedFormat).toBe("full");
    expect(result.occurrenceCount).toBe(0);
  });

  it("認識済みコメントはSILENTレベル", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-1",
      occurrenceCount: 5,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: true,
      occurrences: [{ commentBody: "Acknowledged" }],
    } as never);

    const result = await calculateProgressiveSeverity("repo-1", "Acknowledged");

    expect(result.level).toBe("SILENT");
    expect(result.recommendedFormat).toBe("hidden");
  });

  it("解決済みコメントはREFERENCEレベル", async () => {
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-2",
      occurrenceCount: 3,
      lastSeenAt: new Date(),
      resolvedAt: new Date(),
      userAcknowledged: false,
      occurrences: [{ commentBody: "Resolved" }],
    } as never);

    const result = await calculateProgressiveSeverity("repo-1", "Resolved");

    expect(result.level).toBe("REFERENCE");
    expect(result.recommendedFormat).toBe("link");
  });

  it("発生回数に応じてレベルが変化する", async () => {
    // 1回目 → DETAILED (maxDetailedOccurrences = 1)
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-3",
      occurrenceCount: 0,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Issue" }],
    } as never);

    let result = await calculateProgressiveSeverity("repo-1", "Issue");
    expect(result.level).toBe("DETAILED");

    // 2回目 → SUMMARY (maxSummaryOccurrences = 3)
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-3",
      occurrenceCount: 1,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Issue" }],
    } as never);

    result = await calculateProgressiveSeverity("repo-1", "Issue");
    expect(result.level).toBe("SUMMARY");

    // 5回目 → REFERENCE
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-3",
      occurrenceCount: 5,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Issue" }],
    } as never);

    result = await calculateProgressiveSeverity("repo-1", "Issue");
    expect(result.level).toBe("REFERENCE");

    // 10回以上 → SILENT
    vi.mocked(prisma.commentFingerprint.findFirst).mockResolvedValue({
      id: "fp-3",
      occurrenceCount: 10,
      lastSeenAt: new Date(),
      resolvedAt: null,
      userAcknowledged: false,
      occurrences: [{ commentBody: "Issue" }],
    } as never);

    result = await calculateProgressiveSeverity("repo-1", "Issue");
    expect(result.level).toBe("SILENT");
  });
});

describe("getCommentHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("履歴を取得する", async () => {
    const mockData = [
      {
        id: "fp-1",
        fingerprint: "abc123",
        category: "security",
        patternType: "sql_injection",
        occurrenceCount: 3,
        firstSeenAt: new Date("2024-01-01"),
        lastSeenAt: new Date("2024-01-15"),
        resolvedAt: null,
        userAcknowledged: false,
        ignoredAt: null,
        occurrences: [
          {
            filePath: "src/index.ts",
            lineNumber: 42,
            reviewId: "review-1",
            commentBody: "SQL Injection",
            createdAt: new Date(),
          },
        ],
      },
    ];

    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue(
      mockData as never
    );

    const result = await getCommentHistory({ repositoryId: "repo-1" });

    expect(result).toHaveLength(1);
    expect(result[0].fingerprintId).toBe("fp-1");
    expect(result[0].category).toBe("security");
    expect(result[0].occurrenceCount).toBe(3);
  });

  it("カテゴリでフィルタできる", async () => {
    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([]);

    await getCommentHistory({
      repositoryId: "repo-1",
      category: "security",
    });

    expect(prisma.commentFingerprint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: "security",
        }),
      })
    );
  });
});

describe("getCommentHistoryStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("統計を取得する", async () => {
    vi.mocked(prisma.commentFingerprint.count)
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(6) // resolved
      .mockResolvedValueOnce(2) // acknowledged
      .mockResolvedValueOnce(1); // ignored

    vi.mocked(prisma.commentFingerprint.groupBy).mockResolvedValue([
      { category: "security", _count: { id: 5 } },
      { category: "performance", _count: { id: 3 } },
      { category: "style", _count: { id: 2 } },
    ] as never);

    vi.mocked(prisma.commentFingerprint.findMany).mockResolvedValue([
      { id: "fp-1", category: "security", occurrenceCount: 10 },
      { id: "fp-2", category: "performance", occurrenceCount: 8 },
    ] as never);

    const result = await getCommentHistoryStats("repo-1");

    expect(result.totalFingerprints).toBe(10);
    expect(result.resolvedCount).toBe(6);
    expect(result.unresolvedCount).toBe(4);
    expect(result.acknowledgedCount).toBe(2);
    expect(result.ignoredCount).toBe(1);
    expect(result.byCategory.security).toBe(5);
    expect(result.topRecurringIssues).toHaveLength(2);
  });
});

describe("cleanupExpiredFingerprints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("期限切れのフィンガープリントを削除する", async () => {
    vi.mocked(prisma.commentFingerprint.deleteMany).mockResolvedValue({
      count: 5,
    } as never);

    const result = await cleanupExpiredFingerprints("repo-1", 90);

    expect(result).toBe(5);
    expect(prisma.commentFingerprint.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        repositoryId: "repo-1",
        resolvedAt: { not: null },
      }),
    });
  });
});
