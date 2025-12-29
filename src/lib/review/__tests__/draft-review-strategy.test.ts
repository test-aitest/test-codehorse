/**
 * Phase 7: Draft Review Strategy Tests
 */

import { describe, it, expect } from "vitest";
import {
  getReviewStrategy,
  filterCommentsByStrategy,
  getDraftReviewPromptModifier,
  getReadyReviewPromptModifier,
  filterFilesByStrategy,
  formatReviewSummary,
  isSeverityAtLeast,
  groupCommentsByCategory,
  isHighPriorityCategory,
  getModelParametersForDepth,
  type ReviewComment,
  type ReviewStrategyOptions,
} from "../draft-review-strategy";
import type { ParsedFile } from "@/lib/diff/parser";

describe("draft-review-strategy", () => {
  // ========================================
  // getReviewStrategy
  // ========================================

  describe("getReviewStrategy", () => {
    it("should return light config for light depth", () => {
      const strategy = getReviewStrategy("LIGHT");

      expect(strategy.reviewDepth).toBe("LIGHT");
      expect(strategy.maxComments).toBe(5);
      expect(strategy.minSeverity).toBe("IMPORTANT");
      expect(strategy.includeWalkthrough).toBe(false);
    });

    it("should return full config for full depth", () => {
      const strategy = getReviewStrategy("FULL");

      expect(strategy.reviewDepth).toBe("FULL");
      expect(strategy.maxComments).toBe(50);
      expect(strategy.minSeverity).toBe("NITPICK");
      expect(strategy.includeWalkthrough).toBe(true);
    });
  });

  // ========================================
  // filterCommentsByStrategy
  // ========================================

  describe("filterCommentsByStrategy", () => {
    const comments: ReviewComment[] = [
      {
        path: "src/index.ts",
        endLine: 1,
        body: "Critical security issue",
        severity: "CRITICAL",
        category: "security",
      },
      {
        path: "src/utils.ts",
        endLine: 10,
        body: "Important performance issue",
        severity: "IMPORTANT",
        category: "performance",
      },
      {
        path: "src/helpers.ts",
        endLine: 20,
        body: "Minor info",
        severity: "INFO",
        category: "style",
      },
      {
        path: "src/types.ts",
        endLine: 30,
        body: "Nitpick about formatting",
        severity: "NITPICK",
        category: "style",
      },
    ];

    it("should filter to max comments", () => {
      const strategy: ReviewStrategyOptions = {
        reviewDepth: "LIGHT",
        maxComments: 2,
        minSeverity: "NITPICK",
      };
      const result = filterCommentsByStrategy(comments, strategy);

      expect(result.comments.length).toBeLessThanOrEqual(2);
    });

    it("should filter by minimum severity", () => {
      const strategy: ReviewStrategyOptions = {
        reviewDepth: "LIGHT",
        maxComments: 10,
        minSeverity: "IMPORTANT",
      };
      const result = filterCommentsByStrategy(comments, strategy);

      // Should include CRITICAL and IMPORTANT, exclude INFO and NITPICK
      expect(
        result.comments.every(
          (c) => c.severity === "CRITICAL" || c.severity === "IMPORTANT"
        )
      ).toBe(true);
      expect(result.comments.length).toBe(2);
    });

    it("should include all comments for full depth with nitpick min", () => {
      const strategy = getReviewStrategy("FULL");
      const result = filterCommentsByStrategy(comments, strategy);

      expect(result.comments.length).toBe(comments.length);
      expect(result.filteredCount).toBe(0);
    });

    it("should track excluded comments", () => {
      const strategy: ReviewStrategyOptions = {
        reviewDepth: "LIGHT",
        maxComments: 1,
        minSeverity: "IMPORTANT",
      };
      const result = filterCommentsByStrategy(comments, strategy);

      expect(result.filteredCount).toBeGreaterThan(0);
      expect(result.filterReasons).toBeDefined();
    });

    it("should prioritize by severity", () => {
      const strategy: ReviewStrategyOptions = {
        reviewDepth: "LIGHT",
        maxComments: 2,
        minSeverity: "NITPICK",
      };
      const result = filterCommentsByStrategy(comments, strategy);

      // CRITICAL should be included first
      expect(result.comments[0].severity).toBe("CRITICAL");
    });
  });

  // ========================================
  // getDraftReviewPromptModifier
  // ========================================

  describe("getDraftReviewPromptModifier", () => {
    it("should return prompt modifier for draft review", () => {
      const modifier = getDraftReviewPromptModifier();

      expect(modifier).toContain("ドラフト");
      expect(modifier.length).toBeGreaterThan(50);
    });

    it("should focus on critical issues", () => {
      const modifier = getDraftReviewPromptModifier();

      expect(modifier).toContain("セキュリティ");
    });

    it("should mention what to ignore", () => {
      const modifier = getDraftReviewPromptModifier();

      expect(modifier).toContain("スタイル");
    });
  });

  // ========================================
  // getReadyReviewPromptModifier
  // ========================================

  describe("getReadyReviewPromptModifier", () => {
    it("should return empty string when no draft diff", () => {
      const modifier = getReadyReviewPromptModifier(false);

      expect(modifier).toBe("");
    });

    it("should return prompt when has draft diff", () => {
      const modifier = getReadyReviewPromptModifier(true);

      expect(modifier).toContain("ドラフト");
      expect(modifier.length).toBeGreaterThan(50);
    });

    it("should mention comprehensive review", () => {
      const modifier = getReadyReviewPromptModifier(true);

      expect(modifier).toContain("完全なレビュー");
    });
  });

  // ========================================
  // filterFilesByStrategy
  // ========================================

  describe("filterFilesByStrategy", () => {
    const createMockFile = (path: string, changeCount: number): ParsedFile => ({
      oldPath: path,
      newPath: path,
      type: "modify",
      additions: changeCount,
      deletions: 0,
      hunks: [
        {
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 5,
          content: "",
          changes: Array.from({ length: changeCount }, (_, i) => ({
            type: "normal" as const,
            content: `line ${i}`,
            oldLineNumber: i + 1,
            newLineNumber: i + 1,
            diffPosition: i + 1,
          })),
        },
      ],
    });

    const files: ParsedFile[] = [
      createMockFile("src/index.ts", 100),
      createMockFile("src/utils.ts", 50),
      createMockFile("test/index.test.ts", 50),
      createMockFile("package.json", 10),
      createMockFile("README.md", 20),
    ];

    it("should include all files for full review", () => {
      const strategy = getReviewStrategy("FULL");
      const result = filterFilesByStrategy(files, strategy);

      expect(result.length).toBe(files.length);
    });

    it("should filter large files for light review", () => {
      const largeFiles = [
        createMockFile("src/huge.ts", 600),
        createMockFile("src/small.ts", 50),
      ];

      const strategy = getReviewStrategy("LIGHT");
      const result = filterFilesByStrategy(largeFiles, strategy);

      // Large file should be excluded
      expect(result.length).toBe(1);
      expect(result[0].newPath).toBe("src/small.ts");
    });

    it("should limit files count for light review", () => {
      const manyFiles = Array.from({ length: 20 }, (_, i) =>
        createMockFile(`src/file${i}.ts`, 10)
      );

      const strategy = getReviewStrategy("LIGHT");
      const result = filterFilesByStrategy(manyFiles, strategy);

      expect(result.length).toBeLessThanOrEqual(10);
    });
  });

  // ========================================
  // formatReviewSummary
  // ========================================

  describe("formatReviewSummary", () => {
    const summary = "This is a review summary.";

    it("should format summary for draft PR", () => {
      const formatted = formatReviewSummary(summary, "LIGHT", true);

      expect(formatted).toContain("Draft Review");
      expect(formatted).toContain(summary);
    });

    it("should format summary for full review non-draft", () => {
      const formatted = formatReviewSummary(summary, "FULL", false);

      expect(formatted).toContain("Full Review");
      expect(formatted).toContain(summary);
    });

    it("should format summary for light review non-draft", () => {
      const formatted = formatReviewSummary(summary, "LIGHT", false);

      expect(formatted).toContain("Quick Review");
      expect(formatted).toContain(summary);
    });

    it("should add footer for draft", () => {
      const formatted = formatReviewSummary(summary, "LIGHT", true);

      expect(formatted).toContain("light review");
      expect(formatted).toContain("ready for review");
    });
  });

  // ========================================
  // isSeverityAtLeast
  // ========================================

  describe("isSeverityAtLeast", () => {
    it("should compare severity levels correctly", () => {
      expect(isSeverityAtLeast("CRITICAL", "CRITICAL")).toBe(true);
      expect(isSeverityAtLeast("CRITICAL", "IMPORTANT")).toBe(true);
      expect(isSeverityAtLeast("IMPORTANT", "CRITICAL")).toBe(false);
      expect(isSeverityAtLeast("NITPICK", "IMPORTANT")).toBe(false);
    });

    it("should handle all severity levels", () => {
      expect(isSeverityAtLeast("CRITICAL", "NITPICK")).toBe(true);
      expect(isSeverityAtLeast("IMPORTANT", "INFO")).toBe(true);
      expect(isSeverityAtLeast("INFO", "INFO")).toBe(true);
      expect(isSeverityAtLeast("NITPICK", "NITPICK")).toBe(true);
    });
  });

  // ========================================
  // groupCommentsByCategory
  // ========================================

  describe("groupCommentsByCategory", () => {
    const comments: ReviewComment[] = [
      {
        path: "a.ts",
        endLine: 1,
        body: "Security",
        severity: "CRITICAL",
        category: "security",
      },
      {
        path: "b.ts",
        endLine: 2,
        body: "Perf 1",
        severity: "IMPORTANT",
        category: "performance",
      },
      {
        path: "c.ts",
        endLine: 3,
        body: "Perf 2",
        severity: "INFO",
        category: "performance",
      },
      {
        path: "d.ts",
        endLine: 4,
        body: "Style",
        severity: "NITPICK",
        category: "style",
      },
    ];

    it("should group comments by category", () => {
      const groups = groupCommentsByCategory(comments);

      expect(groups.security).toHaveLength(1);
      expect(groups.performance).toHaveLength(2);
      expect(groups.style).toHaveLength(1);
    });

    it("should handle empty input", () => {
      const groups = groupCommentsByCategory([]);

      expect(Object.keys(groups).length).toBe(0);
    });

    it("should use general for missing category", () => {
      const noCategory: ReviewComment[] = [
        {
          path: "a.ts",
          endLine: 1,
          body: "Test",
          severity: "INFO",
        },
      ];

      const groups = groupCommentsByCategory(noCategory);

      expect(groups.general).toHaveLength(1);
    });
  });

  // ========================================
  // isHighPriorityCategory
  // ========================================

  describe("isHighPriorityCategory", () => {
    it("should identify security as high priority", () => {
      expect(isHighPriorityCategory("security")).toBe(true);
    });

    it("should identify bug as high priority", () => {
      expect(isHighPriorityCategory("bug")).toBe(true);
    });

    it("should identify error as high priority", () => {
      expect(isHighPriorityCategory("error")).toBe(true);
    });

    it("should not identify style as high priority", () => {
      expect(isHighPriorityCategory("style")).toBe(false);
    });

    it("should not identify documentation as high priority", () => {
      expect(isHighPriorityCategory("documentation")).toBe(false);
    });

    it("should handle case insensitivity", () => {
      expect(isHighPriorityCategory("SECURITY")).toBe(true);
      expect(isHighPriorityCategory("Security")).toBe(true);
    });
  });

  // ========================================
  // getModelParametersForDepth
  // ========================================

  describe("getModelParametersForDepth", () => {
    it("should return conservative params for light review", () => {
      const params = getModelParametersForDepth("LIGHT");

      expect(params.temperature).toBe(0.3);
      expect(params.maxTokens).toBe(1000);
    });

    it("should return detailed params for full review", () => {
      const params = getModelParametersForDepth("FULL");

      expect(params.temperature).toBe(0.5);
      expect(params.maxTokens).toBe(4000);
    });
  });
});
