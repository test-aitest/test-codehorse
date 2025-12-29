/**
 * Phase 3: Breaking Change Detector
 *
 * API破壊的変更を検出
 */

import { prisma } from "@/lib/prisma";
import type { ParsedFile } from "../diff/types";
import type { BreakingChangeWarning, DependencyGraph, ExportInfo } from "./types";

// ========================================
// 破壊的変更検出のメイン関数
// ========================================

/**
 * ファイルの変更から破壊的変更を検出
 */
export async function detectBreakingChanges(
  repositoryId: string,
  file: ParsedFile,
  graph: DependencyGraph
): Promise<BreakingChangeWarning[]> {
  const warnings: BreakingChangeWarning[] = [];

  // 変更前のエクスポートを取得（データベースから）
  const previousExports = await prisma.exportedSymbol.findMany({
    where: {
      repositoryId,
      filePath: file.oldPath,
    },
  });

  if (previousExports.length === 0) {
    // 新規ファイルの場合は破壊的変更なし
    return warnings;
  }

  // 現在のエクスポートを取得（グラフから）
  const currentExports = graph.nodes.get(file.newPath)?.exports || [];

  // 削除されたエクスポートを検出
  const removedExports = detectRemovedExports(
    previousExports.map(e => ({
      symbolName: e.symbolName,
      symbolType: e.symbolType,
      signature: e.signature || undefined,
      isDefault: e.isDefault,
      lineNumber: e.lineNumber || undefined,
    })),
    currentExports
  );

  for (const removed of removedExports) {
    // このシンボルをインポートしているファイルを特定
    const affectedFiles = findFilesImportingSymbol(
      graph,
      file.newPath,
      removed.symbolName
    );

    if (affectedFiles.length > 0 || removed.isDefault) {
      warnings.push({
        type: "removed_export",
        filePath: file.newPath,
        symbolName: removed.symbolName,
        description: `エクスポート "${removed.symbolName}" が削除されました`,
        severity: removed.isDefault ? "critical" : "warning",
        affectedFiles,
        suggestion: affectedFiles.length > 0
          ? `${affectedFiles.length}個のファイルがこのシンボルをインポートしています。インポートを更新してください。`
          : undefined,
      });
    }
  }

  // シグネチャの変更を検出
  const signatureChanges = detectSignatureChanges(
    previousExports.map(e => ({
      symbolName: e.symbolName,
      symbolType: e.symbolType,
      signature: e.signature || undefined,
      isDefault: e.isDefault,
      lineNumber: e.lineNumber || undefined,
    })),
    currentExports
  );

  for (const change of signatureChanges) {
    const affectedFiles = findFilesImportingSymbol(
      graph,
      file.newPath,
      change.symbolName
    );

    if (affectedFiles.length > 0) {
      warnings.push({
        type: "signature_changed",
        filePath: file.newPath,
        symbolName: change.symbolName,
        description: `"${change.symbolName}" のシグネチャが変更されました:\n  前: ${change.oldSignature}\n  後: ${change.newSignature}`,
        severity: "warning",
        affectedFiles,
        suggestion: "呼び出し元のコードを確認し、新しいシグネチャに合わせて更新してください。",
      });
    }
  }

  // default export の変更を検出
  const defaultChanges = detectDefaultExportChanges(
    previousExports.map(e => ({
      symbolName: e.symbolName,
      symbolType: e.symbolType,
      signature: e.signature || undefined,
      isDefault: e.isDefault,
      lineNumber: e.lineNumber || undefined,
    })),
    currentExports
  );

  for (const change of defaultChanges) {
    const affectedFiles = findFilesImportingSymbol(
      graph,
      file.newPath,
      "default"
    );

    if (affectedFiles.length > 0) {
      warnings.push({
        type: change.type,
        filePath: file.newPath,
        symbolName: change.symbolName,
        description: change.description,
        severity: "warning",
        affectedFiles,
        suggestion: change.suggestion,
      });
    }
  }

  // 型の変更を検出（TypeScript）
  const typeChanges = detectTypeChanges(
    previousExports.filter(e => e.symbolType === "TYPE" || e.symbolType === "INTERFACE")
      .map(e => ({
        symbolName: e.symbolName,
        symbolType: e.symbolType,
        signature: e.signature || undefined,
        isDefault: e.isDefault,
        lineNumber: e.lineNumber || undefined,
      })),
    currentExports.filter(e => e.symbolType === "TYPE" || e.symbolType === "INTERFACE")
  );

  for (const change of typeChanges) {
    const affectedFiles = findFilesImportingSymbol(
      graph,
      file.newPath,
      change.symbolName
    );

    if (affectedFiles.length > 0) {
      warnings.push({
        type: "type_changed",
        filePath: file.newPath,
        symbolName: change.symbolName,
        description: `型 "${change.symbolName}" が変更されました`,
        severity: "info",
        affectedFiles,
        suggestion: "この型を使用しているコードを確認してください。",
      });
    }
  }

  return warnings;
}

// ========================================
// 個別の検出関数
// ========================================

/**
 * 削除されたエクスポートを検出
 */
