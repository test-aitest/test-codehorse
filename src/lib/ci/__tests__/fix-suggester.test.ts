/**
 * CI Fix Suggester Tests
 */

import { describe, it, expect } from "vitest";
import { generateFixSuggestions } from "../fix-suggester";
import type { ParsedCILog } from "../types";

describe("generateFixSuggestions", () => {
  describe("Test failure suggestions", () => {
    it("should suggest running tests locally", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [
          {
            testName: "should work",
            errorMessage: "Expected true but got false",
          },
        ],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("npm test"))).toBe(true);
    });

    it("should suggest updating snapshots for snapshot failures", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [
          {
            testName: "should match snapshot",
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("スナップショット"))).toBe(true);
      expect(suggestions.some(s => s.command?.includes("-u"))).toBe(true);
    });

    it("should highlight expected/actual mismatch", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [
          {
            testName: "should equal",
            errorMessage: "Values differ",
            expected: "1",
            actual: "2",
          },
        ],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.description.includes("期待値"))).toBe(true);
    });
  });

  describe("Type error suggestions", () => {
    it("should suggest type fixes", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TYPE_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [
          {
            filePath: "src/app.ts",
            lineNumber: 10,
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.type === "code_change")).toBe(true);
      expect(suggestions.some(s => s.description.includes("string") && s.description.includes("number"))).toBe(true);
    });

    it("should suggest adding missing property", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TYPE_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [
          {
            filePath: "src/app.ts",
            lineNumber: 10,
            message: "Property 'foo' does not exist on type 'Bar'",
          },
        ],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("foo"))).toBe(true);
    });
  });

  describe("Lint error suggestions", () => {
    it("should suggest auto-fix for fixable rules", () => {
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
            severity: "error",
            message: "Missing semicolon",
            rule: "semi",
          },
        ],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("--fix"))).toBe(true);
      expect(suggestions.some(s => s.autoApplicable)).toBe(true);
    });

    it("should suggest Prettier for formatting issues", () => {
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
            severity: "error",
            message: "Insert ;",
            rule: "prettier/prettier",
          },
        ],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("prettier"))).toBe(true);
    });

    it("should suggest removing unused variables", () => {
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
            severity: "error",
            message: "'x' is defined but never used",
            rule: "no-unused-vars",
          },
          {
            filePath: "src/app.ts",
            lineNumber: 15,
            severity: "error",
            message: "'y' is defined but never used",
            rule: "@typescript-eslint/no-unused-vars",
          },
        ],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("未使用変数"))).toBe(true);
    });
  });

  describe("Build error suggestions", () => {
    it("should suggest installing missing module", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "BUILD_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [
          {
            message: "Module not found: Can't resolve 'lodash'",
            filePath: "src/app.ts",
          },
        ],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("npm install lodash"))).toBe(true);
    });

    it("should suggest fixing syntax errors", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "BUILD_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [
          {
            message: "SyntaxError: Unexpected token",
            filePath: "src/app.ts",
            lineNumber: 10,
          },
        ],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("構文エラー"))).toBe(true);
    });

    it("should suggest clearing build cache", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "BUILD_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [
          {
            message: "Build failed",
          },
        ],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("キャッシュ"))).toBe(true);
    });
  });

  describe("Dependency error suggestions", () => {
    it("should suggest checking package name for NOT_FOUND", () => {
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
            packageName: "@nonexistent/pkg",
            errorType: "NOT_FOUND",
            message: "Package not found",
          },
        ],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("@nonexistent/pkg"))).toBe(true);
    });

    it("should suggest installing peer dependencies", () => {
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("npm install react"))).toBe(true);
    });

    it("should suggest resolving version conflicts", () => {
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
            errorType: "VERSION_MISMATCH",
            message: "Version conflict",
          },
        ],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("rm -rf node_modules"))).toBe(true);
    });

    it("should suggest reinstalling node_modules", () => {
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
            packageName: "pkg",
            errorType: "OTHER",
            message: "Some error",
          },
        ],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("npm ci"))).toBe(true);
    });
  });

  describe("Timeout suggestions", () => {
    it("should suggest increasing timeout and optimization", () => {
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("タイムアウト"))).toBe(true);
      expect(suggestions.some(s => s.title.includes("最適化"))).toBe(true);
    });
  });

  describe("OOM suggestions", () => {
    it("should suggest increasing memory limit", () => {
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.command?.includes("max-old-space-size"))).toBe(true);
      expect(suggestions.some(s => s.title.includes("メモリ"))).toBe(true);
    });
  });

  describe("Permission error suggestions", () => {
    it("should suggest checking permissions", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "PERMISSION_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("権限"))).toBe(true);
      expect(suggestions.some(s => s.title.includes("トークン"))).toBe(true);
    });
  });

  describe("Configuration error suggestions", () => {
    it("should suggest validating config", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "CONFIGURATION_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("設定ファイル"))).toBe(true);
    });
  });

  describe("Generic suggestions", () => {
    it("should provide generic suggestions for unknown errors", () => {
      const parsedLog: ParsedCILog = {
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

      const suggestions = generateFixSuggestions(parsedLog, { language: "ja" });

      expect(suggestions.some(s => s.title.includes("ログ"))).toBe(true);
      expect(suggestions.some(s => s.title.includes("ローカル"))).toBe(true);
      expect(suggestions.some(s => s.title.includes("キャッシュ"))).toBe(true);
    });
  });

  describe("Suggestion priority", () => {
    it("should sort suggestions by priority", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "BUILD_ERROR",
        errorMessages: [],
        failedTests: [],
        buildErrors: [
          {
            message: "Module not found: lodash",
          },
        ],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog);

      // High priority suggestions should come first
      const priorities = suggestions.map(s => s.priority);
      const highIndex = priorities.indexOf("high");
      const mediumIndex = priorities.indexOf("medium");
      const lowIndex = priorities.indexOf("low");

      if (highIndex !== -1 && mediumIndex !== -1) {
        expect(highIndex).toBeLessThan(mediumIndex);
      }
      if (mediumIndex !== -1 && lowIndex !== -1) {
        expect(mediumIndex).toBeLessThan(lowIndex);
      }
    });
  });

  describe("Language support", () => {
    it("should generate English suggestions", () => {
      const parsedLog: ParsedCILog = {
        provider: "GITHUB_ACTIONS",
        failureType: "TEST_FAILURE",
        errorMessages: [],
        failedTests: [{ testName: "test", errorMessage: "error" }],
        buildErrors: [],
        typeErrors: [],
        lintErrors: [],
        dependencyErrors: [],
        relevantLogSections: [],
        metadata: {},
      };

      const suggestions = generateFixSuggestions(parsedLog, { language: "en" });

      expect(suggestions.some(s => s.title.includes("Run tests locally"))).toBe(true);
    });
  });
});
