/**
 * Phase 3: Dependency Graph
 *
 * 依存関係グラフの構築とクエリ
 */

import { prisma } from "@/lib/prisma";
import type {
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  ExportInfo,
  CircularDependency,
  GraphTraversalOptions,
} from "./types";

// ========================================
// 依存関係グラフの構築
// ========================================

/**
 * リポジトリの依存関係グラフを構築
 */
export async function buildDependencyGraph(
  repositoryId: string
): Promise<DependencyGraph> {
  // データベースから依存関係を取得
  const [dependencies, symbols] = await Promise.all([
    prisma.fileDependency.findMany({
      where: { repositoryId },
    }),
    prisma.exportedSymbol.findMany({
      where: { repositoryId },
    }),
  ]);

  const nodes = new Map<string, DependencyNode>();
  const reverseIndex = new Map<string, string[]>();

  // シンボルをファイルパスでグループ化
  const symbolsByFile = new Map<string, ExportInfo[]>();
  for (const symbol of symbols) {
    const exports = symbolsByFile.get(symbol.filePath) || [];
    exports.push({
      symbolName: symbol.symbolName,
      symbolType: symbol.symbolType,
      signature: symbol.signature || undefined,
      isDefault: symbol.isDefault,
      lineNumber: symbol.lineNumber || undefined,
    });
    symbolsByFile.set(symbol.filePath, exports);
  }

  // 依存関係からノードを構築
  const importsByFile = new Map<string, DependencyEdge[]>();
  for (const dep of dependencies) {
    // ソースファイルのインポートを収集
    const imports = importsByFile.get(dep.sourceFile) || [];
    imports.push({
      targetFile: dep.targetFile,
      importType: dep.importType,
      importedSymbols: dep.importedSymbols,
    });
    importsByFile.set(dep.sourceFile, imports);

    // 逆引きインデックスを構築
    const importers = reverseIndex.get(dep.targetFile) || [];
    if (!importers.includes(dep.sourceFile)) {
      importers.push(dep.sourceFile);
    }
    reverseIndex.set(dep.targetFile, importers);
  }

  // ノードを作成
  const allFiles = new Set([
    ...importsByFile.keys(),
    ...symbolsByFile.keys(),
    ...reverseIndex.keys(),
  ]);

  for (const filePath of allFiles) {
    nodes.set(filePath, {
      filePath,
      imports: importsByFile.get(filePath) || [],
      exports: symbolsByFile.get(filePath) || [],
    });
  }

  return { nodes, reverseIndex };
}

// ========================================
// 依存関係クエリ
// ========================================

/**
 * 特定ファイルのインポート依存関係を取得
 */
export function getImportDependencies(
  graph: DependencyGraph,
  filePath: string
): DependencyEdge[] {
  const node = graph.nodes.get(filePath);
  return node?.imports || [];
}

/**
 * 特定ファイルをインポートしているファイル一覧を取得
 */
export function getImporters(
  graph: DependencyGraph,
  filePath: string
): string[] {
  return graph.reverseIndex.get(filePath) || [];
}

/**
 * 特定ファイルのエクスポートを取得
 */
export function getExports(
  graph: DependencyGraph,
  filePath: string
): ExportInfo[] {
  const node = graph.nodes.get(filePath);
  return node?.exports || [];
}

/**
 * 推移的依存関係を取得（深さ優先探索）
 */
export function getTransitiveDependencies(
  graph: DependencyGraph,
  filePath: string,
  options: GraphTraversalOptions = {}
): Map<string, number> {
  const { maxDepth = 10, excludePatterns = [] } = options;
  const visited = new Map<string, number>(); // ファイルパス -> 深さ
  const queue: Array<{ path: string; depth: number }> = [
    { path: filePath, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current.path)) continue;
    if (maxDepth !== -1 && current.depth > maxDepth) continue;
    if (shouldExclude(current.path, excludePatterns)) continue;

    visited.set(current.path, current.depth);

    // このファイルのインポートを追加
    const imports = getImportDependencies(graph, current.path);
    for (const imp of imports) {
      if (!visited.has(imp.targetFile)) {
        queue.push({ path: imp.targetFile, depth: current.depth + 1 });
      }
    }
  }

  // 開始ファイル自身は除外
  visited.delete(filePath);
  return visited;
}

