/**
 * Phase 3: Cross-file Dependency Analysis
 *
 * クロスファイル依存関係分析モジュール
 */

// 型定義のエクスポート
export * from "./types";

// 依存関係グラフ
export {
  buildDependencyGraph,
  getImportDependencies,
  getImporters,
  getTransitiveImporters,
  detectCircularDependenciesForFile,
  isTestFile,
} from "./dependency-graph";

// 依存関係インデキシング
export {
  extractDependencies,
  saveDependencies,
  indexRepositoryDependencies,
} from "./dependency-indexer";

// 影響分析
export {
  analyzeImpact,
  formatImpactAnalysis,
  type ImpactAnalysisOptions,
} from "./impact-analyzer";

// 破壊的変更検出
export {
  detectBreakingChanges,
  getBreakingSeverity,
} from "./breaking-change-detector";

// Blast Radius計算
export {
  calculateBlastRadius,
  calculateTotalBlastRadius,
  summarizeBlastRadius,
  summarizeTotalBlastRadius,
  type BlastRadiusOptions,
  type TotalBlastRadius,
} from "./blast-radius-calculator";

// 関数解析 (Phase 4)
export {
  analyzeFunctions,
  extractNewFunctions,
  isTestableFunction,
  calculateComplexity,
  type FunctionInfo,
  type ParameterInfo,
  type AnalysisResult,
} from "./function-analyzer";

// エッジケース検出 (Phase 4)
export {
  detectEdgeCases,
  formatEdgeCasesMarkdown,
  type EdgeCase,
  type EdgeCaseCategory,
  type EdgeCaseAnalysis,
} from "./edge-case-detector";
