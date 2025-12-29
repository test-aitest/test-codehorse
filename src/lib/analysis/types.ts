/**
 * Phase 3: Cross-file Dependency Analysis Types
 *
 * クロスファイル依存関係分析の型定義
 */

import { ImportType, SymbolType } from "@prisma/client";

// ========================================
// 依存関係グラフの型
// ========================================

export interface DependencyNode {
  filePath: string;
  imports: DependencyEdge[];
  exports: ExportInfo[];
}

export interface DependencyEdge {
  targetFile: string;
  importType: ImportType;
  importedSymbols: string[];
}

export interface ExportInfo {
  symbolName: string;
  symbolType: SymbolType;
  signature?: string;
  isDefault: boolean;
  lineNumber?: number;
}

// ========================================
// 影響分析の型
// ========================================

export interface ImpactAnalysisResult {
  /** 変更されたファイル */
  changedFiles: string[];
  /** 影響を受けるファイル（変更ファイルを直接インポートしている） */
  directlyAffected: AffectedFile[];
  /** 間接的に影響を受けるファイル（推移的依存） */
  transitivelyAffected: AffectedFile[];
  /** 影響を受けるテストファイル */
  affectedTests: string[];
  /** 破壊的変更の警告 */
  breakingChanges: BreakingChangeWarning[];
  /** 循環依存の警告 */
  circularDependencies: CircularDependency[];
  /** 全体の影響スコア (0-100) */
  impactScore: number;
}

export interface AffectedFile {
  filePath: string;
  /** どのファイルの変更により影響を受けるか */
  affectedBy: string;
  /** インポートしているシンボル */
  importedSymbols: string[];
  /** 推移的依存の深さ (1 = 直接依存) */
  depth: number;
}

// ========================================
// 破壊的変更の型
// ========================================

export interface BreakingChangeWarning {
  type: BreakingChangeType;
  filePath: string;
  symbolName: string;
  description: string;
  severity: "critical" | "warning" | "info";
  affectedFiles: string[];
  suggestion?: string;
}

export type BreakingChangeType =
  | "removed_export"      // エクスポートが削除された
  | "signature_changed"   // 関数シグネチャが変更された
  | "type_changed"        // 型定義が変更された
  | "renamed_export"      // エクスポート名が変更された
  | "default_to_named"    // default exportからnamed exportへ変更
  | "named_to_default";   // named exportからdefault exportへ変更

// ========================================
// 循環依存の型
// ========================================

export interface CircularDependency {
  /** 循環に含まれるファイルパス */
  cycle: string[];
  /** 循環の長さ */
  length: number;
  /** 問題の深刻度 */
  severity: "critical" | "warning";
}

// ========================================
// Blast Radius（影響範囲）の型
// ========================================

export interface BlastRadius {
  /** 変更ファイル */
  changedFile: string;
  /** 直接影響を受けるファイル数 */
  directCount: number;
  /** 間接的に影響を受けるファイル数 */
  transitiveCount: number;
  /** 全影響ファイル数 */
  totalCount: number;
  /** 影響を受けるファイル一覧 */
  affectedFiles: BlastRadiusEntry[];
  /** 影響スコア (0-100) */
  score: number;
}

export interface BlastRadiusEntry {
  filePath: string;
  depth: number;
  importedSymbols: string[];
  isTest: boolean;
}

// ========================================
// 依存関係インデキシングの型
// ========================================

export interface DependencyExtractionResult {
  filePath: string;
  imports: ExtractedImport[];
  exports: ExtractedExport[];
  errors: string[];
}

export interface ExtractedImport {
  sourcePath: string;   // インポート元（相対パスまたはパッケージ名）
  resolvedPath?: string; // 解決後の絶対パス
  importType: ImportType;
  importedSymbols: string[];
  isExternal: boolean;  // 外部パッケージかどうか
}

export interface ExtractedExport {
  symbolName: string;
  symbolType: SymbolType;
  signature?: string;
  isDefault: boolean;
  lineNumber: number;
}

// ========================================
// グラフ操作の型
// ========================================

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  /** ファイルパス -> このファイルをインポートしているファイル一覧 */
  reverseIndex: Map<string, string[]>;
}

export interface GraphTraversalOptions {
  /** 最大深さ（-1 で無制限） */
  maxDepth?: number;
  /** テストファイルを含めるか */
  includeTests?: boolean;
  /** 外部パッケージを含めるか */
  includeExternal?: boolean;
  /** 特定のファイルパターンを除外 */
  excludePatterns?: string[];
}
