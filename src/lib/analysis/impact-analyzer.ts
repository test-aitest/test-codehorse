/**
 * Phase 3: Impact Analyzer
 *
 * PR内の変更がリポジトリ全体に与える影響を分析
 */

import type { ParsedDiff } from "../diff/types";
import type {
  ImpactAnalysisResult,
  AffectedFile,
  DependencyGraph,
  BreakingChangeWarning,
  CircularDependency,
} from "./types";
import {
  buildDependencyGraph,
  getTransitiveImporters,
  detectCircularDependenciesForFile,
  isTestFile,
} from "./dependency-graph";
import { detectBreakingChanges } from "./breaking-change-detector";

// ========================================
// 影響分析のメイン関数
// ========================================

/**
 * PRの変更に基づいて影響分析を実行
 */
export async function analyzeImpact(
  repositoryId: string,
  parsedDiff: ParsedDiff,
  options: ImpactAnalysisOptions = {}
): Promise<ImpactAnalysisResult> {
  const {
    maxDepth = 5,
    includeTests = true,
    includeBreakingChanges = true,
    includeCircularDependencies = true,
  } = options;

  // 依存関係グラフを構築
  const graph = await buildDependencyGraph(repositoryId);

  // 変更されたファイルを抽出
  const changedFiles = parsedDiff.files
    .map(f => f.newPath)
    .filter(p => p !== "/dev/null");

  // 直接影響を受けるファイルを収集
  const directlyAffected: AffectedFile[] = [];

  // 間接的に影響を受けるファイルを収集
  const transitivelyAffected: AffectedFile[] = [];

  // 影響を受けるテストファイルを収集
  const affectedTests: string[] = [];

  // 各変更ファイルについて影響を分析
  for (const changedFile of changedFiles) {
    // このファイルをインポートしているファイルを取得
    const importers = getTransitiveImporters(graph, changedFile, {
      maxDepth,
      includeTests,
    });

    for (const [importerPath, depth] of importers) {
      const importedSymbols = getImportedSymbols(graph, importerPath, changedFile);

      const affected: AffectedFile = {
        filePath: importerPath,
        affectedBy: changedFile,
        importedSymbols,
        depth,
      };

      if (depth === 1) {
        // 直接依存
        if (!directlyAffected.find(a => a.filePath === importerPath)) {
          directlyAffected.push(affected);
        }
      } else {
        // 間接依存
        if (!transitivelyAffected.find(a => a.filePath === importerPath)) {
          transitivelyAffected.push(affected);
        }
      }

      // テストファイルを別途収集
      if (isTestFile(importerPath) && !affectedTests.includes(importerPath)) {
        affectedTests.push(importerPath);
      }
    }
  }

  // 破壊的変更を検出
  let breakingChanges: BreakingChangeWarning[] = [];
  if (includeBreakingChanges) {
    breakingChanges = await detectBreakingChangesFromDiff(
      repositoryId,
      parsedDiff,
      graph
    );
  }

  // 循環依存を検出
  const circularDependencies: CircularDependency[] = [];
  if (includeCircularDependencies) {
    for (const changedFile of changedFiles) {
      const cycles = detectCircularDependenciesForFile(graph, changedFile);
      for (const cycle of cycles) {
        if (!circularDependencies.find(c =>
          c.cycle.join("->") === cycle.cycle.join("->")
        )) {
          circularDependencies.push(cycle);
        }
      }
    }
  }

  // 影響スコアを計算
  const impactScore = calculateImpactScore({
    changedFiles,
    directlyAffected,
    transitivelyAffected,
    breakingChanges,
    circularDependencies,
  });

  return {
    changedFiles,
    directlyAffected,
    transitivelyAffected,
    affectedTests,
    breakingChanges,
    circularDependencies,
    impactScore,
  };
}

// ========================================
// オプション型定義
// ========================================

