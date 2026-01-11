/**
 * LeetCode Review Formatter
 * 評価結果をPRレビューコメント形式にフォーマットする
 */

import type {
  LeetCodeEvaluationResult,
  BenchmarkResult,
  ComplexityAnalysis,
  QualitativeReview,
  FailureAnalysis,
  OptimalSolutionWithBenchmark,
  SupportedLanguage,
} from "./types";
import { formatComplexitySummary } from "./complexity-analyzer";
import { formatQualitativeReview } from "./qualitative-review";
import { formatFailureAnalysis } from "./failure-analyzer";
import { generateBenchmarkSummary, calculateImprovement } from "./code-runner/benchmark";

/**
 * フォーマット設定
 */
export interface FormatOptions {
  /** 言語（日本語/英語） */
  language?: "ja" | "en";
  /** 詳細モード */
  detailed?: boolean;
  /** 最適解のコードを含めるか */
  includeOptimalCode?: boolean;
}

const DEFAULT_OPTIONS: FormatOptions = {
  language: "en",
  detailed: true,
  includeOptimalCode: true,
};

/**
 * 評価結果をPRレビューコメントにフォーマット
 */
export function formatLeetCodeReview(
  result: LeetCodeEvaluationResult,
  options: FormatOptions = DEFAULT_OPTIONS
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const isJa = opts.language === "ja";

  let output = "";

  // ヘッダー
  output += isJa
    ? "## LeetCode ソリューションレビュー\n\n"
    : "## LeetCode Solution Review\n\n";

  // 問題情報
  output += formatProblemInfo(result.submission.problemUrl, isJa);

  // テスト失敗時
  if (result.failureAnalysis) {
    output += formatTestFailure(result.failureAnalysis, isJa);
    return output;
  }

  // ユーザーソリューションの評価
  output += formatUserSolutionSection(
    result.userBenchmark,
    result.complexityAnalysis,
    result.qualitativeReview,
    isJa,
    opts.detailed
  );

  // 最適解セクション
  if (result.optimalSolutions && result.optimalSolutions.length > 0) {
    output += formatOptimalSection(
      result.optimalSolutions,
      result.bestSolution,
      result.userBenchmark,
      isJa,
      opts.includeOptimalCode
    );
  }

  // フッター
  output += formatFooter(isJa);

  return output;
}

/**
 * 問題情報をフォーマット
 */
function formatProblemInfo(problemUrl: string, isJa: boolean): string {
  const label = isJa ? "問題" : "Problem";
  return `**${label}:** [${problemUrl}](${problemUrl})\n\n---\n\n`;
}

/**
 * テスト失敗セクションをフォーマット
 */
function formatTestFailure(analysis: FailureAnalysis, isJa: boolean): string {
  const header = isJa
    ? "## ❌ テスト失敗\n\n"
    : "## ❌ Test Failed\n\n";

  const intro = isJa
    ? `${analysis.failedTestCases.length}件のテストケースが失敗しました。\n\n`
    : `${analysis.failedTestCases.length} test case(s) failed.\n\n`;

  return header + intro + formatFailureAnalysis(analysis);
}

/**
 * ユーザーソリューションセクションをフォーマット
 */
function formatUserSolutionSection(
  benchmark: BenchmarkResult,
  complexity: ComplexityAnalysis,
  qualitative: QualitativeReview,
  isJa: boolean,
  detailed?: boolean
): string {
  const header = isJa
    ? "### あなたのソリューション\n\n"
    : "### Your Solution\n\n";

  let output = header;

  // パフォーマンスメトリクス
  const perfHeader = isJa ? "#### パフォーマンス\n\n" : "#### Performance\n\n";
  output += perfHeader;
  output += generateBenchmarkSummary(benchmark);
  output += "\n\n";

  // 計算量
  output += formatComplexitySummary(complexity);
  output += "\n\n";

  // 定性評価（詳細モード時のみ）
  if (detailed) {
    output += formatQualitativeReview(qualitative);
    output += "\n";
  } else {
    output += formatBriefQualitative(qualitative, isJa);
    output += "\n";
  }

  output += "---\n\n";

  return output;
}

/**
 * 簡潔な定性評価
 */
function formatBriefQualitative(review: QualitativeReview, isJa: boolean): string {
  const header = isJa ? "#### コード品質\n\n" : "#### Code Quality\n\n";
  const scoreLabel = isJa ? "総合スコア" : "Overall Score";

  return `${header}**${scoreLabel}:** ${review.overallScore}/10\n`;
}

/**
 * 最適解セクションをフォーマット
 */
