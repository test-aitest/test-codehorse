/**
 * Phase 7: Draft to Ready Analyzer Tests
 */

import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "octokit";
import {
  analyzeDraftToReadyChanges,
  formatDraftChangesForPR,
  getShortChangeSummary,
  isSignificantChange,
  shouldIncludeDraftChangesInReview,
  type DraftToReadyAnalysis,
} from "../draft-to-ready-analyzer";

// Sample diff for testing
const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,10 @@
+import { newFunction } from './utils';
+
 export function main() {
   console.log("Hello");
+  const result = newFunction();
+  return result;
 }

diff --git a/src/utils.ts b/src/utils.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/utils.ts
@@ -0,0 +1,5 @@
+export function newFunction() {
+  return "new";
+}
`;

// Mock the diff parser
vi.mock("@/lib/diff/parser", () => ({
  parseDiff: vi.fn(() => ({
    files: [
      {
        oldPath: "src/index.ts",
        newPath: "src/index.ts",
        type: "modify",
        hunks: [],
        additions: 4,
        deletions: 0,
      },
      {
        oldPath: "/dev/null",
        newPath: "src/utils.ts",
        type: "add",
        hunks: [],
        additions: 3,
        deletions: 0,
      },
    ],
    totalAdditions: 7,
    totalDeletions: 0,
  })),
}));

describe("draft-to-ready-analyzer", () => {
  // ========================================
  // analyzeDraftToReadyChanges
  // ========================================

  describe("analyzeDraftToReadyChanges", () => {
    it("should analyze changes between commits", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            compareCommits: vi.fn().mockResolvedValue({
              data: sampleDiff,
            }),
          },
        },
      } as unknown as Octokit;

      const result = await analyzeDraftToReadyChanges(
        mockOctokit,
        "owner",
        "repo",
        "draft-sha",
        "ready-sha"
      );

      expect(result.draftCommitSha).toBe("draft-sha");
      expect(result.readyCommitSha).toBe("ready-sha");
      expect(result.filesChanged).toBe(2);
      expect(result.additions).toBe(7);
      expect(result.deletions).toBe(0);
    });

    it("should include summary information", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            compareCommits: vi.fn().mockResolvedValue({
              data: sampleDiff,
            }),
          },
        },
      } as unknown as Octokit;

      const result = await analyzeDraftToReadyChanges(
        mockOctokit,
        "owner",
        "repo",
        "draft-sha",
        "ready-sha"
      );

      expect(result.summary).toBeDefined();
      expect(result.summary.scale).toBeDefined();
      expect(result.summary.hasNewFiles).toBe(true);
    });

    it("should include change details", async () => {
      const mockOctokit = {
        rest: {
          repos: {
            compareCommits: vi.fn().mockResolvedValue({
              data: sampleDiff,
            }),
          },
        },
      } as unknown as Octokit;

      const result = await analyzeDraftToReadyChanges(
        mockOctokit,
        "owner",
        "repo",
        "draft-sha",
        "ready-sha"
      );

      expect(result.changes.length).toBe(2);
      expect(result.changes.some((c) => c.changeType === "added")).toBe(true);
      expect(result.changes.some((c) => c.changeType === "modified")).toBe(
        true
      );
    });
  });

  // ========================================
  // formatDraftChangesForPR
  // ========================================

  describe("formatDraftChangesForPR", () => {
    const mockAnalysis: DraftToReadyAnalysis = {
      draftCommitSha: "abc1234567890",
      readyCommitSha: "def1234567890",
      filesChanged: 3,
      additions: 50,
      deletions: 10,
      summary: {
        scale: "medium",
        hasNewFiles: true,
        hasDeletedFiles: false,
        hasRenamedFiles: false,
        primaryFileTypes: ["ts", "tsx"],
        description:
          "中程度の変更（3ファイル）を含む（ファイル追加）。+50/-10行。",
      },
      changes: [
        {
          filePath: "src/index.ts",
          changeType: "modified",
          additions: 20,
          deletions: 5,
        },
        {
          filePath: "src/utils.ts",
          changeType: "added",
          additions: 30,
          deletions: 0,
        },
        {
          filePath: "src/old.ts",
          changeType: "deleted",
          additions: 0,
          deletions: 5,
        },
      ],
      rawDiff: "",
      parsedDiff: {
        files: [],
        totalAdditions: 50,
        totalDeletions: 10,
      },
    };

    it("should format changes for PR comment", () => {
      const formatted = formatDraftChangesForPR(mockAnalysis);

      expect(formatted).toContain("Draft → Ready");
      expect(formatted).toContain("変更サマリー");
    });

    it("should include statistics table", () => {
      const formatted = formatDraftChangesForPR(mockAnalysis);

      expect(formatted).toContain("ファイル数");
      expect(formatted).toContain("3");
      expect(formatted).toContain("+50");
      expect(formatted).toContain("-10");
    });

    it("should include commit SHAs", () => {
      const formatted = formatDraftChangesForPR(mockAnalysis);

      expect(formatted).toContain("abc1234");
      expect(formatted).toContain("def1234");
    });

    it("should include file list", () => {
      const formatted = formatDraftChangesForPR(mockAnalysis);

      expect(formatted).toContain("src/index.ts");
      expect(formatted).toContain("src/utils.ts");
    });

    it("should show change type icons", () => {
      const formatted = formatDraftChangesForPR(mockAnalysis);

      // New file icon
      expect(formatted).toContain("🆕");
      // Modified file icon
      expect(formatted).toContain("📝");
    });

    it("should warn about large changes", () => {
      const largeAnalysis: DraftToReadyAnalysis = {
        ...mockAnalysis,
        summary: {
          ...mockAnalysis.summary,
          scale: "large",
        },
      };

      const formatted = formatDraftChangesForPR(largeAnalysis);

      expect(formatted).toContain("⚠️");
      expect(formatted).toContain("大規模");
    });

    it("should handle more than 10 files", () => {
      const manyFilesAnalysis: DraftToReadyAnalysis = {
        ...mockAnalysis,
        changes: Array.from({ length: 15 }, (_, i) => ({
          filePath: `src/file${i}.ts`,
          changeType: "modified" as const,
          additions: 10,
          deletions: 5,
        })),
      };

      const formatted = formatDraftChangesForPR(manyFilesAnalysis);

      expect(formatted).toContain("5 more files");
    });
  });

  // ========================================
  // getShortChangeSummary
  // ========================================

  describe("getShortChangeSummary", () => {
    it("should return short summary", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc123",
        readyCommitSha: "def456",
        filesChanged: 5,
        additions: 100,
        deletions: 20,
        summary: {
          scale: "medium",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: ["ts"],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 100, totalDeletions: 20 },
      };

      const summary = getShortChangeSummary(analysis);

      expect(summary).toContain("medium");
      expect(summary).toContain("5 files");
      expect(summary).toContain("+100/-20");
    });
  });

  // ========================================
  // isSignificantChange
  // ========================================

  describe("isSignificantChange", () => {
    it("should return true for large scale changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 10,
        additions: 500,
        deletions: 100,
        summary: {
          scale: "large",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 500, totalDeletions: 100 },
      };

      expect(isSignificantChange(analysis)).toBe(true);
    });

    it("should return true for new files", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 1,
        additions: 10,
        deletions: 0,
        summary: {
          scale: "small",
          hasNewFiles: true,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 10, totalDeletions: 0 },
      };

      expect(isSignificantChange(analysis)).toBe(true);
    });

    it("should return true for deleted files", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 1,
        additions: 0,
        deletions: 10,
        summary: {
          scale: "small",
          hasNewFiles: false,
          hasDeletedFiles: true,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 0, totalDeletions: 10 },
      };

      expect(isSignificantChange(analysis)).toBe(true);
    });

    it("should return true for more than 100 line changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 2,
        additions: 80,
        deletions: 30,
        summary: {
          scale: "medium",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 80, totalDeletions: 30 },
      };

      expect(isSignificantChange(analysis)).toBe(true);
    });

    it("should return false for minor changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 1,
        additions: 5,
        deletions: 2,
        summary: {
          scale: "small",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 5, totalDeletions: 2 },
      };

      expect(isSignificantChange(analysis)).toBe(false);
    });
  });

  // ========================================
  // shouldIncludeDraftChangesInReview
  // ========================================

  describe("shouldIncludeDraftChangesInReview", () => {
    it("should return false for no file changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        summary: {
          scale: "small",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 0, totalDeletions: 0 },
      };

      expect(shouldIncludeDraftChangesInReview(analysis)).toBe(false);
    });

    it("should return false for very minor changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 1,
        additions: 5,
        deletions: 2,
        summary: {
          scale: "small",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 5, totalDeletions: 2 },
      };

      expect(shouldIncludeDraftChangesInReview(analysis)).toBe(false);
    });

    it("should return true for meaningful changes", () => {
      const analysis: DraftToReadyAnalysis = {
        draftCommitSha: "abc",
        readyCommitSha: "def",
        filesChanged: 2,
        additions: 20,
        deletions: 5,
        summary: {
          scale: "small",
          hasNewFiles: false,
          hasDeletedFiles: false,
          hasRenamedFiles: false,
          primaryFileTypes: [],
          description: "",
        },
        changes: [],
        rawDiff: "",
        parsedDiff: { files: [], totalAdditions: 20, totalDeletions: 5 },
      };

      expect(shouldIncludeDraftChangesInReview(analysis)).toBe(true);
    });
  });
});
