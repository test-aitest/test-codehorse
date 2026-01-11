/**
 * LeetCode Review Formatter
 * Format evaluation results as PR review comments
 */

import type {
  LeetCodeEvaluationResult,
  BenchmarkResult,
  ComplexityAnalysis,
  QualitativeReview,
  FailureAnalysis,
  OptimalSolutionWithBenchmark,
} from "./types";
import { formatComplexitySummary } from "./complexity-analyzer";
import { formatQualitativeReview } from "./qualitative-review";
import { formatFailureAnalysis } from "./failure-analyzer";
import { generateBenchmarkSummary, calculateImprovement } from "./code-runner/benchmark";

/**
 * Format options
 */
export interface FormatOptions {
  /** Detailed mode */
  detailed?: boolean;
  /** Include optimal solution code */
  includeOptimalCode?: boolean;
}

const DEFAULT_OPTIONS: FormatOptions = {
  detailed: true,
  includeOptimalCode: true,
};

/**
 * Format evaluation results as PR review comment
 */
export function formatLeetCodeReview(
  result: LeetCodeEvaluationResult,
  options: FormatOptions = DEFAULT_OPTIONS
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let output = "";

  // Header
  output += "## LeetCode Solution Review\n\n";

  // Problem info
  output += formatProblemInfo(result.submission.problemUrl);

  // Test failure
  if (result.failureAnalysis) {
    output += formatTestFailure(result.failureAnalysis);
    return output;
  }

  // User solution evaluation
  output += formatUserSolutionSection(
    result.userBenchmark,
    result.complexityAnalysis,
    result.qualitativeReview,
    opts.detailed
  );

  // Optimal solution section
  if (result.optimalSolutions && result.optimalSolutions.length > 0) {
    output += formatOptimalSection(
      result.optimalSolutions,
      result.bestSolution,
      result.userBenchmark,
      opts.includeOptimalCode
    );
  }

  // Footer
  output += formatFooter();

  return output;
}

/**
 * Format problem info
 */
function formatProblemInfo(problemUrl: string): string {
  return `**Problem:** [${problemUrl}](${problemUrl})\n\n---\n\n`;
}

/**
 * Format test failure section
 */
function formatTestFailure(analysis: FailureAnalysis): string {
  const header = "## ❌ Test Failed\n\n";
  const intro = `${analysis.failedTestCases.length} test case(s) failed.\n\n`;

  return header + intro + formatFailureAnalysis(analysis);
}

/**
 * Format user solution section
 */
function formatUserSolutionSection(
  benchmark: BenchmarkResult,
  complexity: ComplexityAnalysis,
  qualitative: QualitativeReview,
  detailed?: boolean
): string {
  let output = "### Your Solution\n\n";

  // Performance metrics
  output += "#### Performance\n\n";
  output += generateBenchmarkSummary(benchmark);
  output += "\n\n";

  // Complexity
  output += formatComplexitySummary(complexity);
  output += "\n\n";

  // Qualitative evaluation
  if (detailed) {
    output += formatQualitativeReview(qualitative);
    output += "\n";
  } else {
    output += formatBriefQualitative(qualitative);
    output += "\n";
  }

  output += "---\n\n";

  return output;
}

/**
 * Brief qualitative evaluation
 */
function formatBriefQualitative(review: QualitativeReview): string {
  return `#### Code Quality\n\n**Overall Score:** ${review.overallScore}/10\n`;
}

/**
 * Format optimal solution section
 */
function formatOptimalSection(
  solutions: OptimalSolutionWithBenchmark[],
  bestSolution: OptimalSolutionWithBenchmark | undefined,
  userBenchmark: BenchmarkResult,
  includeCode?: boolean
): string {
  let output = "### 🏆 Optimal Solution\n\n";

  if (!bestSolution) {
    return output + "Failed to generate optimal solution.\n";
  }

  // Algorithm name
  output += `**Algorithm:** ${bestSolution.algorithmName}\n\n`;

  // Performance comparison
  output += formatPerformanceComparison(userBenchmark, bestSolution.benchmark);

  // Complexity
  output += `**Time Complexity:** ${bestSolution.expectedTimeComplexity}\n`;
  output += `**Space Complexity:** ${bestSolution.expectedSpaceComplexity}\n\n`;

  // Explanation
  output += "#### Why This is Optimal\n\n";
  output += bestSolution.explanation;
  output += "\n\n";

  // Code (optional)
  if (includeCode) {
    output += "#### Source Code\n\n";
    output += "```\n";
    output += bestSolution.code;
    output += "\n```\n\n";
  }

  // Other candidates (collapsible)
  if (solutions.length > 1) {
    output += formatOtherCandidates(solutions, bestSolution.index);
  }

  return output;
}

/**
 * Format performance comparison
 */
function formatPerformanceComparison(
  userBenchmark: BenchmarkResult,
  optimalBenchmark: BenchmarkResult
): string {
  const improvement = calculateImprovement(userBenchmark, optimalBenchmark);

  let output = "#### Performance Comparison\n\n";

  output += "| | Your Solution | Optimal |\n";
  output += "|---|---|---|\n";
  output += `| Avg Time | ${userBenchmark.averageTimeMs.toFixed(2)}ms | ${optimalBenchmark.averageTimeMs.toFixed(2)}ms |\n`;

  if (improvement.percentageImprovement > 0) {
    output += `| **Improvement** | | **${improvement.percentageImprovement.toFixed(1)}% faster** |\n`;
  }

  output += "\n";

  return output;
}

/**
 * Format other candidates (collapsible)
 */
function formatOtherCandidates(
  solutions: OptimalSolutionWithBenchmark[],
  bestIndex: number
): string {
  const others = solutions.filter((s) => s.index !== bestIndex);

  if (others.length === 0) return "";

  let output = `<details>\n<summary>Other Candidates (${others.length})</summary>\n\n`;

  others.forEach((sol) => {
    output += `#### ${sol.algorithmName}\n`;
    output += `- Time: ${sol.expectedTimeComplexity}\n`;
    output += `- Space: ${sol.expectedSpaceComplexity}\n`;
    output += `- Avg Time: ${sol.benchmark.averageTimeMs.toFixed(2)}ms\n\n`;

    // Show source code
    output += `<details>\n<summary>Show Source Code</summary>\n\n`;
    output += "```\n";
    output += sol.code;
    output += "\n```\n\n";
    output += "</details>\n\n";
  });

  output += "</details>\n\n";

  return output;
}

/**
 * Format footer
 */
function formatFooter(): string {
  return "---\n\n*This review was generated by AI.*";
}

/**
 * Generate brief summary (for notifications, etc.)
 */
export function formatBriefSummary(result: LeetCodeEvaluationResult): string {
  if (result.failureAnalysis) {
    return `❌ Test Failed: ${result.failureAnalysis.failedTestCases.length} case(s)`;
  }

  const score = result.qualitativeReview.overallScore;
  const time = result.userBenchmark.averageTimeMs.toFixed(2);

  if (result.bestSolution) {
    const improvement = calculateImprovement(
      result.userBenchmark,
      result.bestSolution.benchmark
    );

    if (improvement.percentageImprovement > 0) {
      return `✅ Score: ${score}/10 | Time: ${time}ms | ${improvement.percentageImprovement.toFixed(0)}% faster with optimal`;
    }
  }

  return `✅ Score: ${score}/10 | Time: ${time}ms`;
}
