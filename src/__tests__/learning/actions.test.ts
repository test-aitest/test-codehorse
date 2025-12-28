import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LearningRule, RuleType, RuleSource } from "@prisma/client";

// Define mock functions using vi.hoisted to ensure they're available during mock factory
const {
  mockRepositoryFindMany,
  mockLearningRuleFindMany,
  mockLearningRuleCount,
  mockLearningRuleGroupBy,
  mockLearningRuleCreate,
  mockLearningRuleUpdate,
  mockLearningRuleDelete,
  mockLearningRuleFindUnique,
  mockReviewFeedbackFindMany,
  mockReviewFeedbackCount,
} = vi.hoisted(() => ({
  mockRepositoryFindMany: vi.fn(),
  mockLearningRuleFindMany: vi.fn(),
  mockLearningRuleCount: vi.fn(),
  mockLearningRuleGroupBy: vi.fn(),
  mockLearningRuleCreate: vi.fn(),
  mockLearningRuleUpdate: vi.fn(),
  mockLearningRuleDelete: vi.fn(),
  mockLearningRuleFindUnique: vi.fn(),
  mockReviewFeedbackFindMany: vi.fn(),
  mockReviewFeedbackCount: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    repository: {
      findMany: mockRepositoryFindMany,
    },
    learningRule: {
      findMany: mockLearningRuleFindMany,
      count: mockLearningRuleCount,
      groupBy: mockLearningRuleGroupBy,
      create: mockLearningRuleCreate,
      update: mockLearningRuleUpdate,
      delete: mockLearningRuleDelete,
      findUnique: mockLearningRuleFindUnique,
    },
    reviewFeedback: {
      findMany: mockReviewFeedbackFindMany,
      count: mockReviewFeedbackCount,
    },
  },
}));

// Mock rule-store
vi.mock("@/lib/learning/rule-store", () => ({
  storeRule: vi.fn().mockResolvedValue({
    id: "new-rule-id",
    ruleText: "Test rule",
    ruleType: "STYLE",
    confidence: 0.95,
  }),
  deleteRule: vi.fn().mockResolvedValue(undefined),
}));

// Mock revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Import after mocks are set up
import {
  getRules,
  getRuleStats,
  createRule,
  updateRule,
  deleteRule,
  setRulePriority,
  getFeedbackHistory,
} from "@/app/(dashboard)/dashboard/learning/actions";

