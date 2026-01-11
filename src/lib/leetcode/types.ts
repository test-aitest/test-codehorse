/**
 * LeetCode Solution Types
 * LeetCode最適解提案機能の型定義
 */

// サポートする言語
export type SupportedLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "go";

// 言語の拡張子マッピング
export const LANGUAGE_EXTENSIONS: Record<string, SupportedLanguage> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".java": "java",
  ".go": "go",
};

// テストケース
export interface TestCase {
  input: string;
  expectedOutput: string;
}

// PRから抽出されたLeetCode提出情報
export interface LeetCodeSubmission {
  problemUrl: string;
  problemId: string; // URLから抽出 (e.g., "two-sum")
  language: SupportedLanguage;
  testCases: TestCase[];
  userCode: string;
  filePath: string;
}

// 単一実行の結果
export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTimeMs: number;
  memoryUsageMb?: number;
}

// ベンチマーク結果（20回実行）
export interface BenchmarkResult {
  totalRuns: number;
  successfulRuns: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  stdDevMs: number;
  allCorrect: boolean;
  results: ExecutionResult[];
  failedTestCases?: {
    index: number;
    input: string;
    expected: string;
    actual: string;
  }[];
}

// 計算量分析結果
export interface ComplexityAnalysis {
  timeComplexity: string; // "O(n)", "O(n log n)", etc.
  spaceComplexity: string; // "O(1)", "O(n)", etc.
  explanation: string;
}

// 定性評価結果
export interface QualitativeReview {
  codeCleanness: number; // 1-10
  readability: number; // 1-10
  efficiency: number; // 1-10
  overallScore: number; // 1-10
  suggestions: string[];
  alternativeAlgorithms: AlgorithmSuggestion[];
}

// アルゴリズム提案
export interface AlgorithmSuggestion {
  name: string; // "Two Pointer", "Binary Search", etc.
  description: string;
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  applicability: string;
}

// AI生成の最適解
export interface OptimalSolution {
  index: number;
  algorithmName: string;
  code: string;
  expectedTimeComplexity: string;
  expectedSpaceComplexity: string;
  explanation: string;
}

// 最適解 + ベンチマーク結果
export interface OptimalSolutionWithBenchmark extends OptimalSolution {
  benchmark: BenchmarkResult;
}

// 失敗分析結果
export interface FailureAnalysis {
  failedTestCases: {
    index: number;
    input: string;
    expected: string;
    actual: string;
  }[];
  analysis: string;
  suggestedFix: string;
  rootCause: string;
}

// LeetCode評価の全体結果
export interface LeetCodeEvaluationResult {
  submission: LeetCodeSubmission;

  // ユーザーコード評価
  userBenchmark: BenchmarkResult;
  complexityAnalysis: ComplexityAnalysis;
  qualitativeReview: QualitativeReview;

  // 失敗時の分析（テスト失敗時のみ）
  failureAnalysis?: FailureAnalysis;

  // 最適解（テスト成功時のみ）
  optimalSolutions?: OptimalSolutionWithBenchmark[];
  bestSolution?: OptimalSolutionWithBenchmark;
}

// セキュリティスキャン結果
export interface SecurityScanResult {
  safe: boolean;
  blockedPatterns: {
    pattern: string;
    line: number;
    description: string;
  }[];
}

// GitHub Actions へのペイロード
export interface BenchmarkPayload {
  evaluationId: string;
  code: string;
  language: SupportedLanguage;
  testCases: TestCase[];
  type: "user" | "optimal";
  solutionIndex?: number; // optimal の場合のみ
}

// GitHub Actions からの結果
export interface BenchmarkCallbackPayload {
  evaluationId: string;
  type: "user" | "optimal";
  solutionIndex?: number;
  result: BenchmarkResult;
}
