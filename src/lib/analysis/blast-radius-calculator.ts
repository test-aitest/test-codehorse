/**
 * Phase 3: Blast Radius Calculator
 *
 * 変更の影響範囲（Blast Radius）を計算
 */

import type {
  BlastRadius,
  BlastRadiusEntry,
  DependencyGraph,
} from "./types";
import {
  getTransitiveImporters,
  isTestFile,
} from "./dependency-graph";

// ========================================
// Blast Radius 計算
// ========================================

/**
 * 単一ファイルのBlast Radiusを計算
 */
export function calculateBlastRadius(
  graph: DependencyGraph,
  changedFile: string,
  options: BlastRadiusOptions = {}
): BlastRadius {
  const {
    maxDepth = 10,
    includeTests = true,
  } = options;

  // 推移的にインポートしているファイルを取得
  const importersMap = getTransitiveImporters(graph, changedFile, {
    maxDepth,
    includeTests,
  });

  const affectedFiles: BlastRadiusEntry[] = [];
  let directCount = 0;
  let transitiveCount = 0;

  for (const [filePath, depth] of importersMap) {
    const node = graph.nodes.get(filePath);
    const edge = node?.imports.find(imp => imp.targetFile === changedFile);
    const importedSymbols = edge?.importedSymbols || [];
    const isTest = isTestFile(filePath);

    affectedFiles.push({
      filePath,
      depth,
      importedSymbols,
      isTest,
    });

    if (depth === 1) {
      directCount++;
    } else {
      transitiveCount++;
    }
  }

  // 影響スコアを計算
  const score = calculateBlastScore(directCount, transitiveCount, affectedFiles);

  return {
    changedFile,
    directCount,
    transitiveCount,
    totalCount: affectedFiles.length,
    affectedFiles: sortAffectedFiles(affectedFiles),
    score,
  };
}

/**
 * 複数ファイルの合計Blast Radiusを計算
 */
export function calculateTotalBlastRadius(
  graph: DependencyGraph,
  changedFiles: string[],
  options: BlastRadiusOptions = {}
): TotalBlastRadius {
  const individualRadii: BlastRadius[] = [];
  const allAffectedFiles = new Map<string, BlastRadiusEntry>();

  for (const changedFile of changedFiles) {
    const radius = calculateBlastRadius(graph, changedFile, options);
    individualRadii.push(radius);

    // 影響ファイルをマージ（重複を除去、最小深さを保持）
    for (const affected of radius.affectedFiles) {
      const existing = allAffectedFiles.get(affected.filePath);
      if (!existing || affected.depth < existing.depth) {
        allAffectedFiles.set(affected.filePath, affected);
      }
    }
  }

  // 全体の統計を計算
  const uniqueAffected = Array.from(allAffectedFiles.values());
  const directCount = uniqueAffected.filter(a => a.depth === 1).length;
  const transitiveCount = uniqueAffected.filter(a => a.depth > 1).length;
  const testCount = uniqueAffected.filter(a => a.isTest).length;

  // 合計スコアを計算
  const totalScore = Math.min(
    100,
    individualRadii.reduce((sum, r) => sum + r.score, 0) / Math.max(changedFiles.length, 1) +
    (changedFiles.length > 5 ? 20 : changedFiles.length * 2)
  );

  return {
    changedFiles,
    individualRadii,
    uniqueAffectedFiles: sortAffectedFiles(uniqueAffected),
    totalDirectCount: directCount,
    totalTransitiveCount: transitiveCount,
    totalTestCount: testCount,
    totalUniqueCount: uniqueAffected.length,
    totalScore: Math.round(totalScore),
  };
}

// ========================================
// 型定義
// ========================================

export interface BlastRadiusOptions {
  /** 推移的依存の最大深さ */
  maxDepth?: number;
  /** テストファイルを含めるか */
  includeTests?: boolean;
}

export interface TotalBlastRadius {
  /** 変更されたファイル一覧 */
  changedFiles: string[];
  /** 各ファイルのBlast Radius */
  individualRadii: BlastRadius[];
  /** 重複を除いた影響ファイル一覧 */
  uniqueAffectedFiles: BlastRadiusEntry[];
  /** 直接影響を受けるファイル数（重複除去） */
  totalDirectCount: number;
  /** 間接的に影響を受けるファイル数（重複除去） */
  totalTransitiveCount: number;
  /** 影響を受けるテストファイル数 */
  totalTestCount: number;
  /** 重複を除いた総影響ファイル数 */
  totalUniqueCount: number;
  /** 全体の影響スコア (0-100) */
  totalScore: number;
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * Blast Radiusスコアを計算 (0-100)
 */
function calculateBlastScore(
  directCount: number,
  transitiveCount: number,
  affectedFiles: BlastRadiusEntry[]
): number {
  let score = 0;

  // 直接依存（重み: 3）
  score += Math.min(directCount * 5, 40);

  // 間接依存（重み: 1）
  score += Math.min(transitiveCount * 2, 30);

  // テストファイルの影響（重み: 2）
  const testCount = affectedFiles.filter(a => a.isTest).length;
  score += Math.min(testCount * 3, 20);

  // 深い依存がある場合はペナルティ
  const maxDepth = Math.max(...affectedFiles.map(a => a.depth), 0);
  if (maxDepth >= 5) score += 10;
  else if (maxDepth >= 3) score += 5;

  return Math.min(score, 100);
}

/**
 * 影響ファイルをソート（深さ順、次にパス順）
 */
function sortAffectedFiles(files: BlastRadiusEntry[]): BlastRadiusEntry[] {
  return [...files].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.filePath.localeCompare(b.filePath);
  });
}

