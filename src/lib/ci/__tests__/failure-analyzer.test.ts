/**
 * CI Failure Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import { analyzeCIFailure } from "../failure-analyzer";
import type { ParsedCILog } from "../types";

describe("analyzeCIFailure", () => {
  describe("Test failure analysis", () => {
    it("should analyze test failures", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [
          {
            testName: "should render correctly",
            testFile: "src/components/Button.test.tsx",
            testSuite: "Button component",
            errorMessage: "Expected 'Hello' but received 'World'",
            expected: "Hello",
            actual: "World",
          },
        ],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("TEST_FAILURE");
      expect(result.rootCauseSummary).toContain("テスト");
      expect(result.affectedFiles.length).toBeGreaterThan(0);
      expect(result.affectedFiles[0].filePath).toBe("src/components/Button.test.tsx");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("should generate suggestions for test failures", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [
          {
            testName: "test1",
            errorMessage: "snapshot mismatch",
          },
        ],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.suggestions.some(s => s.title.includes("スナップショット"))).toBe(true);
    });
  });

  describe("Type error analysis", () => {
    it("should analyze type errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TYPE_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [
          {
            filePath: "src/utils/helper.ts",
            lineNumber: 15,
            columnNumber: 10,
            tsErrorCode: "TS2322",
            message: "Type 'string' is not assignable to type 'number'",
            expectedType: "number",
            actualType: "string",
          },
        ],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("TYPE_ERROR");
      expect(result.rootCauseSummary).toContain("型エラー");
      expect(result.affectedFiles[0].filePath).toBe("src/utils/helper.ts");
      expect(result.relatedLinks.length).toBeGreaterThan(0);
    });

    it("should generate suggestions for multiple type errors", () => {
      const typeErrors = Array.from({ length: 15 }, (_, i) => ({
        filePath: `src/file${i}.ts`,
        lineNumber: i + 1,
        message: `Error ${i}`,
      }));

      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TYPE_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors,
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog);

      expect(result.suggestions.some(s => s.title.includes("tsconfig"))).toBe(true);
    });
  });

  describe("Lint error analysis", () => {
    it("should analyze lint errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "LINT_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [
          {
            filePath: "src/app.ts",
            lineNumber: 10,
            columnNumber: 5,
            severity: "error",
            message: "Unexpected console statement",
            rule: "no-console",
          },
          {
            filePath: "src/app.ts",
            lineNumber: 15,
            columnNumber: 1,
            severity: "warning",
            message: "Missing return type",
            rule: "@typescript-eslint/explicit-module-boundary-types",
          },
        ],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("LINT_ERROR");
      expect(result.rootCauseSummary).toContain("Lint");
      expect(result.affectedFiles.length).toBeGreaterThan(0);
      expect(result.relatedLinks.some(l => l.url.includes("eslint"))).toBe(true);
    });
  });

  describe("Dependency error analysis", () => {
    it("should analyze dependency errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "DEPENDENCY_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [
          {
            packageName: "@nonexistent/package",
            errorType: "NOT_FOUND",
            message: "Package not found in registry",
          },
        ],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("DEPENDENCY_ERROR");
      expect(result.rootCauseSummary).toContain("依存関係");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("should suggest peer dependency installation", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "DEPENDENCY_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [
          {
            packageName: "react",
            errorType: "PEER_DEPENDENCY",
            message: "Peer dependency missing",
          },
        ],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog);

      expect(result.suggestions.some(s => s.command?.includes("npm install"))).toBe(true);
    });
  });

  describe("Build error analysis", () => {
    it("should analyze build errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "BUILD_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [
          {
            message: "Module not found: ./missing-file",
            filePath: "src/index.ts",
            lineNumber: 5,
          },
        ],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("BUILD_ERROR");
      expect(result.rootCauseSummary).toContain("ビルド");
      expect(result.affectedFiles[0].severity).toBe("critical");
    });
  });

  describe("Timeout analysis", () => {
    it("should analyze timeout errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TIMEOUT",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("TIMEOUT");
      expect(result.rootCauseSummary).toContain("タイムアウト");
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe("OOM analysis", () => {
    it("should analyze out of memory errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "OUT_OF_MEMORY",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.failureType).toBe("OUT_OF_MEMORY");
      expect(result.rootCauseSummary).toContain("メモリ");
      expect(result.suggestions.some(s => s.command?.includes("max-old-space-size"))).toBe(true);
      expect(result.relatedLinks.length).toBeGreaterThan(0);
    });
  });

  describe("Confidence calculation", () => {
    it("should have higher confidence with more error info", () => {
      const minimalLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "UNKNOWN",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const detailedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [{ testName: "test1", testFile: "test.ts", errorMessage: "error" }],
        buildErrors: [],
        typeErrors: [{ filePath: "file.ts", lineNumber: 1, message: "error" }],
        lintErrors: [{ filePath: "file.ts", lineNumber: 1, severity: "error", message: "error", rule: "rule" }],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const minimalResult = analyzeCIFailure(minimalLog);
      const detailedResult = analyzeCIFailure(detailedLog);

      expect(detailedResult.confidence).toBeGreaterThan(minimalResult.confidence);
    });
  });

  describe("Language support", () => {
    it("should generate English analysis", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [{ testName: "test1", errorMessage: "error" }],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "en" });

      expect(result.rootCauseSummary).toContain("test");
      expect(result.detailedAnalysis).toContain("CI Failure Analysis Report");
    });

    it("should generate Japanese analysis", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [{ testName: "test1", errorMessage: "error" }],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.rootCauseSummary).toContain("テスト");
      expect(result.detailedAnalysis).toContain("CI失敗分析レポート");
    });
  });

  describe("Detailed analysis", () => {
    it("should include workflow info in detailed analysis", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        workflowName: "ci.yml",
        jobName: "build",
        stepName: "Run tests",
        duration: 120,
        exitCode: 1,
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [{ testName: "test1", errorMessage: "error" }],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const result = analyzeCIFailure(parsedLog, { language: "ja" });

      expect(result.detailedAnalysis).toContain("ci.yml");
      expect(result.detailedAnalysis).toContain("build");
      expect(result.detailedAnalysis).toContain("120");
    });
  });
});
