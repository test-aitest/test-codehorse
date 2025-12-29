/**
 * Phase 8: Performance Analysis Module
 *
 * パフォーマンス分析モジュールのエントリーポイント
 */

// メイン分析エンジン
export {
  analyzeFilePerformance,
  analyzePerformance,
  detectInefficientLoops,
  detectLargeBundleImports,
  detectBlockingOperations,
  isPerformanceAnalysisEnabled,
} from "./performance-analyzer";

// N+1クエリ検出
export {
  detectNPlusOneQueries,
  detectPrismaNPlusOne,
  isNPlusOneDetectionEnabled,
} from "./n-plus-one-detector";

// メモリリーク検出
export {
  detectMemoryLeaks,
  detectUnclearedTimers,
  detectUnremovedEventListeners,
  detectClosureLeaks,
  detectGlobalStateAccumulation,
  isMemoryLeakDetectionEnabled,
} from "./memory-leak-detector";

// React再レンダリング分析
export {
  detectReactRerenderIssues,
  detectInlineDefinitions,
  detectHookDependencyIssues,
  detectMissingMemo,
  detectMissingUseMemo,
  isReactRerenderDetectionEnabled,
} from "./react-render-analyzer";

// 型定義
export type {
  DetectedPerformanceIssue,
  PerformanceAnalysisResult,
  PerformanceAnalysisStats,
  PerformanceAnalysisOptions,
  PatternMatcher,
  PerformancePattern,
  QueryPattern,
  MemoryLeakPattern,
  ReactComponentInfo,
  RerenderIssue,
} from "./types";

export { DEFAULT_PERFORMANCE_OPTIONS } from "./types";
