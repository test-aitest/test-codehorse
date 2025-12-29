/**
 * Phase 6: Error Tracker Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ErrorType } from "@prisma/client";

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    errorOccurrence: {
      create: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  trackError,
  trackGitHubError,
  getErrorStats,
  getRecentErrors,
  markErrorResolved,
  cleanupOldErrors,
  isErrorFrequent,
  getErrorRate,
} from "../error-tracker";

describe("error-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("trackError", () => {
    it("should translate and track error", async () => {
      const error = new Error("API rate limit exceeded");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-1",
      });

      const result = await trackError(error);

      expect(result.type).toBe("RATE_LIMIT");
      expect(result.friendlyMessage).toContain("レート制限");
      expect(prisma.errorOccurrence.create).toHaveBeenCalled();
    });

    it("should save error with repository ID", async () => {
      const error = new Error("Not Found");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-2",
      });

      await trackError(error, { repositoryId: "repo-123" });

      expect(prisma.errorOccurrence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repositoryId: "repo-123",
          }),
        })
      );
    });

    it("should save error with context", async () => {
      const error = new Error("Permission denied");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-3",
      });

      await trackError(error, {
        context: { operation: "create-review" },
      });

      expect(prisma.errorOccurrence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            context: expect.objectContaining({
              operation: "create-review",
            }),
          }),
        })
      );
    });

    it("should not save stack trace when disabled", async () => {
      const error = new Error("Test error");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-4",
      });

      await trackError(error, { saveStackTrace: false });

      expect(prisma.errorOccurrence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stackTrace: undefined,
          }),
        })
      );
    });

    it("should handle DB save failure gracefully", async () => {
      const error = new Error("Test error");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("DB connection failed")
      );

      // Should not throw
      const result = await trackError(error);

      expect(result).toBeDefined();
      expect(result.originalMessage).toBe("Test error");
    });

    it("should log to console when logToConsole is true", async () => {
      const consoleSpy = vi.spyOn(console, "error");
      const error = new Error("Logged error");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-5",
      });

      await trackError(error, { logToConsole: true });

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should not log when logToConsole is false", async () => {
      const consoleSpy = vi.spyOn(console, "error");
      const error = new Error("Silent error");
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "error-6",
      });

      await trackError(error, { logToConsole: false });

      // Console.error is still called for the DB save
      // but the main tracking log should be skipped
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[ErrorTracker]"),
        expect.anything()
      );
    });
  });

  describe("trackGitHubError", () => {
    it("should translate GitHub error with status code", async () => {
      const error = new Error("Not Found") as Error & { status: number };
      error.status = 404;
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "gh-error-1",
      });

      const result = await trackGitHubError(error);

      expect(result.code).toBe("404");
      expect(result.type).toBe("GITHUB_API");
    });

    it("should include context in GitHub error tracking", async () => {
      const error = new Error("Rate limit") as Error & { status: number };
      error.status = 403;
      (prisma.errorOccurrence.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "gh-error-2",
      });

      const result = await trackGitHubError(error, {
        context: { repository: { owner: "test", name: "repo" } },
      });

      expect(result.context).toBeDefined();
    });
  });

  describe("getErrorStats", () => {
    it("should return error statistics", async () => {
      // Mock the groupBy calls
      (prisma.errorOccurrence.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          { errorType: "RATE_LIMIT", _count: 5 },
          { errorType: "GITHUB_API", _count: 3 },
        ])
        .mockResolvedValueOnce([
          { errorCode: "403", _count: 5 },
          { errorCode: "500", _count: 2 },
        ])
        .mockResolvedValueOnce([
          {
            errorType: "RATE_LIMIT",
            errorCode: "403",
            _count: 5,
            _max: { createdAt: new Date() },
          },
        ]);

      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(25);

      const stats = await getErrorStats();

      expect(stats.byType.RATE_LIMIT).toBe(5);
      expect(stats.byType.GITHUB_API).toBe(3);
      expect(stats.byCode["403"]).toBe(5);
      expect(stats.last24Hours).toBe(10);
      expect(stats.last7Days).toBe(25);
      expect(stats.mostFrequent.length).toBeGreaterThan(0);
    });

    it("should filter by repository ID", async () => {
      (prisma.errorOccurrence.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(15);

      await getErrorStats("repo-123");

      expect(prisma.errorOccurrence.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { repositoryId: "repo-123" },
        })
      );
    });
  });

  describe("getRecentErrors", () => {
    it("should return recent errors", async () => {
      const mockErrors = [
        {
          id: "err-1",
          errorType: "RATE_LIMIT" as ErrorType,
          errorCode: "403",
          errorMessage: "Rate limit exceeded",
          friendlyMessage: "レート制限に達しました",
          createdAt: new Date(),
          resolved: false,
        },
        {
          id: "err-2",
          errorType: "GITHUB_API" as ErrorType,
          errorCode: "500",
          errorMessage: "Server error",
          friendlyMessage: "サーバーエラー",
          createdAt: new Date(),
          resolved: true,
        },
      ];

      (prisma.errorOccurrence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockErrors
      );

      const errors = await getRecentErrors(10);

      expect(errors.length).toBe(2);
      expect(errors[0].type).toBe("RATE_LIMIT");
      expect(errors[0].code).toBe("403");
      expect(errors[1].resolved).toBe(true);
    });

    it("should respect limit parameter", async () => {
      (prisma.errorOccurrence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getRecentErrors(5);

      expect(prisma.errorOccurrence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it("should filter by repository ID", async () => {
      (prisma.errorOccurrence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await getRecentErrors(20, "repo-456");

      expect(prisma.errorOccurrence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { repositoryId: "repo-456" },
        })
      );
    });
  });

  describe("markErrorResolved", () => {
    it("should mark error as resolved", async () => {
      (prisma.errorOccurrence.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "err-1",
        resolved: true,
      });

      await markErrorResolved("err-1");

      expect(prisma.errorOccurrence.update).toHaveBeenCalledWith({
        where: { id: "err-1" },
        data: {
          resolved: true,
          resolution: undefined,
        },
      });
    });

    it("should include resolution description", async () => {
      (prisma.errorOccurrence.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "err-2",
        resolved: true,
      });

      await markErrorResolved("err-2", "Fixed by updating API key");

      expect(prisma.errorOccurrence.update).toHaveBeenCalledWith({
        where: { id: "err-2" },
        data: {
          resolved: true,
          resolution: "Fixed by updating API key",
        },
      });
    });
  });

  describe("cleanupOldErrors", () => {
    it("should delete old resolved errors", async () => {
      (prisma.errorOccurrence.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 15,
      });

      const count = await cleanupOldErrors(30);

      expect(count).toBe(15);
      expect(prisma.errorOccurrence.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resolved: true,
          }),
        })
      );
    });

    it("should use default 30 days if not specified", async () => {
      (prisma.errorOccurrence.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 0,
      });

      await cleanupOldErrors();

      expect(prisma.errorOccurrence.deleteMany).toHaveBeenCalled();
    });

    it("should use custom days parameter", async () => {
      (prisma.errorOccurrence.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 5,
      });

      await cleanupOldErrors(7);

      // The cutoff date calculation is internal, but we verify the function was called
      expect(prisma.errorOccurrence.deleteMany).toHaveBeenCalled();
    });
  });

  describe("isErrorFrequent", () => {
    it("should return true when error count exceeds threshold", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(15);

      const result = await isErrorFrequent("RATE_LIMIT", 10);

      expect(result).toBe(true);
    });

    it("should return false when error count is below threshold", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      const result = await isErrorFrequent("RATE_LIMIT", 10);

      expect(result).toBe(false);
    });

    it("should return true when error count equals threshold", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

      const result = await isErrorFrequent("RATE_LIMIT", 10);

      expect(result).toBe(true);
    });

    it("should use default threshold of 10", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(11);

      const result = await isErrorFrequent("GITHUB_API");

      expect(result).toBe(true);
    });

    it("should filter by repository ID", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      await isErrorFrequent("RATE_LIMIT", 10, "repo-789");

      expect(prisma.errorOccurrence.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            repositoryId: "repo-789",
          }),
        })
      );
    });
  });

  describe("getErrorRate", () => {
    it("should calculate error rate per hour", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

      const rate = await getErrorRate(1);

      expect(rate).toBe(10);
    });

    it("should calculate rate over multiple hours", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(20);

      const rate = await getErrorRate(4);

      expect(rate).toBe(5); // 20 / 4 hours = 5 per hour
    });

    it("should filter by repository ID", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(6);

      await getErrorRate(2, "repo-abc");

      expect(prisma.errorOccurrence.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            repositoryId: "repo-abc",
          }),
        })
      );
    });

    it("should use default 1 hour if not specified", async () => {
      (prisma.errorOccurrence.count as ReturnType<typeof vi.fn>).mockResolvedValue(8);

      const rate = await getErrorRate();

      expect(rate).toBe(8);
    });
  });
});
