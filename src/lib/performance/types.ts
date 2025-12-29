/**
 * Phase 8: Performance Analysis Types
 *
 * パフォーマンス分析の型定義
 */

import type { PerformanceIssueType, PerformanceSeverity } from "@prisma/client";

// ========================================
// 検出結果の型
// ========================================

/**
 * 検出されたパフォーマンス問題
 */
export interface DetectedPerformanceIssue {
  /** 問題の種類 */
  issueType: PerformanceIssueType;
  /** 重要度 */
  severity: PerformanceSeverity;
  /** ファイルパス */
  filePath: string;
  /** 開始行番号 */
  lineNumber: number;
  /** 終了行番号（範囲指定の場合） */
  endLineNumber?: number;
  /** 問題の説明 */
  description: string;
  /** 改善提案 */
  suggestion?: string;
  /** 問題のあるコードスニペット */
  codeSnippet?: string;
  /** 推定影響度 */
  estimatedImpact: "HIGH" | "MEDIUM" | "LOW";
  /** 検出に使用したパターン */
  patternId?: string;
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * パフォーマンス分析結果
 */
export interface PerformanceAnalysisResult {
  /** 検出された問題 */
  issues: DetectedPerformanceIssue[];
  /** 分析したファイル数 */
  filesAnalyzed: number;
  /** 分析時間（ms） */
  analysisTimeMs: number;
  /** 統計情報 */
  stats: PerformanceAnalysisStats;
}

/**
 * 分析統計
 */
export interface PerformanceAnalysisStats {
  /** 問題の種類別カウント */
  byType: Record<PerformanceIssueType, number>;
  /** 重要度別カウント */
  bySeverity: Record<PerformanceSeverity, number>;
  /** 影響度別カウント */
  byImpact: Record<"HIGH" | "MEDIUM" | "LOW", number>;
}

// ========================================
// 検出パターンの型
// ========================================

/**
 * パターンマッチャー関数
 */
export type PatternMatcher = (
  code: string,
  filePath: string,
  lineOffset?: number
) => DetectedPerformanceIssue[];

/**
 * 検出パターン定義
 */
export interface PerformancePattern {
  /** パターンID */
  id: string;
  /** パターン名 */
  name: string;
  /** 問題の種類 */
  issueType: PerformanceIssueType;
  /** デフォルトの重要度 */
  defaultSeverity: PerformanceSeverity;
  /** 対象ファイル拡張子（指定がなければ全て） */
  targetExtensions?: string[];
  /** マッチャー関数 */
  matcher: PatternMatcher;
}

// ========================================
// N+1クエリ検出
// ========================================

/**
 * データベースクエリパターン
 */
export interface QueryPattern {
  /** クエリメソッド（find, findMany, etc.） */
  method: string;
  /** モデル名 */
  model?: string;
  /** 行番号 */
  lineNumber: number;
  /** ループ内かどうか */
  isInLoop: boolean;
  /** 親のループ情報 */
  loopInfo?: {
    type: "for" | "forEach" | "map" | "while" | "for-of" | "for-in";
    lineNumber: number;
  };
}

// ========================================
// メモリリーク検出
// ========================================

/**
 * メモリリークの可能性があるパターン
 */
export interface MemoryLeakPattern {
  /** パターンの種類 */
  type:
    | "uncleared_interval"
    | "uncleared_timeout"
    | "unremoved_listener"
    | "growing_array"
    | "closure_leak"
    | "global_state";
  /** 説明 */
  description: string;
  /** 開始行 */
  lineNumber: number;
  /** 関連コード */
  code: string;
}

// ========================================
// React再レンダリング検出
// ========================================

/**
 * Reactコンポーネント情報
 */
export interface ReactComponentInfo {
  /** コンポーネント名 */
  name: string;
  /** 行番号 */
  lineNumber: number;
  /** 関数コンポーネントか */
  isFunctional: boolean;
  /** メモ化されているか */
  isMemoized: boolean;
  /** 使用しているフック */
  hooks: string[];
}

/**
 * 再レンダリング問題の種類
 */
export interface RerenderIssue {
  /** コンポーネント名 */
  componentName: string;
  /** 行番号 */
  lineNumber: number;
  /** 問題の種類 */
  type:
    | "inline_object"
    | "inline_function"
    | "missing_deps"
    | "unstable_reference"
    | "missing_memo"
    | "missing_callback";
  /** 説明 */
  description: string;
  /** 提案 */
  suggestion: string;
}

// ========================================
// 分析オプション
// ========================================

/**
 * パフォーマンス分析オプション
 */
export interface PerformanceAnalysisOptions {
  /** N+1クエリ検出を有効にする */
  detectNPlusOne?: boolean;
  /** メモリリーク検出を有効にする */
  detectMemoryLeaks?: boolean;
  /** React再レンダリング検出を有効にする */
  detectReactRerenders?: boolean;
  /** 非効率なループ検出を有効にする */
  detectInefficientLoops?: boolean;
  /** 大きなバンドルインポート検出を有効にする */
  detectLargeBundleImports?: boolean;
  /** 最大問題数 */
  maxIssues?: number;
  /** 最小重要度 */
  minSeverity?: PerformanceSeverity;
  /** 対象ファイルパターン */
  includePatterns?: string[];
  /** 除外ファイルパターン */
  excludePatterns?: string[];
}

/**
 * デフォルトのオプション
 */
export const DEFAULT_PERFORMANCE_OPTIONS: PerformanceAnalysisOptions = {
  detectNPlusOne: true,
  detectMemoryLeaks: true,
  detectReactRerenders: true,
  detectInefficientLoops: true,
  detectLargeBundleImports: true,
  maxIssues: 50,
  minSeverity: "INFO",
  excludePatterns: ["node_modules/**", "*.test.*", "*.spec.*", "__tests__/**"],
};
