/**
 * Phase 7: Draft Handler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDraftPRInfo,
  handleDraftStateChange,
  decideReviewAction,
  markDraftReviewed,
  markReadyReviewed,
  updateDraftStatus,
  isDraftReviewEnabled,
  getDefaultDraftReviewDepth,
  hasTransitionedFromDraft,
  needsDraftDiffComparison,
  type DraftPRInfo,
} from "../draft-handler";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pullRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";

const mockPrisma = prisma as unknown as {
  pullRequest: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("draft-handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ========================================
  // getDraftPRInfo
  // ========================================

  describe("getDraftPRInfo", () => {
    it("should return draft PR info from database", async () => {
      const mockPR = {
        id: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: true,
        headSha: "head123",
        draftReviewedAt: new Date("2024-01-01"),
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: "abc123",
      };

      mockPrisma.pullRequest.findFirst.mockResolvedValue(mockPR);

      const result = await getDraftPRInfo("repo-1", 1);

      expect(result).toEqual({
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: true,
        headSha: "head123",
        draftReviewedAt: mockPR.draftReviewedAt,
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: "abc123",
      });
    });

    it("should return null if PR not found", async () => {
      mockPrisma.pullRequest.findFirst.mockResolvedValue(null);

      const result = await getDraftPRInfo("repo-1", 1);

      expect(result).toBeNull();
    });

    it("should query with correct parameters", async () => {
      mockPrisma.pullRequest.findFirst.mockResolvedValue(null);

      await getDraftPRInfo("repo-123", 42);

      expect(mockPrisma.pullRequest.findFirst).toHaveBeenCalledWith({
        where: {
          repositoryId: "repo-123",
          number: 42,
        },
        select: {
          id: true,
          repositoryId: true,
          number: true,
          isDraft: true,
          headSha: true,
          draftCommitSha: true,
          draftReviewedAt: true,
          readyReviewedAt: true,
          markedReadyAt: true,
        },
      });
    });
  });

  // ========================================
  // handleDraftStateChange
  // ========================================

  describe("handleDraftStateChange", () => {
    it("should handle ready_for_review transition", async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        isDraft: true,
        draftCommitSha: "draft123",
        headSha: "head123",
        draftReviewedAt: new Date("2024-01-01"),
      });
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      const result = await handleDraftStateChange("pr-1", false, "ready123");

      expect(result.type).toBe("ready_for_review");
      expect(result.wasDraft).toBe(true);
      expect(result.draftCommitSha).toBe("draft123");
      expect(result.currentCommitSha).toBe("ready123");
    });

    it("should handle converted_to_draft transition", async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        isDraft: false,
        draftCommitSha: null,
        headSha: "head123",
        draftReviewedAt: null,
      });
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      const result = await handleDraftStateChange("pr-1", true, "draft123");

      expect(result.type).toBe("converted_to_draft");
      expect(result.wasDraft).toBe(false);
      expect(result.currentCommitSha).toBe("draft123");
    });

    it("should throw error if PR not found", async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(
        handleDraftStateChange("pr-1", true, "abc123")
      ).rejects.toThrow("PullRequest not found");
    });

    it("should update database when converting to draft", async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        isDraft: false,
        draftCommitSha: null,
        headSha: "head123",
        draftReviewedAt: null,
      });
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await handleDraftStateChange("pr-1", true, "draft123");

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          isDraft: true,
          draftCommitSha: "draft123",
        },
      });
    });

    it("should update database when ready for review", async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        isDraft: true,
        draftCommitSha: "draft123",
        headSha: "head123",
        draftReviewedAt: null,
      });
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await handleDraftStateChange("pr-1", false, "ready123");

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          isDraft: false,
          markedReadyAt: expect.any(Date),
        },
      });
    });
  });

  // ========================================
  // decideReviewAction
  // ========================================

  describe("decideReviewAction", () => {
    it("should return light review for draft PR when enabled", () => {
      const result = decideReviewAction(true, true);

      expect(result.shouldReview).toBe(true);
      expect(result.reviewDepth).toBe("LIGHT");
    });

    it("should return full review for ready PR", () => {
      const result = decideReviewAction(false, true);

      expect(result.shouldReview).toBe(true);
      expect(result.reviewDepth).toBe("FULL");
    });

    it("should skip review when draft review is disabled", () => {
      const result = decideReviewAction(true, false);

      expect(result.shouldReview).toBe(false);
      expect(result.skipReason).toContain("disabled");
    });

    it("should include draft diff info when transitioned from draft", () => {
      const prInfo: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "head123",
        draftCommitSha: "draft123",
        markedReadyAt: new Date(),
      };

      const result = decideReviewAction(false, true, prInfo);

      expect(result.shouldReview).toBe(true);
      expect(result.reviewDepth).toBe("FULL");
      expect(result.info?.includeDraftDiff).toBe(true);
      expect(result.info?.draftCommitSha).toBe("draft123");
    });
  });

  // ========================================
  // markDraftReviewed
  // ========================================

  describe("markDraftReviewed", () => {
    it("should update draft review timestamp", async () => {
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await markDraftReviewed("pr-1", "abc123");

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          draftReviewedAt: expect.any(Date),
          draftCommitSha: "abc123",
        },
      });
    });
  });

  // ========================================
  // markReadyReviewed
  // ========================================

  describe("markReadyReviewed", () => {
    it("should update ready review timestamp", async () => {
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await markReadyReviewed("pr-1");

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          readyReviewedAt: expect.any(Date),
        },
      });
    });
  });

  // ========================================
  // updateDraftStatus
  // ========================================

  describe("updateDraftStatus", () => {
    it("should update draft status to true with commit SHA", async () => {
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await updateDraftStatus("pr-1", true, "abc123");

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          isDraft: true,
          draftCommitSha: "abc123",
        },
      });
    });

    it("should update draft status to false with markedReadyAt", async () => {
      mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" });

      await updateDraftStatus("pr-1", false);

      expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          isDraft: false,
          markedReadyAt: expect.any(Date),
        },
      });
    });
  });

  // ========================================
  // isDraftReviewEnabled
  // ========================================

  describe("isDraftReviewEnabled", () => {
    it("should return false by default", () => {
      expect(isDraftReviewEnabled()).toBe(false);
    });

    it("should return false when disabled", () => {
      vi.stubEnv("DRAFT_PR_REVIEW_ENABLED", "false");
      expect(isDraftReviewEnabled()).toBe(false);
    });

    it("should return true when enabled", () => {
      vi.stubEnv("DRAFT_PR_REVIEW_ENABLED", "true");
      expect(isDraftReviewEnabled()).toBe(true);
    });
  });

  // ========================================
  // getDefaultDraftReviewDepth
  // ========================================

  describe("getDefaultDraftReviewDepth", () => {
    it("should return LIGHT by default", () => {
      expect(getDefaultDraftReviewDepth()).toBe("LIGHT");
    });

    it("should return FULL when configured", () => {
      vi.stubEnv("DRAFT_REVIEW_DEPTH", "full");
      expect(getDefaultDraftReviewDepth()).toBe("FULL");
    });

    it("should return LIGHT when explicitly configured", () => {
      vi.stubEnv("DRAFT_REVIEW_DEPTH", "light");
      expect(getDefaultDraftReviewDepth()).toBe("LIGHT");
    });
  });

  // ========================================
  // hasTransitionedFromDraft
  // ========================================

  describe("hasTransitionedFromDraft", () => {
    it("should return true if not draft and has markedReadyAt", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "head123",
        draftReviewedAt: new Date(),
        readyReviewedAt: null,
        markedReadyAt: new Date(),
        draftCommitSha: "abc123",
      };

      expect(hasTransitionedFromDraft(info)).toBe(true);
    });

    it("should return false if no markedReadyAt", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "head123",
        draftReviewedAt: null,
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: null,
      };

      expect(hasTransitionedFromDraft(info)).toBe(false);
    });

    it("should return false if still draft", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: true,
        headSha: "head123",
        draftReviewedAt: new Date(),
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: "abc123",
      };

      expect(hasTransitionedFromDraft(info)).toBe(false);
    });
  });

  // ========================================
  // needsDraftDiffComparison
  // ========================================

  describe("needsDraftDiffComparison", () => {
    it("should return true if transitioned and has different commits", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "def456",
        draftReviewedAt: new Date(),
        readyReviewedAt: null,
        markedReadyAt: new Date(),
        draftCommitSha: "abc123",
      };

      expect(needsDraftDiffComparison(info)).toBe(true);
    });

    it("should return false if same commit", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "abc123",
        draftReviewedAt: new Date(),
        readyReviewedAt: null,
        markedReadyAt: new Date(),
        draftCommitSha: "abc123",
      };

      expect(needsDraftDiffComparison(info)).toBe(false);
    });

    it("should return false if no draft commit", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: false,
        headSha: "abc123",
        draftReviewedAt: null,
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: null,
      };

      expect(needsDraftDiffComparison(info)).toBe(false);
    });

    it("should return false if still draft", () => {
      const info: DraftPRInfo = {
        pullRequestId: "pr-1",
        repositoryId: "repo-1",
        number: 1,
        isDraft: true,
        headSha: "def456",
        draftReviewedAt: new Date(),
        readyReviewedAt: null,
        markedReadyAt: null,
        draftCommitSha: "abc123",
      };

      expect(needsDraftDiffComparison(info)).toBe(false);
    });
  });
});