/**
 * 推移的インポーター（このファイルに依存しているファイル）を取得
 */
export function getTransitiveImporters(
  graph: DependencyGraph,
  filePath: string,
  options: GraphTraversalOptions = {}
): Map<string, number> {
  const { maxDepth = 10, excludePatterns = [], includeTests = true } = options;
  const visited = new Map<string, number>();
  const queue: Array<{ path: string; depth: number }> = [
    { path: filePath, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current.path)) continue;
    if (maxDepth !== -1 && current.depth > maxDepth) continue;
    if (shouldExclude(current.path, excludePatterns)) continue;
    if (!includeTests && isTestFile(current.path)) continue;

    visited.set(current.path, current.depth);

    // このファイルをインポートしているファイルを追加
    const importers = getImporters(graph, current.path);
    for (const importer of importers) {
      if (!visited.has(importer)) {
        queue.push({ path: importer, depth: current.depth + 1 });
      }
    }
  }

  // 開始ファイル自身は除外
  visited.delete(filePath);
  return visited;
}

// ========================================
// 循環依存の検出
// ========================================

/**
 * グラフ内のすべての循環依存を検出
 */
export function detectCircularDependencies(
  graph: DependencyGraph
): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const imports = getImportDependencies(graph, node);
    for (const imp of imports) {
      if (!visited.has(imp.targetFile)) {
        dfs(imp.targetFile);
      } else if (recursionStack.has(imp.targetFile)) {
        // 循環を検出
        const cycleStart = path.indexOf(imp.targetFile);
        if (cycleStart !== -1) {
          const cycle = [...path.slice(cycleStart), imp.targetFile];
          // 重複チェック（正規化して比較）
          const normalizedCycle = normalizeCycle(cycle);
          if (
            !cycles.some(
              (c) =>
                normalizeCycle(c.cycle).join("->") ===
                normalizedCycle.join("->")
            )
          ) {
            cycles.push({
              cycle,
              length: cycle.length - 1,
              severity: cycle.length <= 3 ? "critical" : "warning",
            });
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.nodes.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * 特定ファイルが含まれる循環依存を検出
 */
export function detectCircularDependenciesForFile(
  graph: DependencyGraph,
  filePath: string
): CircularDependency[] {
  const allCycles = detectCircularDependencies(graph);
  return allCycles.filter((cycle) => cycle.cycle.includes(filePath));
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * パターンに一致するパスを除外するかチェック
 */
function shouldExclude(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (filePath.includes(pattern)) return true;
  }
  return false;
}

/**
 * テストファイルかどうかを判定
 */
export function isTestFile(filePath: string): boolean {
  const testPatterns = [
    ".test.",
    ".spec.",
    "__tests__",
    "__mocks__",
    "test/",
    "tests/",
    ".stories.",
  ];
  return testPatterns.some((pattern) => filePath.includes(pattern));
}

/**
 * 循環を正規化（最小の要素から開始）
 */
function normalizeCycle(cycle: string[]): string[] {
  if (cycle.length <= 1) return cycle;

  // 最後の要素を除く（開始と終了が同じため）
  const uniqueCycle = cycle.slice(0, -1);

  // 最小の要素を見つける
  const minElement = uniqueCycle.reduce((min, curr) =>
    curr < min ? curr : min
  );

  // 最小要素から始まるように回転
  const startIndex = uniqueCycle.indexOf(minElement);
  return [
    ...uniqueCycle.slice(startIndex),
    ...uniqueCycle.slice(0, startIndex),
    minElement, // 循環を閉じる
  ];
}

