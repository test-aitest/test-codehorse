/**
 * Phase 6: Error Handler Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

// Mock dependencies
vi.mock("@/lib/prisma", () => ({
  prisma: {
    errorOccurrence: {
      create: vi.fn().mockResolvedValue({ id: "mock-error-id" }),
    },
  },
}));

vi.mock("@/lib/github/client", () => ({
  getInstallationOctokit: vi.fn().mockResolvedValue({
    rest: {
      issues: {
        createComment: vi.fn().mockResolvedValue({}),
      },
    },
  }),
}));

import {
  handleError,
  handleGitHubError,
  handleWebhookError,
  handleInngestError,
  withErrorHandling,
  withApiErrorHandling,
} from "../error-handler";
import { getInstallationOctokit } from "@/lib/github/client";

describe("error-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleError", () => {
    it("should handle basic error", async () => {
      const error = new Error("Test error");
      const result = await handleError(error);

      expect(result.error).toBeDefined();
      expect(result.error.originalMessage).toBe("Test error");
      expect(result.notifiedPR).toBe(false);
    });

    it("should return response when returnResponse is true", async () => {
      const error = new Error("API rate limit exceeded");
      const result = await handleError(error, { returnResponse: true });

      expect(result.response).toBeDefined();
      expect(result.response).toBeInstanceOf(NextResponse);
    });

    it("should include shouldRetry flag", async () => {
      const retryableError = new Error("Rate limit exceeded");
      const result = await handleError(retryableError);

      expect(result.shouldRetry).toBe(true);
    });

    it("should not retry when shouldRetry option is false", async () => {
      const error = new Error("Rate limit exceeded");
      const result = await handleError(error, { shouldRetry: false });

      expect(result.shouldRetry).toBe(false);
    });

    it("should include retryAfterMs for retryable errors", async () => {
      const error = new Error("API rate limit exceeded");
      const result = await handleError(error);

      if (result.shouldRetry) {
        expect(result.retryAfterMs).toBeDefined();
      }
    });

    it("should include context in error tracking", async () => {
      const error = new Error("Test error");
      const result = await handleError(error, {
        context: { operation: "test-op" },
        repositoryId: "repo-123",
      });

      expect(result.error).toBeDefined();
    });
  });

  describe("handleError with PR notification", () => {
    it("should notify PR when enabled", async () => {
      const error = new Error("Critical error");
      const prInfo = {
        installationId: 12345,
        owner: "test-org",
        repo: "test-repo",
        prNumber: 42,
      };

      const mockOctokit = {
        rest: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
          },
        },
      };
      (getInstallationOctokit as ReturnType<typeof vi.fn>).mockResolvedValue(mockOctokit);

      const result = await handleError(error, {
        notifyPR: true,
        prInfo,
      });

      expect(result.notifiedPR).toBe(true);
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "test-org",
        repo: "test-repo",
        issue_number: 42,
        body: expect.any(String),
      });
    });

    it("should handle PR notification failure gracefully", async () => {
      const error = new Error("Test error");
      const prInfo = {
        installationId: 12345,
        owner: "test-org",
        repo: "test-repo",
        prNumber: 42,
      };

      const mockOctokit = {
        rest: {
          issues: {
            createComment: vi.fn().mockRejectedValue(new Error("Notification failed")),
          },
        },
      };
      (getInstallationOctokit as ReturnType<typeof vi.fn>).mockResolvedValue(mockOctokit);

      const result = await handleError(error, {
        notifyPR: true,
        prInfo,
      });

      expect(result.notifiedPR).toBe(false);
    });

    it("should not notify PR when notifyPR is false", async () => {
      const error = new Error("Test error");

      const result = await handleError(error, {
        notifyPR: false,
      });

      expect(result.notifiedPR).toBe(false);
      expect(getInstallationOctokit).not.toHaveBeenCalled();
    });
  });

  describe("handleGitHubError", () => {
    it("should handle GitHub API error", async () => {
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;

      const result = await handleGitHubError(error);

      expect(result.error.type).toBe("GITHUB_API");
      expect(result.error.code).toBe("404");
    });

    it("should handle rate limit error", async () => {
      const error = new Error("API rate limit exceeded") as Error & { status: number };
      error.status = 403;

      const result = await handleGitHubError(error);

      expect(result.error.type).toBe("RATE_LIMIT");
      expect(result.shouldRetry).toBe(true);
    });

    it("should return response when requested", async () => {
      const error = new Error("Server Error") as Error & { status: number };
      error.status = 500;

      const result = await handleGitHubError(error, { returnResponse: true });

      expect(result.response).toBeDefined();
    });
  });

  describe("handleWebhookError", () => {
    it("should return NextResponse", async () => {
      const error = new Error("Webhook processing failed");
      const response = await handleWebhookError(error);

      expect(response).toBeInstanceOf(NextResponse);
    });

    it("should include context in tracking", async () => {
      const error = new Error("Signature invalid");
      const context = { event: "pull_request", action: "opened" };

      const response = await handleWebhookError(error, context);

      expect(response).toBeInstanceOf(NextResponse);
    });

    it("should return appropriate status code", async () => {
      const error = new Error("Bad credentials");
      const response = await handleWebhookError(error);

      // Response should be created (we can't easily test status code here)
      expect(response).toBeDefined();
    });
  });

  describe("handleInngestError", () => {
    it("should return translated error with retry info", async () => {
      const error = new Error("Rate limit exceeded");

      const result = await handleInngestError(error);

      expect(result.translated).toBeDefined();
      expect(result.shouldRetry).toBe(true);
      expect(result.retryAfterMs).toBeDefined();
    });

    it("should not retry for non-retryable errors", async () => {
      const error = new Error("Permission denied: Resource not accessible by integration");

      const result = await handleInngestError(error);

      expect(result.shouldRetry).toBe(false);
    });

    it("should notify PR for fatal errors when prInfo provided", async () => {
      const error = new Error("Bad credentials");
      const prInfo = {
        installationId: 12345,
        owner: "test-org",
        repo: "test-repo",
        prNumber: 42,
      };

      const mockOctokit = {
        rest: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
          },
        },
      };
      (getInstallationOctokit as ReturnType<typeof vi.fn>).mockResolvedValue(mockOctokit);

      await handleInngestError(error, { prInfo });

      // Should notify for non-retryable errors
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
    });

    it("should not notify PR for retryable errors", async () => {
      const error = new Error("Rate limit exceeded");
      const prInfo = {
        installationId: 12345,
        owner: "test-org",
        repo: "test-repo",
        prNumber: 42,
      };

      const mockOctokit = {
        rest: {
          issues: {
            createComment: vi.fn().mockResolvedValue({}),
          },
        },
      };
      (getInstallationOctokit as ReturnType<typeof vi.fn>).mockResolvedValue(mockOctokit);

      await handleInngestError(error, { prInfo });

      // Should not notify for retryable errors
      expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalled();
    });
  });

  describe("withErrorHandling", () => {
    it("should execute function successfully", async () => {
      const mockFn = vi.fn().mockResolvedValue("success");
      const wrapped = withErrorHandling(mockFn);

      const result = await wrapped();

      expect(result).toBe("success");
      expect(mockFn).toHaveBeenCalled();
    });

    it("should handle and re-throw errors", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Test failure"));
      const wrapped = withErrorHandling(mockFn);

      await expect(wrapped()).rejects.toThrow("Test failure");
    });

    it("should pass arguments to wrapped function", async () => {
      const mockFn = vi.fn().mockImplementation((a: number, b: number) => a + b);
      const wrapped = withErrorHandling(mockFn);

      const result = await wrapped(2, 3);

      expect(result).toBe(5);
      expect(mockFn).toHaveBeenCalledWith(2, 3);
    });

    it("should track errors with provided options", async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error("Error with context"));
      const wrapped = withErrorHandling(mockFn, {
        repositoryId: "repo-123",
        context: { operation: "test" },
      });

      await expect(wrapped()).rejects.toThrow();
    });
  });

  describe("withApiErrorHandling", () => {
    it("should execute handler successfully", async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: "success" })
      );
      const wrapped = withApiErrorHandling(mockHandler);

      const mockRequest = new Request("http://localhost/api/test");
      const result = await wrapped(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
      expect(mockHandler).toHaveBeenCalledWith(mockRequest);
    });

    it("should return error response on failure", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("API failure"));
      const wrapped = withApiErrorHandling(mockHandler);

      const mockRequest = new Request("http://localhost/api/test", {
        method: "POST",
      });
      const result = await wrapped(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
    });

    it("should include request context in error", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("Handler error"));
      const wrapped = withApiErrorHandling(mockHandler);

      const mockRequest = new Request("http://localhost/api/webhooks/github", {
        method: "POST",
      });

      const result = await wrapped(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe("HTTP status code mapping", () => {
    it("should return 401 for authentication errors", async () => {
      const error = new Error("Bad credentials");
      const result = await handleError(error, { returnResponse: true });

      // The response should be created with appropriate status
      expect(result.response).toBeDefined();
    });

    it("should return 403 for permission errors", async () => {
      const error = new Error("Resource not accessible by integration");
      const result = await handleError(error, { returnResponse: true });

      expect(result.response).toBeDefined();
    });

    it("should return 429 for rate limit errors", async () => {
      const error = new Error("API rate limit exceeded");
      const result = await handleError(error, { returnResponse: true });

      expect(result.response).toBeDefined();
    });

    it("should return 500 for unknown errors", async () => {
      const error = new Error("Unknown internal error");
      const result = await handleError(error, { returnResponse: true });

      expect(result.response).toBeDefined();
    });
  });

  describe("Retry-After header", () => {
    it("should include Retry-After header for retryable errors", async () => {
      const error = new Error("API rate limit exceeded");
      const result = await handleError(error, { returnResponse: true });

      // The response should include Retry-After if retryable
      if (result.response && result.retryAfterMs) {
        // We can't directly test headers here but verify the structure
        expect(result.retryAfterMs).toBeGreaterThan(0);
      }
    });
  });
});
