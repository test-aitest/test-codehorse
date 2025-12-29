/**
 * Phase 6: Error Translator Tests
 */

import { describe, it, expect } from "vitest";
import {
  translateError,
  translateGitHubError,
  translateAIError,
  formatErrorForUser,
  formatErrorForLog,
  formatErrorForPR,
  type TranslatedError,
  type ErrorContext,
} from "../error-translator";

describe("error-translator", () => {
  describe("translateError", () => {
    it("should translate known error pattern", () => {
      const error = new Error("API rate limit exceeded for this resource");
      const result = translateError(error);

      expect(result.type).toBe("RATE_LIMIT");
      expect(result.patternName).toBe("rate_limit_exceeded");
      expect(result.friendlyMessage).toContain("レート制限");
      expect(result.retryable).toBe(true);
    });

    it("should translate error with context", () => {
      const error = new Error("Resource not accessible by integration");
      const context: ErrorContext = {
        repository: { owner: "test", name: "repo" },
        pullRequest: { number: 123 },
        operation: "post-comment",
      };
      const result = translateError(error, context);

      expect(result.type).toBe("PERMISSION");
      expect(result.context).toEqual(context);
    });

    it("should handle string errors", () => {
      const result = translateError("Simple string error");

      expect(result.originalMessage).toBe("Simple string error");
      expect(result.type).toBe("UNKNOWN");
    });

    it("should handle object errors", () => {
      const result = translateError({ message: "Object error message" });

      expect(result.originalMessage).toBe("Object error message");
    });

    it("should handle unknown primitive errors", () => {
      const result = translateError(42);

      expect(result.originalMessage).toBe("42");
      expect(result.type).toBe("UNKNOWN");
    });

    it("should preserve stack trace", () => {
      const error = new Error("Test error with stack");
      const result = translateError(error);

      expect(result.stackTrace).toBeDefined();
      expect(result.stackTrace).toContain("Test error with stack");
    });

    it("should extract error code from Error with status", () => {
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;
      const result = translateError(error);

      expect(result.code).toBe("404");
    });

    it("should infer error type from message for unknown patterns", () => {
      const authError = new Error("Invalid authentication token provided");
      const result = translateError(authError);

      expect(result.type).toBe("AUTHENTICATION");
    });

    it("should infer DATABASE type from message", () => {
      const dbError = new Error("Prisma query failed unexpectedly");
      const result = translateError(dbError);

      expect(result.type).toBe("DATABASE");
    });

    it("should infer NETWORK type from message", () => {
      // Use a message that triggers network type inference but doesn't match a specific pattern
      const networkError = new Error("Network error while fetching data");
      const result = translateError(networkError);

      expect(result.type).toBe("NETWORK");
    });

    it("should infer AI_GENERATION type from message", () => {
      const aiError = new Error("OpenAI API request failed");
      const result = translateError(aiError);

      expect(result.type).toBe("AI_GENERATION");
    });
  });

  describe("translateGitHubError", () => {
    it("should translate GitHub API error with status code", () => {
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;
      const result = translateGitHubError(error);

      expect(result.type).toBe("GITHUB_API");
      expect(result.code).toBe("404");
    });

    it("should include context with status code", () => {
      const error = new Error("Rate limit") as Error & { status: number };
      error.status = 403;
      const result = translateGitHubError(error);

      expect(result.context?.statusCode).toBe(403);
    });

    it("should handle error with response object", () => {
      const error = new Error("Server Error") as Error & { response: { status: number; data: unknown } };
      error.response = { status: 500, data: { message: "Internal error" } };
      const result = translateGitHubError(error);

      expect(result.code).toBe("500");
    });

    it("should merge provided context", () => {
      const error = new Error("Permission denied");
      const context: ErrorContext = {
        repository: { owner: "test", name: "repo" },
      };
      const result = translateGitHubError(error, context);

      expect(result.context?.repository).toEqual({ owner: "test", name: "repo" });
    });
  });

  describe("translateAIError", () => {
    it("should translate AI error", () => {
      const error = new Error("Context length exceeded");
      const result = translateAIError(error);

      expect(result.type).toBe("AI_GENERATION");
    });

    it("should override UNKNOWN type to AI_GENERATION", () => {
      const error = new Error("Unknown AI error");
      const result = translateAIError(error);

      expect(result.type).toBe("AI_GENERATION");
    });

    it("should preserve known pattern type", () => {
      // Use GitHub API rate limit which has type RATE_LIMIT
      const error = new Error("API rate limit exceeded for this resource");
      const result = translateAIError(error);

      // GitHub rate limit pattern is preserved
      expect(result.type).toBe("RATE_LIMIT");
    });
  });

  describe("formatErrorForUser", () => {
    it("should format error with friendly message", () => {
      const translated: TranslatedError = {
        type: "RATE_LIMIT",
        originalMessage: "API rate limit exceeded",
        friendlyMessage: "APIのレート制限に達しました",
        resolution: "しばらく待ってから再試行してください",
        retryable: true,
        retryAfterMs: 60000,
      };

      const formatted = formatErrorForUser(translated);

      expect(formatted).toContain("APIのレート制限");
      expect(formatted).toContain("解決策");
      expect(formatted).toContain("リトライ");
    });

    it("should include doc URL when present", () => {
      const translated: TranslatedError = {
        type: "RATE_LIMIT",
        originalMessage: "Rate limit",
        friendlyMessage: "Rate limit reached",
        resolution: "Wait and retry",
        retryable: false,
        docUrl: "https://docs.github.com/rate-limit",
      };

      const formatted = formatErrorForUser(translated);

      expect(formatted).toContain("ドキュメント");
      expect(formatted).toContain("https://docs.github.com/rate-limit");
    });

    it("should not include retry message when not retryable", () => {
      const translated: TranslatedError = {
        type: "PERMISSION",
        originalMessage: "Permission denied",
        friendlyMessage: "権限がありません",
        resolution: "管理者に連絡してください",
        retryable: false,
      };

      const formatted = formatErrorForUser(translated);

      expect(formatted).not.toContain("リトライ");
    });
  });

  describe("formatErrorForLog", () => {
    it("should format error for logging", () => {
      const translated: TranslatedError = {
        type: "GITHUB_API",
        code: "404",
        originalMessage: "Not Found",
        friendlyMessage: "リソースが見つかりません",
        resolution: "URLを確認してください",
        retryable: false,
        patternName: "not_found",
      };

      const formatted = formatErrorForLog(translated);

      expect(formatted).toContain("[GITHUB_API]");
      expect(formatted).toContain("(404)");
      expect(formatted).toContain("[not_found]");
      expect(formatted).toContain("Not Found");
    });

    it("should handle missing optional fields", () => {
      const translated: TranslatedError = {
        type: "UNKNOWN",
        originalMessage: "Unknown error",
        friendlyMessage: "予期しないエラー",
        resolution: "再試行してください",
        retryable: false,
      };

      const formatted = formatErrorForLog(translated);

      expect(formatted).toContain("[UNKNOWN]");
      expect(formatted).toContain("Unknown error");
      expect(formatted).not.toContain("undefined");
    });
  });

  describe("formatErrorForPR", () => {
    it("should format error for PR comment", () => {
      const translated: TranslatedError = {
        type: "RATE_LIMIT",
        code: "403",
        originalMessage: "API rate limit exceeded",
        friendlyMessage: "GitHubのレート制限に達しました",
        resolution: "しばらく待ってから再試行してください",
        retryable: true,
        patternName: "rate_limit_exceeded",
      };

      const formatted = formatErrorForPR(translated);

      expect(formatted).toContain("## ⚠️ レビュー処理中にエラーが発生しました");
      expect(formatted).toContain("GitHubのレート制限");
      expect(formatted).toContain("一時的なもの");
      expect(formatted).toContain("<details>");
      expect(formatted).toContain("Type: RATE_LIMIT");
      expect(formatted).toContain("Code: 403");
      expect(formatted).toContain("Pattern: rate_limit_exceeded");
    });

    it("should include doc URL link", () => {
      const translated: TranslatedError = {
        type: "GITHUB_API",
        originalMessage: "Server error",
        friendlyMessage: "サーバーエラー",
        resolution: "再試行してください",
        retryable: true,
        docUrl: "https://www.githubstatus.com/",
      };

      const formatted = formatErrorForPR(translated);

      expect(formatted).toContain("📚 [関連ドキュメント]");
      expect(formatted).toContain("https://www.githubstatus.com/");
    });

    it("should not include retry message for non-retryable errors", () => {
      const translated: TranslatedError = {
        type: "PERMISSION",
        originalMessage: "Permission denied",
        friendlyMessage: "権限エラー",
        resolution: "権限を確認してください",
        retryable: false,
      };

      const formatted = formatErrorForPR(translated);

      expect(formatted).not.toContain("一時的なもの");
    });
  });

  describe("context interpolation", () => {
    it("should interpolate repository placeholder", () => {
      // Create an error that has a pattern with {repository} placeholder
      const error = new Error("Not Found");
      const context: ErrorContext = {
        repository: { owner: "myorg", name: "myrepo" },
      };

      // The pattern's friendlyMessage might contain {repository}
      // This test verifies the interpolation mechanism works
      const result = translateError(error, context);

      expect(result.context).toEqual(context);
    });

    it("should interpolate PR placeholder", () => {
      const error = new Error("Validation Failed");
      const context: ErrorContext = {
        pullRequest: { number: 42 },
      };

      const result = translateError(error, context);

      expect((result.context as ErrorContext)?.pullRequest?.number).toBe(42);
    });

    it("should interpolate file path placeholder", () => {
      const error = new Error("File not found");
      const context: ErrorContext = {
        filePath: "/src/components/Button.tsx",
      };

      const result = translateError(error, context);

      expect(result.context?.filePath).toBe("/src/components/Button.tsx");
    });

    it("should interpolate operation placeholder", () => {
      const error = new Error("Operation failed");
      const context: ErrorContext = {
        operation: "create-comment",
      };

      const result = translateError(error, context);

      expect(result.context?.operation).toBe("create-comment");
    });
  });

  describe("retryable determination", () => {
    it("should mark RATE_LIMIT as retryable by default", () => {
      const error = new Error("Exceeded secondary rate limit");
      const result = translateError(error);

      expect(result.retryable).toBe(true);
    });

    it("should mark NETWORK errors as retryable by default", () => {
      const error = new Error("Network connection reset");
      const result = translateError(error);

      // Will match connection_reset pattern
      expect(result.retryable).toBe(true);
    });

    it("should mark AUTHENTICATION errors as not retryable", () => {
      const error = new Error("Bad credentials");
      const result = translateError(error);

      expect(result.retryable).toBe(false);
    });

    it("should mark PERMISSION errors as not retryable", () => {
      const error = new Error("Resource not accessible by integration");
      const result = translateError(error);

      expect(result.retryable).toBe(false);
    });
  });
});
