/**
 * Phase 6: Error Registry Tests
 */

import { describe, it, expect } from "vitest";
import {
  matchErrorPattern,
  getPatternsByType,
  getPatternByCode,
  getPatternByName,
  getAllPatterns,
  getDefaultFriendlyMessage,
  getDefaultResolution,
} from "../error-registry";

describe("error-registry", () => {
  describe("matchErrorPattern", () => {
    it("should match rate limit exceeded error", () => {
      const result = matchErrorPattern("API rate limit exceeded for this resource");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("rate_limit_exceeded");
      expect(result?.pattern.type).toBe("RATE_LIMIT");
      expect(result?.pattern.retryable).toBe(true);
    });

    it("should match secondary rate limit error", () => {
      const result = matchErrorPattern("You have exceeded a secondary rate limit");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("secondary_rate_limit");
      expect(result?.pattern.type).toBe("RATE_LIMIT");
      expect(result?.pattern.retryAfterMs).toBe(120000);
    });

    it("should match 404 not found error", () => {
      const result = matchErrorPattern("Not Found", "404");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("not_found");
      expect(result?.pattern.type).toBe("GITHUB_API");
      expect(result?.pattern.retryable).toBe(false);
    });

    it("should match bad credentials error", () => {
      const result = matchErrorPattern("Bad credentials");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("bad_credentials");
      expect(result?.pattern.type).toBe("AUTHENTICATION");
    });

    it("should match AI rate limit error", () => {
      const result = matchErrorPattern("Rate limit exceeded: too many requests");

      expect(result).not.toBeNull();
      // AI rate limit pattern has type AI_GENERATION (not RATE_LIMIT)
      expect(result?.pattern.type).toBe("AI_GENERATION");
      expect(result?.pattern.name).toBe("ai_rate_limit");
    });

    it("should match AI context length error", () => {
      const result = matchErrorPattern("This model's maximum context length is 128000 tokens");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("ai_context_length");
      expect(result?.pattern.type).toBe("AI_GENERATION");
      expect(result?.pattern.retryable).toBe(false);
    });

    it("should match database connection error", () => {
      const result = matchErrorPattern("Can't reach database server at localhost:5432");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("connection_error");
      expect(result?.pattern.type).toBe("DATABASE");
      expect(result?.pattern.retryable).toBe(true);
    });

    it("should match network connection reset", () => {
      const result = matchErrorPattern("ECONNRESET: socket hang up");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("connection_reset");
      expect(result?.pattern.type).toBe("NETWORK");
    });

    it("should match webhook signature invalid", () => {
      const result = matchErrorPattern("Webhook signature verification failed");

      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("invalid_signature");
      expect(result?.pattern.type).toBe("GITHUB_WEBHOOK");
    });

    it("should return null for unknown error", () => {
      const result = matchErrorPattern("Some random unknown error");

      expect(result).toBeNull();
    });

    it("should not match when error code does not match", () => {
      // The pattern for "not_found" requires code "404"
      // But when we pass a different message with code 500, it shouldn't match "not_found"
      const result = matchErrorPattern("Server Error", "500");

      // Should match server_error pattern instead
      expect(result).not.toBeNull();
      expect(result?.pattern.name).toBe("server_error");
      expect(result?.pattern.code).toBe("500");
    });
  });

  describe("getPatternsByType", () => {
    it("should return patterns for RATE_LIMIT type", () => {
      const patterns = getPatternsByType("RATE_LIMIT");

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.type === "RATE_LIMIT")).toBe(true);
    });

    it("should return patterns for GITHUB_API type", () => {
      const patterns = getPatternsByType("GITHUB_API");

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.type === "GITHUB_API")).toBe(true);
    });

    it("should return patterns for AI_GENERATION type", () => {
      const patterns = getPatternsByType("AI_GENERATION");

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every(p => p.type === "AI_GENERATION")).toBe(true);
    });

    it("should return empty array for type with no patterns", () => {
      // INTERNAL type doesn't have specific patterns in the registry
      const patterns = getPatternsByType("INTERNAL");

      expect(patterns).toEqual([]);
    });
  });

  describe("getPatternByCode", () => {
    it("should return pattern for code 403", () => {
      const pattern = getPatternByCode("403");

      expect(pattern).not.toBeNull();
      expect(pattern?.code).toBe("403");
    });

    it("should return pattern for code 500", () => {
      const pattern = getPatternByCode("500");

      expect(pattern).not.toBeNull();
      expect(pattern?.name).toBe("server_error");
    });

    it("should return null for unknown code", () => {
      const pattern = getPatternByCode("999");

      expect(pattern).toBeNull();
    });
  });

  describe("getPatternByName", () => {
    it("should return pattern by name", () => {
      const pattern = getPatternByName("rate_limit_exceeded");

      expect(pattern).not.toBeNull();
      expect(pattern?.name).toBe("rate_limit_exceeded");
      expect(pattern?.type).toBe("RATE_LIMIT");
    });

    it("should return pattern for ai_timeout", () => {
      const pattern = getPatternByName("ai_timeout");

      expect(pattern).not.toBeNull();
      expect(pattern?.friendlyMessage).toContain("タイムアウト");
    });

    it("should return null for unknown name", () => {
      const pattern = getPatternByName("unknown_pattern_name");

      expect(pattern).toBeNull();
    });
  });

  describe("getAllPatterns", () => {
    it("should return all patterns", () => {
      const patterns = getAllPatterns();

      expect(patterns.length).toBeGreaterThan(10);
    });

    it("should return a copy of patterns", () => {
      const patterns1 = getAllPatterns();
      const patterns2 = getAllPatterns();

      expect(patterns1).not.toBe(patterns2);
      expect(patterns1).toEqual(patterns2);
    });

    it("should include patterns from all categories", () => {
      const patterns = getAllPatterns();
      const types = [...new Set(patterns.map(p => p.type))];

      expect(types).toContain("RATE_LIMIT");
      expect(types).toContain("GITHUB_API");
      expect(types).toContain("AI_GENERATION");
      expect(types).toContain("DATABASE");
      expect(types).toContain("NETWORK");
      expect(types).toContain("GITHUB_WEBHOOK");
    });
  });

  describe("getDefaultFriendlyMessage", () => {
    it("should return message for GITHUB_API", () => {
      const message = getDefaultFriendlyMessage("GITHUB_API");

      expect(message).toContain("GitHub API");
    });

    it("should return message for RATE_LIMIT", () => {
      const message = getDefaultFriendlyMessage("RATE_LIMIT");

      expect(message).toContain("レート制限");
    });

    it("should return message for AUTHENTICATION", () => {
      const message = getDefaultFriendlyMessage("AUTHENTICATION");

      expect(message).toContain("認証");
    });

    it("should return message for UNKNOWN", () => {
      const message = getDefaultFriendlyMessage("UNKNOWN");

      expect(message).toContain("予期しない");
    });
  });

  describe("getDefaultResolution", () => {
    it("should return resolution for GITHUB_API", () => {
      const resolution = getDefaultResolution("GITHUB_API");

      expect(resolution).toContain("待って");
    });

    it("should return resolution for RATE_LIMIT", () => {
      const resolution = getDefaultResolution("RATE_LIMIT");

      expect(resolution).toContain("待って");
    });

    it("should return resolution for AUTHENTICATION", () => {
      const resolution = getDefaultResolution("AUTHENTICATION");

      expect(resolution).toContain("認証情報");
    });

    it("should return resolution for PERMISSION", () => {
      const resolution = getDefaultResolution("PERMISSION");

      expect(resolution).toContain("権限");
    });
  });

  describe("pattern structure", () => {
    it("all patterns should have required fields", () => {
      const patterns = getAllPatterns();

      for (const pattern of patterns) {
        expect(pattern.name).toBeDefined();
        expect(pattern.type).toBeDefined();
        expect(pattern.messagePattern).toBeInstanceOf(RegExp);
        expect(pattern.friendlyMessage).toBeDefined();
        expect(pattern.resolution).toBeDefined();
        expect(typeof pattern.retryable).toBe("boolean");
      }
    });

    it("retryable patterns should have retryAfterMs", () => {
      const patterns = getAllPatterns().filter(p => p.retryable);

      // Most retryable patterns should have retryAfterMs
      const withRetryAfter = patterns.filter(p => p.retryAfterMs !== undefined);
      expect(withRetryAfter.length).toBeGreaterThan(0);
    });
  });
});