export interface ImpactAnalysisOptions {
  /** 推移的依存の最大深さ */
  maxDepth?: number;
  /** テストファイルを含めるか */
  includeTests?: boolean;
  /** 破壊的変更を検出するか */
  includeBreakingChanges?: boolean;
  /** 循環依存を検出するか */
  includeCircularDependencies?: boolean;
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * 特定ファイルが別ファイルからインポートしているシンボルを取得
 */
function getImportedSymbols(
  graph: DependencyGraph,
  importerPath: string,
  targetPath: string
): string[] {
  const node = graph.nodes.get(importerPath);
  if (!node) return [];

  const edge = node.imports.find(imp => imp.targetFile === targetPath);
  return edge?.importedSymbols || [];
}

/**
 * diffから破壊的変更を検出
 */
async function detectBreakingChangesFromDiff(
  repositoryId: string,
  parsedDiff: ParsedDiff,
  graph: DependencyGraph
): Promise<BreakingChangeWarning[]> {
  const warnings: BreakingChangeWarning[] = [];

  for (const file of parsedDiff.files) {
    // 削除されたファイルは破壊的変更
    if (file.type === "delete") {
      const importers = graph.reverseIndex.get(file.oldPath) || [];
      if (importers.length > 0) {
        warnings.push({
          type: "removed_export",
          filePath: file.oldPath,
          symbolName: "*",
          description: `ファイル "${file.oldPath}" が削除されましたが、${importers.length}個のファイルがこのファイルをインポートしています`,
          severity: "critical",
          affectedFiles: importers,
          suggestion: "インポートしているファイルを更新するか、ファイルを復元してください",
        });
      }
    }

    // 変更されたファイルの破壊的変更を検出
    if (file.type === "modify") {
      const fileWarnings = await detectBreakingChanges(
        repositoryId,
        file,
        graph
      );
      warnings.push(...fileWarnings);
    }
  }

  return warnings;
}

/**
 * 影響スコアを計算 (0-100)
 */
function calculateImpactScore(params: {
  changedFiles: string[];
  directlyAffected: AffectedFile[];
  transitivelyAffected: AffectedFile[];
  breakingChanges: BreakingChangeWarning[];
  circularDependencies: CircularDependency[];
}): number {
  let score = 0;

  // 変更ファイル数による基本スコア
  score += Math.min(params.changedFiles.length * 2, 20);

  // 直接影響を受けるファイル数
  score += Math.min(params.directlyAffected.length * 3, 30);

  // 間接的に影響を受けるファイル数
  score += Math.min(params.transitivelyAffected.length, 20);

  // 破壊的変更
  for (const warning of params.breakingChanges) {
    if (warning.severity === "critical") score += 15;
    else if (warning.severity === "warning") score += 8;
    else score += 3;
  }

  // 循環依存
  for (const cycle of params.circularDependencies) {
    if (cycle.severity === "critical") score += 10;
    else score += 5;
  }

  return Math.min(score, 100);
}

// ========================================
// 影響分析のフォーマット
// ========================================

/**
 * 影響分析結果をMarkdown形式でフォーマット
 */
export function formatImpactAnalysis(result: ImpactAnalysisResult): string {
  const lines: string[] = [];

  lines.push("## 変更影響分析");
  lines.push("");

  // 影響スコア
  const scoreEmoji = result.impactScore >= 70 ? "🔴" :
    result.impactScore >= 40 ? "🟡" : "🟢";
  lines.push(`**影響スコア**: ${scoreEmoji} ${result.impactScore}/100`);
  lines.push("");

  // 変更ファイル
  lines.push(`### 変更ファイル (${result.changedFiles.length}件)`);
  for (const file of result.changedFiles.slice(0, 10)) {
    lines.push(`- \`${file}\``);
  }
  if (result.changedFiles.length > 10) {
    lines.push(`- ...他 ${result.changedFiles.length - 10}件`);
  }
  lines.push("");

  // 直接影響
  if (result.directlyAffected.length > 0) {
    lines.push(`### 直接影響を受けるファイル (${result.directlyAffected.length}件)`);
    for (const affected of result.directlyAffected.slice(0, 5)) {
      lines.push(`- \`${affected.filePath}\` ← \`${affected.affectedBy}\``);
      if (affected.importedSymbols.length > 0) {
        lines.push(`  - インポート: ${affected.importedSymbols.join(", ")}`);
      }
    }
    if (result.directlyAffected.length > 5) {
      lines.push(`- ...他 ${result.directlyAffected.length - 5}件`);
    }
    lines.push("");
  }

  // 間接影響
  if (result.transitivelyAffected.length > 0) {
    lines.push(`### 間接的に影響を受けるファイル (${result.transitivelyAffected.length}件)`);
    for (const affected of result.transitivelyAffected.slice(0, 3)) {
      lines.push(`- \`${affected.filePath}\` (深さ: ${affected.depth})`);
    }
    if (result.transitivelyAffected.length > 3) {
      lines.push(`- ...他 ${result.transitivelyAffected.length - 3}件`);
    }
    lines.push("");
  }

  // 影響を受けるテスト
  if (result.affectedTests.length > 0) {
    lines.push(`### 影響を受けるテストファイル (${result.affectedTests.length}件)`);
    for (const test of result.affectedTests.slice(0, 5)) {
      lines.push(`- \`${test}\``);
    }
    if (result.affectedTests.length > 5) {
      lines.push(`- ...他 ${result.affectedTests.length - 5}件`);
    }
    lines.push("");
  }

  // 破壊的変更
  if (result.breakingChanges.length > 0) {
    lines.push("### ⚠️ 破壊的変更の警告");
    for (const warning of result.breakingChanges) {
      const severity = warning.severity === "critical" ? "🔴" :
        warning.severity === "warning" ? "🟡" : "🔵";
      lines.push(`${severity} **${warning.type}**: ${warning.description}`);
      if (warning.suggestion) {
        lines.push(`  > 提案: ${warning.suggestion}`);
      }
    }
    lines.push("");
  }

  // 循環依存
  if (result.circularDependencies.length > 0) {
    lines.push("### 🔄 循環依存の警告");
    for (const cycle of result.circularDependencies) {
      const severity = cycle.severity === "critical" ? "🔴" : "🟡";
      lines.push(`${severity} ${cycle.cycle.join(" → ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
