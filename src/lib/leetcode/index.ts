/**
 * LeetCode Optimizer
 * LeetCode最適解提案機能のエントリーポイント
 */

// 型定義
export * from "./types";

// テンプレートパーサー
export {
  parsePRDescription,
  detectLanguage,
  extractProblemId,
  isLeetCodePR,
  parseTestInput,
  normalizeOutput,
  compareOutputs,
} from "./template-parser";

// セキュリティスキャナー
export { scanCode, formatSecurityReport } from "./security/code-scanner";

// コードランナー
export {
  CodeRunner,
  validateBenchmarkCallback,
  calculateBenchmarkStats,
} from "./code-runner";

// ベンチマーク処理
export {
  normalizeBenchmarkResult,
  generateBenchmarkSummary,
  calculateImprovement,
} from "./code-runner/benchmark";

// AI分析機能
export {
  analyzeComplexity,
  compareComplexity,
  formatComplexitySummary,
} from "./complexity-analyzer";

export {
  generateQualitativeReview,
  formatQualitativeReview,
} from "./qualitative-review";

export {
  generateOptimalSolutions,
  formatOptimalSolutions,
} from "./optimal-generator";

export {
  analyzeFailure,
  formatFailureAnalysis,
} from "./failure-analyzer";

// レビューフォーマッター
export {
  formatLeetCodeReview,
  formatBriefSummary,
} from "./review-formatter";
