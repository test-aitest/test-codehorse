import { describe, it, expect } from 'vitest';
import {
  normalizeBenchmarkResult,
  generateBenchmarkSummary,
  calculateImprovement,
} from './benchmark';

describe('benchmark', () => {
  describe('normalizeBenchmarkResult', () => {
    it('should normalize valid benchmark result', () => {
      const raw = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 45.5,
        minTimeMs: 40,
        maxTimeMs: 55,
        stdDevMs: 3.2,
        allCorrect: true,
        results: [],
      };

      const result = normalizeBenchmarkResult(raw);

      expect(result.totalRuns).toBe(20);
      expect(result.successfulRuns).toBe(20);
      expect(result.averageTimeMs).toBe(45.5);
      expect(result.allCorrect).toBe(true);
    });

    it('should handle missing fields with defaults', () => {
      const raw = {
        averageTimeMs: 100,
      };

      const result = normalizeBenchmarkResult(raw);

      expect(result.totalRuns).toBe(0);
      expect(result.successfulRuns).toBe(0);
      expect(result.averageTimeMs).toBe(100);
      expect(result.allCorrect).toBe(false);
    });

    it('should handle null input', () => {
      const result = normalizeBenchmarkResult(null);

      expect(result.totalRuns).toBe(0);
      expect(result.allCorrect).toBe(false);
    });

    it('should normalize failed test cases', () => {
      const raw = {
        totalRuns: 20,
        allCorrect: false,
        failedTestCases: [
          { index: 0, input: '[1,2]', expected: '[0,1]', actual: '[1,0]' },
        ],
      };

      const result = normalizeBenchmarkResult(raw);

      expect(result.allCorrect).toBe(false);
      expect(result.failedTestCases).toHaveLength(1);
      expect(result.failedTestCases![0].index).toBe(0);
    });
  });

  describe('generateBenchmarkSummary', () => {
    it('should generate summary for successful benchmark', () => {
      const result = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 45.5,
        minTimeMs: 40,
        maxTimeMs: 55,
        stdDevMs: 3.2,
        allCorrect: true,
        results: [],
      };

      const summary = generateBenchmarkSummary(result);

      expect(summary).toContain('20/20');
      expect(summary).toContain('45.50ms');
      expect(summary).toContain('✅ Yes');
    });

    it('should indicate test failures', () => {
      const result = {
        totalRuns: 20,
        successfulRuns: 18,
        averageTimeMs: 45.5,
        minTimeMs: 40,
        maxTimeMs: 55,
        stdDevMs: 3.2,
        allCorrect: false,
        results: [],
      };

      const summary = generateBenchmarkSummary(result);

      expect(summary).toContain('18/20');
      expect(summary).toContain('❌ No');
    });
  });

  describe('calculateImprovement', () => {
    it('should calculate improvement percentage', () => {
      const original = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 100,
        minTimeMs: 90,
        maxTimeMs: 110,
        stdDevMs: 5,
        allCorrect: true,
        results: [],
      };

      const optimized = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 50,
        minTimeMs: 45,
        maxTimeMs: 55,
        stdDevMs: 3,
        allCorrect: true,
        results: [],
      };

      const improvement = calculateImprovement(original, optimized);

      expect(improvement.percentageImprovement).toBe(50);
      expect(improvement.timeImprovement).toBe(50);
    });

    it('should handle no improvement', () => {
      const original = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 50,
        minTimeMs: 45,
        maxTimeMs: 55,
        stdDevMs: 3,
        allCorrect: true,
        results: [],
      };

      const optimized = {
        totalRuns: 20,
        successfulRuns: 20,
        averageTimeMs: 60,
        minTimeMs: 55,
        maxTimeMs: 65,
        stdDevMs: 3,
        allCorrect: true,
        results: [],
      };

      const improvement = calculateImprovement(original, optimized);

      expect(improvement.percentageImprovement).toBeLessThan(0);
    });
  });
});
