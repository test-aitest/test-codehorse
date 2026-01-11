/**
 * ベンチマーク結果の処理
 */

import type { BenchmarkResult, ExecutionResult } from '../types';

/**
 * 生のベンチマーク結果を正規化
 */
export function normalizeBenchmarkResult(raw: unknown): BenchmarkResult {
  const defaultResult: BenchmarkResult = {
    totalRuns: 0,
    successfulRuns: 0,
    averageTimeMs: 0,
    minTimeMs: 0,
    maxTimeMs: 0,
    stdDevMs: 0,
    allCorrect: false,
    results: [],
  };

  if (typeof raw !== 'object' || raw === null) {
    return defaultResult;
  }

  const r = raw as Record<string, unknown>;

  return {
    totalRuns: typeof r.totalRuns === 'number' ? r.totalRuns : 0,
    successfulRuns: typeof r.successfulRuns === 'number' ? r.successfulRuns : 0,
    averageTimeMs: typeof r.averageTimeMs === 'number' ? r.averageTimeMs : 0,
    minTimeMs: typeof r.minTimeMs === 'number' ? r.minTimeMs : 0,
    maxTimeMs: typeof r.maxTimeMs === 'number' ? r.maxTimeMs : 0,
    stdDevMs: typeof r.stdDevMs === 'number' ? r.stdDevMs : 0,
    allCorrect: typeof r.allCorrect === 'boolean' ? r.allCorrect : false,
    results: Array.isArray(r.results) ? normalizeExecutionResults(r.results) : [],
    failedTestCases: Array.isArray(r.failedTestCases)
      ? normalizeFailedTestCases(r.failedTestCases)
      : undefined,
  };
}

/**
 * 実行結果を正規化
 */
function normalizeExecutionResults(results: unknown[]): ExecutionResult[] {
  return results.map((r) => {
    if (typeof r !== 'object' || r === null) {
      return {
        success: false,
        executionTimeMs: 0,
        output: '',
        error: 'Invalid result format',
      };
    }

    const result = r as Record<string, unknown>;

    return {
      success: typeof result.success === 'boolean' ? result.success : false,
      executionTimeMs: typeof result.executionTimeMs === 'number' ? result.executionTimeMs : 0,
      output: typeof result.output === 'string' ? result.output : '',
      error: typeof result.error === 'string' ? result.error : undefined,
    };
  });
}

/**
 * 失敗したテストケースを正規化
 */
function normalizeFailedTestCases(
  cases: unknown[]
): Array<{ index: number; input: string; expected: string; actual: string }> {
  return cases
    .filter((c) => typeof c === 'object' && c !== null)
    .map((c, idx) => {
      const tc = c as Record<string, unknown>;
      return {
        index: typeof tc.index === 'number' ? tc.index : idx,
        input: typeof tc.input === 'string' ? tc.input : '',
        expected: typeof tc.expected === 'string' ? tc.expected : '',
        actual: typeof tc.actual === 'string' ? tc.actual : '',
      };
    });
}

/**
 * ベンチマーク結果のサマリーを生成
 */
export function generateBenchmarkSummary(result: BenchmarkResult): string {
  const lines: string[] = [];

  lines.push(`**Runs:** ${result.successfulRuns}/${result.totalRuns} successful`);
  lines.push(`**Average Time:** ${result.averageTimeMs.toFixed(2)}ms`);
  lines.push(`**Min/Max:** ${result.minTimeMs.toFixed(2)}ms / ${result.maxTimeMs.toFixed(2)}ms`);
  lines.push(`**Std Dev:** ${result.stdDevMs.toFixed(2)}ms`);
  lines.push(`**All Correct:** ${result.allCorrect ? '✅ Yes' : '❌ No'}`);

  if (result.failedTestCases && result.failedTestCases.length > 0) {
    lines.push('');
    lines.push('**Failed Test Cases:**');
    for (const tc of result.failedTestCases) {
      lines.push(`- Input: \`${tc.input}\``);
      lines.push(`  - Expected: \`${tc.expected}\``);
      lines.push(`  - Actual: \`${tc.actual}\``);
    }
  }

  return lines.join('\n');
}

/**
 * パフォーマンス改善率を計算
 */
export function calculateImprovement(original: BenchmarkResult, optimized: BenchmarkResult): {
  timeImprovement: number;
  percentageImprovement: number;
} {
  if (original.averageTimeMs === 0) {
    return { timeImprovement: 0, percentageImprovement: 0 };
  }

  const timeImprovement = original.averageTimeMs - optimized.averageTimeMs;
  const percentageImprovement = (timeImprovement / original.averageTimeMs) * 100;

  return {
    timeImprovement,
    percentageImprovement,
  };
}