function formatOptimalSection(
  solutions: OptimalSolutionWithBenchmark[],
  bestSolution: OptimalSolutionWithBenchmark | undefined,
  userBenchmark: BenchmarkResult,
  isJa: boolean,
  includeCode?: boolean
): string {
  const header = isJa
    ? "### 🏆 最適解\n\n"
    : "### 🏆 Optimal Solution\n\n";

  let output = header;

  if (!bestSolution) {
    const noOptimal = isJa
      ? "最適解の生成に失敗しました。\n"
      : "Failed to generate optimal solution.\n";
    return output + noOptimal;
  }

  // アルゴリズム名
  output += `**${isJa ? "アルゴリズム" : "Algorithm"}:** ${bestSolution.algorithmName}\n\n`;

  // パフォーマンス比較
  output += formatPerformanceComparison(userBenchmark, bestSolution.benchmark, isJa);

  // 計算量
  output += `**${isJa ? "時間計算量" : "Time Complexity"}:** ${bestSolution.expectedTimeComplexity}\n`;
  output += `**${isJa ? "空間計算量" : "Space Complexity"}:** ${bestSolution.expectedSpaceComplexity}\n\n`;

  // 説明
  const whyHeader = isJa ? "#### なぜこれが最適か\n\n" : "#### Why This is Optimal\n\n";
  output += whyHeader;
  output += bestSolution.explanation;
  output += "\n\n";

  // コード（オプション）
  if (includeCode) {
    const codeHeader = isJa ? "#### ソースコード\n\n" : "#### Source Code\n\n";
    output += codeHeader;
    output += "```\n";
    output += bestSolution.code;
    output += "\n```\n\n";
  }

  // 他の候補（折りたたみ）
  if (solutions.length > 1) {
    output += formatOtherCandidates(solutions, bestSolution.index, isJa);
  }

  return output;
}

/**
 * パフォーマンス比較をフォーマット
 */
function formatPerformanceComparison(
  userBenchmark: BenchmarkResult,
  optimalBenchmark: BenchmarkResult,
  isJa: boolean
): string {
  const improvement = calculateImprovement(userBenchmark, optimalBenchmark);

  const header = isJa ? "#### パフォーマンス比較\n\n" : "#### Performance Comparison\n\n";

  let output = header;

  output += "| | " + (isJa ? "あなたの解" : "Your Solution") + " | ";
  output += (isJa ? "最適解" : "Optimal") + " |\n";
  output += "|---|---|---|\n";
  output += `| ${isJa ? "平均実行時間" : "Avg Time"} | ${userBenchmark.averageTimeMs.toFixed(2)}ms | ${optimalBenchmark.averageTimeMs.toFixed(2)}ms |\n`;

  if (improvement.percentageImprovement > 0) {
    const improvementLabel = isJa ? "改善率" : "Improvement";
    output += `| **${improvementLabel}** | | **${improvement.percentageImprovement.toFixed(1)}% ${isJa ? "高速化" : "faster"}** |\n`;
  }

  output += "\n";

  return output;
}

/**
 * 他の候補をフォーマット（折りたたみ）
 */
function formatOtherCandidates(
  solutions: OptimalSolutionWithBenchmark[],
  bestIndex: number,
  isJa: boolean
): string {
  const header = isJa ? "その他の候補" : "Other Candidates";
  const others = solutions.filter((s) => s.index !== bestIndex);

  if (others.length === 0) return "";

  let output = `<details>\n<summary>${header} (${others.length})</summary>\n\n`;

  others.forEach((sol) => {
    output += `#### ${sol.algorithmName}\n`;
    output += `- ${isJa ? "時間計算量" : "Time"}: ${sol.expectedTimeComplexity}\n`;
    output += `- ${isJa ? "空間計算量" : "Space"}: ${sol.expectedSpaceComplexity}\n`;
    output += `- ${isJa ? "平均実行時間" : "Avg Time"}: ${sol.benchmark.averageTimeMs.toFixed(2)}ms\n\n`;

    // ソースコードを表示
    output += `<details>\n<summary>${isJa ? "ソースコードを表示" : "Show Source Code"}</summary>\n\n`;
    output += "```\n";
    output += sol.code;
    output += "\n```\n\n";
    output += "</details>\n\n";
  });

  output += "</details>\n\n";

  return output;
}

/**
 * フッターをフォーマット
 */
function formatFooter(isJa: boolean): string {
  const footer = isJa
    ? "---\n\n*このレビューはAIによって生成されました。*"
    : "---\n\n*This review was generated by AI.*";

  return footer;
}

/**
 * 簡潔なサマリーを生成（通知用など）
 */
export function formatBriefSummary(
  result: LeetCodeEvaluationResult,
  isJa: boolean = true
): string {
  if (result.failureAnalysis) {
    return isJa
      ? `❌ テスト失敗: ${result.failureAnalysis.failedTestCases.length}件`
      : `❌ Test Failed: ${result.failureAnalysis.failedTestCases.length} case(s)`;
  }

  const score = result.qualitativeReview.overallScore;
  const time = result.userBenchmark.averageTimeMs.toFixed(2);

  if (result.bestSolution) {
    const improvement = calculateImprovement(
      result.userBenchmark,
      result.bestSolution.benchmark
    );

    if (improvement.percentageImprovement > 0) {
      return isJa
        ? `✅ スコア: ${score}/10 | 時間: ${time}ms | 最適解で${improvement.percentageImprovement.toFixed(0)}%高速化可能`
        : `✅ Score: ${score}/10 | Time: ${time}ms | ${improvement.percentageImprovement.toFixed(0)}% faster with optimal`;
    }
  }

  return isJa
    ? `✅ スコア: ${score}/10 | 時間: ${time}ms`
    : `✅ Score: ${score}/10 | Time: ${time}ms`;
}