/**
 * Blast Radiusのサマリーを生成
 */
export function summarizeBlastRadius(radius: BlastRadius): string {
  const lines: string[] = [];

  lines.push(`### 📊 影響範囲分析: \`${radius.changedFile}\``);
  lines.push("");

  // スコアに基づく色
  const scoreEmoji = radius.score >= 70 ? "🔴" :
    radius.score >= 40 ? "🟡" : "🟢";

  lines.push(`**影響スコア**: ${scoreEmoji} ${radius.score}/100`);
  lines.push("");

  lines.push("| カテゴリ | 数 |");
  lines.push("|---------|-----|");
  lines.push(`| 直接依存 | ${radius.directCount} |`);
  lines.push(`| 間接依存 | ${radius.transitiveCount} |`);
  lines.push(`| **合計** | **${radius.totalCount}** |`);
  lines.push("");

  if (radius.affectedFiles.length > 0) {
    lines.push("**影響を受けるファイル:**");
    for (const affected of radius.affectedFiles.slice(0, 10)) {
      const testBadge = affected.isTest ? " 🧪" : "";
      const depthBadge = affected.depth > 1 ? ` (深さ: ${affected.depth})` : "";
      lines.push(`- \`${affected.filePath}\`${testBadge}${depthBadge}`);
    }
    if (radius.affectedFiles.length > 10) {
      lines.push(`- ... 他 ${radius.affectedFiles.length - 10} 件`);
    }
  }

  return lines.join("\n");
}

/**
 * TotalBlastRadiusのサマリーを生成
 */
export function summarizeTotalBlastRadius(total: TotalBlastRadius): string {
  const lines: string[] = [];

  lines.push("## 📊 総合影響範囲分析");
  lines.push("");

  // スコアに基づく色
  const scoreEmoji = total.totalScore >= 70 ? "🔴" :
    total.totalScore >= 40 ? "🟡" : "🟢";

  lines.push(`**総合影響スコア**: ${scoreEmoji} ${total.totalScore}/100`);
  lines.push("");

  lines.push("### 概要");
  lines.push("| カテゴリ | 数 |");
  lines.push("|---------|-----|");
  lines.push(`| 変更ファイル | ${total.changedFiles.length} |`);
  lines.push(`| 直接影響 | ${total.totalDirectCount} |`);
  lines.push(`| 間接影響 | ${total.totalTransitiveCount} |`);
  lines.push(`| テストファイル | ${total.totalTestCount} |`);
  lines.push(`| **合計（重複除去）** | **${total.totalUniqueCount}** |`);
  lines.push("");

  // 高影響ファイルをハイライト
  const highImpact = total.individualRadii.filter(r => r.score >= 40);
  if (highImpact.length > 0) {
    lines.push("### ⚠️ 高影響ファイル");
    for (const radius of highImpact.slice(0, 5)) {
      lines.push(`- \`${radius.changedFile}\` (スコア: ${radius.score}, 影響: ${radius.totalCount}件)`);
    }
    lines.push("");
  }

  // 影響を受ける主要ファイル（テスト除く）
  const nonTestAffected = total.uniqueAffectedFiles.filter(a => !a.isTest);
  if (nonTestAffected.length > 0) {
    lines.push("### 影響を受けるソースファイル");
    for (const affected of nonTestAffected.slice(0, 8)) {
      const depthBadge = affected.depth > 1 ? ` (深さ: ${affected.depth})` : "";
      lines.push(`- \`${affected.filePath}\`${depthBadge}`);
    }
    if (nonTestAffected.length > 8) {
      lines.push(`- ... 他 ${nonTestAffected.length - 8} 件`);
    }
    lines.push("");
  }

  // 影響を受けるテストファイル
  const testAffected = total.uniqueAffectedFiles.filter(a => a.isTest);
  if (testAffected.length > 0) {
    lines.push("### 🧪 影響を受けるテストファイル");
    for (const affected of testAffected.slice(0, 5)) {
      lines.push(`- \`${affected.filePath}\``);
    }
    if (testAffected.length > 5) {
      lines.push(`- ... 他 ${testAffected.length - 5} 件`);
    }
  }

  return lines.join("\n");
}