describe("Learning Dashboard Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepositoryFindMany.mockReset();
    mockLearningRuleFindMany.mockReset();
    mockLearningRuleCount.mockReset();
    mockLearningRuleGroupBy.mockReset();
    mockLearningRuleCreate.mockReset();
    mockLearningRuleUpdate.mockReset();
    mockLearningRuleDelete.mockReset();
    mockLearningRuleFindUnique.mockReset();
    mockReviewFeedbackFindMany.mockReset();
    mockReviewFeedbackCount.mockReset();
  });

  describe("getRules", () => {
    it("should return empty array when no installations found", async () => {
      mockRepositoryFindMany.mockResolvedValue([]);

      const result = await getRules();

      expect(result).toEqual([]);
    });

    it("should return rules for accessible installations", async () => {
      const mockRules: LearningRule[] = [
        {
          id: "rule-1",
          installationId: 123,
          repositoryId: null,
          ruleText: "Always use const",
          ruleType: "STYLE" as RuleType,
          source: "EXPLICIT" as RuleSource,
          language: "typescript",
          category: "variables",
          confidence: 0.9,
          usageCount: 5,
          lastUsedAt: new Date(),
          pineconeId: "pinecone-1",
          feedbackId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123 },
      ]);
      mockLearningRuleFindMany.mockResolvedValue(mockRules);

      const result = await getRules();

      expect(result).toEqual(mockRules);
      expect(mockLearningRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            installationId: { in: [123] },
          },
        })
      );
    });

    it("should filter by ruleType when provided", async () => {
      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123 },
      ]);
      mockLearningRuleFindMany.mockResolvedValue([]);

      await getRules({ ruleType: "SECURITY" });

      expect(mockLearningRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ruleType: "SECURITY",
          }),
        })
      );
    });

    it("should filter by language when provided", async () => {
      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123 },
      ]);
      mockLearningRuleFindMany.mockResolvedValue([]);

      await getRules({ language: "python" });

      expect(mockLearningRuleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            language: "python",
          }),
        })
      );
    });
  });

  describe("getRuleStats", () => {
    it("should return zero stats when no installations found", async () => {
      mockRepositoryFindMany.mockResolvedValue([]);

      const result = await getRuleStats();

      expect(result).toEqual({
        totalRules: 0,
        activeRules: 0,
        lowConfidenceRules: 0,
        recentlyUsedRules: 0,
        byType: {},
        bySource: {},
      });
    });

    it("should return aggregated stats", async () => {
      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123 },
      ]);
      mockLearningRuleCount
        .mockResolvedValueOnce(10) // totalRules
        .mockResolvedValueOnce(8) // activeRules
        .mockResolvedValueOnce(2) // lowConfidenceRules
        .mockResolvedValueOnce(5); // recentlyUsedRules
      mockLearningRuleGroupBy
        .mockResolvedValueOnce([
          { ruleType: "STYLE", _count: 5 },
          { ruleType: "SECURITY", _count: 3 },
        ])
        .mockResolvedValueOnce([
          { source: "EXPLICIT", _count: 6 },
          { source: "IMPLICIT", _count: 4 },
        ]);

      const result = await getRuleStats();

      expect(result.totalRules).toBe(10);
      expect(result.activeRules).toBe(8);
      expect(result.lowConfidenceRules).toBe(2);
      expect(result.recentlyUsedRules).toBe(5);
      expect(result.byType).toEqual({ STYLE: 5, SECURITY: 3 });
      expect(result.bySource).toEqual({ EXPLICIT: 6, IMPLICIT: 4 });
    });
  });

  describe("createRule", () => {
    it("should return error when no installation found", async () => {
      mockRepositoryFindMany.mockResolvedValue([]);

      const result = await createRule({
        ruleText: "Test rule text here",
        ruleType: "STYLE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No installation found");
    });

    it("should create rule successfully", async () => {
      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123 },
      ]);

      const result = await createRule({
        ruleText: "Always use const for immutable variables",
        ruleType: "STYLE",
        language: "typescript",
      });

      expect(result.success).toBe(true);
      expect(result.rule).toBeDefined();
    });
  });

  describe("updateRule", () => {
    it("should update rule successfully", async () => {
      mockLearningRuleUpdate.mockResolvedValue({
        id: "rule-1",
        ruleText: "Updated rule text",
      });

      const result = await updateRule("rule-1", {
        ruleText: "Updated rule text",
      });

      expect(result.success).toBe(true);
      expect(mockLearningRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rule-1" },
          data: expect.objectContaining({
            ruleText: "Updated rule text",
          }),
        })
      );
    });

    it("should handle update error", async () => {
      mockLearningRuleUpdate.mockRejectedValue(
        new Error("Database error")
      );

      const result = await updateRule("rule-1", {
        ruleText: "Updated rule text",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database error");
    });
  });

  describe("deleteRule", () => {
    it("should delete rule successfully", async () => {
      const result = await deleteRule("rule-1");

      expect(result.success).toBe(true);
    });
  });

  describe("setRulePriority", () => {
    it("should set high priority (confidence = 0.95)", async () => {
      mockLearningRuleUpdate.mockResolvedValue({});

      const result = await setRulePriority("rule-1", "high");

      expect(result.success).toBe(true);
      expect(mockLearningRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rule-1" },
          data: expect.objectContaining({
            confidence: 0.95,
          }),
        })
      );
    });

    it("should set normal priority (confidence = 0.75)", async () => {
      mockLearningRuleUpdate.mockResolvedValue({});

      const result = await setRulePriority("rule-1", "normal");

      expect(result.success).toBe(true);
      expect(mockLearningRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidence: 0.75,
          }),
        })
      );
    });

    it("should set low priority (confidence = 0.5)", async () => {
      mockLearningRuleUpdate.mockResolvedValue({});

      const result = await setRulePriority("rule-1", "low");

      expect(result.success).toBe(true);
      expect(mockLearningRuleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confidence: 0.5,
          }),
        })
      );
    });
  });

  describe("getFeedbackHistory", () => {
    it("should return empty when no installations found", async () => {
      mockRepositoryFindMany.mockResolvedValue([]);

      const result = await getFeedbackHistory();

      expect(result).toEqual({ feedbacks: [], total: 0 });
    });

    it("should return feedbacks with extracted rules", async () => {
      mockRepositoryFindMany.mockResolvedValue([
        { installationId: 123, id: "repo-1" },
      ]);
      mockReviewFeedbackFindMany.mockResolvedValue([
        {
          id: "feedback-1",
          type: "INLINE_COMMENT",
          userAction: "REJECTED",
          aiSuggestion: "Use let instead of const",
          userCode: null,
          filePath: "src/index.ts",
          language: "typescript",
          createdAt: new Date(),
          processedAt: new Date(),
          extractedRules: [{ id: "rule-1", ruleText: "Prefer const" }],
        },
      ]);
      mockReviewFeedbackCount.mockResolvedValue(1);

      const result = await getFeedbackHistory();

      expect(result.feedbacks).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.feedbacks[0].extractedRules).toHaveLength(1);
    });
  });
});