function detectRemovedExports(
  previous: ExportInfo[],
  current: ExportInfo[]
): ExportInfo[] {
  const currentNames = new Set(current.map(e => e.symbolName));
  return previous.filter(e => !currentNames.has(e.symbolName));
}

/**
 * シグネチャの変更を検出
 */
function detectSignatureChanges(
  previous: ExportInfo[],
  current: ExportInfo[]
): Array<{
  symbolName: string;
  oldSignature: string;
  newSignature: string;
}> {
  const changes: Array<{
    symbolName: string;
    oldSignature: string;
    newSignature: string;
  }> = [];

  const currentMap = new Map(current.map(e => [e.symbolName, e]));

  for (const prev of previous) {
    const curr = currentMap.get(prev.symbolName);
    if (curr && prev.signature && curr.signature) {
      // シグネチャを正規化して比較
      const normalizedPrev = normalizeSignature(prev.signature);
      const normalizedCurr = normalizeSignature(curr.signature);

      if (normalizedPrev !== normalizedCurr) {
        changes.push({
          symbolName: prev.symbolName,
          oldSignature: prev.signature,
          newSignature: curr.signature,
        });
      }
    }
  }

  return changes;
}

/**
 * default export の変更を検出
 */
function detectDefaultExportChanges(
  previous: ExportInfo[],
  current: ExportInfo[]
): Array<{
  type: "default_to_named" | "named_to_default";
  symbolName: string;
  description: string;
  suggestion: string;
}> {
  const changes: Array<{
    type: "default_to_named" | "named_to_default";
    symbolName: string;
    description: string;
    suggestion: string;
  }> = [];

  const previousDefault = previous.find(e => e.isDefault);
  const currentDefault = current.find(e => e.isDefault);

  // default export が named export に変更された
  if (previousDefault && !currentDefault) {
    const matchingNamed = current.find(e =>
      e.symbolName === previousDefault.symbolName && !e.isDefault
    );
    if (matchingNamed) {
      changes.push({
        type: "default_to_named",
        symbolName: previousDefault.symbolName,
        description: `"${previousDefault.symbolName}" が default export から named export に変更されました`,
        suggestion: `import foo from '..' を import { ${previousDefault.symbolName} } from '..' に変更してください`,
      });
    }
  }

  // named export が default export に変更された
  if (!previousDefault && currentDefault && currentDefault.symbolName !== "default") {
    const previousNamed = previous.find(e =>
      e.symbolName === currentDefault.symbolName && !e.isDefault
    );
    if (previousNamed) {
      changes.push({
        type: "named_to_default",
        symbolName: currentDefault.symbolName,
        description: `"${currentDefault.symbolName}" が named export から default export に変更されました`,
        suggestion: `import { ${currentDefault.symbolName} } from '..' を import ${currentDefault.symbolName} from '..' に変更してください`,
      });
    }
  }

  return changes;
}

/**
 * 型の変更を検出
 */
function detectTypeChanges(
  previous: ExportInfo[],
  current: ExportInfo[]
): Array<{ symbolName: string }> {
  const changes: Array<{ symbolName: string }> = [];
  const currentMap = new Map(current.map(e => [e.symbolName, e]));

  for (const prev of previous) {
    const curr = currentMap.get(prev.symbolName);
    // 型が存在するがシグネチャが変わった場合
    if (curr && prev.signature !== curr.signature) {
      changes.push({ symbolName: prev.symbolName });
    }
  }

  return changes;
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * 特定のシンボルをインポートしているファイルを検索
 */
function findFilesImportingSymbol(
  graph: DependencyGraph,
  targetFile: string,
  symbolName: string
): string[] {
  const importers = graph.reverseIndex.get(targetFile) || [];
  const result: string[] = [];

  for (const importer of importers) {
    const node = graph.nodes.get(importer);
    if (!node) continue;

    const edge = node.imports.find(imp => imp.targetFile === targetFile);
    if (!edge) continue;

    // シンボルがインポートされているかチェック
    if (
      edge.importedSymbols.includes(symbolName) ||
      edge.importedSymbols.includes("*") ||
      (symbolName === "default" && edge.importType === "DEFAULT")
    ) {
      result.push(importer);
    }
  }

  return result;
}

/**
 * シグネチャを正規化（空白を除去など）
 */
function normalizeSignature(signature: string): string {
  return signature
    .replace(/\s+/g, " ")
    .replace(/\s*([,:<>(){}[\]])\s*/g, "$1")
    .trim();
}

/**
 * 破壊的変更の重大度を判定
 */
export function getBreakingSeverity(
  warning: BreakingChangeWarning
): "critical" | "warning" | "info" {
  // 削除されたエクスポートで多くのファイルに影響がある場合
  if (warning.type === "removed_export") {
    if (warning.affectedFiles.length >= 5) return "critical";
    if (warning.affectedFiles.length >= 1) return "warning";
    return "info";
  }

  // シグネチャ変更
  if (warning.type === "signature_changed") {
    if (warning.affectedFiles.length >= 3) return "warning";
    return "info";
  }

  // default export の変更
  if (warning.type === "default_to_named" || warning.type === "named_to_default") {
    return "warning";
  }

  return "info";
}
