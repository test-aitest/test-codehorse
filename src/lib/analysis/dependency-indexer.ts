/**
 * Phase 3: Dependency Indexer
 *
 * TypeScript/JavaScript ファイルからインポート/エクスポートを抽出してインデキシング
 */

import {
  Project,
  SourceFile,
  ImportDeclaration,
  ExportDeclaration,
  Node,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import * as path from "path";
import { prisma } from "@/lib/prisma";
import { ImportType, SymbolType } from "@prisma/client";
import type {
  DependencyExtractionResult,
  ExtractedImport,
  ExtractedExport,
} from "./types";

// ========================================
// 依存関係の抽出
// ========================================

/**
 * ファイルからインポート/エクスポートを抽出
 */
export function extractDependencies(
  filePath: string,
  content: string,
  basePath: string = ""
): DependencyExtractionResult {
  const result: DependencyExtractionResult = {
    filePath,
    imports: [],
    exports: [],
    errors: [],
  };

  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        jsx: filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
          ? 2 // React
          : undefined,
      },
    });

    const sourceFile = project.createSourceFile(filePath, content);

    // インポートを抽出
    result.imports = extractImports(sourceFile, filePath, basePath);

    // エクスポートを抽出
    result.exports = extractExports(sourceFile);
  } catch (error) {
    result.errors.push(`Failed to parse ${filePath}: ${(error as Error).message}`);
  }

  return result;
}

/**
 * インポート宣言を抽出
 */
function extractImports(
  sourceFile: SourceFile,
  filePath: string,
  basePath: string
): ExtractedImport[] {
  const imports: ExtractedImport[] = [];
  const fileDir = path.dirname(filePath);

  // import 文を処理
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const extracted = extractImportDeclaration(importDecl, fileDir, basePath);
    if (extracted) {
      imports.push(extracted);
    }
  }

  // require() 呼び出しも処理
  const requireCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const expr = call.getExpression();
      return Node.isIdentifier(expr) && expr.getText() === "require";
    });

  for (const call of requireCalls) {
    const args = call.getArguments();
    if (args.length > 0 && Node.isStringLiteral(args[0])) {
      const modulePath = args[0].getLiteralValue();
      const resolved = resolveModulePath(modulePath, fileDir, basePath);
      imports.push({
        sourcePath: modulePath,
        resolvedPath: resolved,
        importType: "NAMESPACE",
        importedSymbols: [],
        isExternal: isExternalModule(modulePath),
      });
    }
  }

  return imports;
}

/**
 * 単一のインポート宣言を処理
 */
function extractImportDeclaration(
  importDecl: ImportDeclaration,
  fileDir: string,
  basePath: string
): ExtractedImport | null {
  const moduleSpecifier = importDecl.getModuleSpecifierValue();
  const resolved = resolveModulePath(moduleSpecifier, fileDir, basePath);
  const isExternal = isExternalModule(moduleSpecifier);

  // 型のみのインポートかどうか
  const isTypeOnly = importDecl.isTypeOnly();

  // デフォルトインポート
  const defaultImport = importDecl.getDefaultImport();

  // 名前付きインポート
  const namedImports = importDecl.getNamedImports();

  // 名前空間インポート
  const namespaceImport = importDecl.getNamespaceImport();

  // サイドエフェクトのみのインポート
  if (!defaultImport && namedImports.length === 0 && !namespaceImport) {
    return {
      sourcePath: moduleSpecifier,
      resolvedPath: resolved,
      importType: "SIDE_EFFECT",
      importedSymbols: [],
      isExternal,
    };
  }

  const importedSymbols: string[] = [];
  let importType: ImportType = "NAMED";

  if (defaultImport) {
    importedSymbols.push("default");
    importType = "DEFAULT";
  }

  if (namespaceImport) {
    importedSymbols.push("*");
    importType = "NAMESPACE";
  }

  for (const named of namedImports) {
    const name = named.getName();
    const alias = named.getAliasNode()?.getText();
    importedSymbols.push(alias || name);
  }

  if (isTypeOnly) {
    importType = "TYPE_ONLY";
  }

  return {
    sourcePath: moduleSpecifier,
    resolvedPath: resolved,
    importType,
    importedSymbols,
    isExternal,
  };
}

/**
 * エクスポートを抽出
 */
function extractExports(sourceFile: SourceFile): ExtractedExport[] {
  const exports: ExtractedExport[] = [];

  // 関数宣言のエクスポート
  for (const func of sourceFile.getFunctions()) {
    if (func.isExported()) {
      const name = func.getName();
      if (name) {
        exports.push({
          symbolName: name,
          symbolType: "FUNCTION",
          signature: getFunctionSignature(func),
          isDefault: func.isDefaultExport(),
          lineNumber: func.getStartLineNumber(),
        });
      }
    }
  }

  // クラス宣言のエクスポート
  for (const cls of sourceFile.getClasses()) {
    if (cls.isExported()) {
      const name = cls.getName();
      if (name) {
        exports.push({
          symbolName: name,
          symbolType: "CLASS",
          signature: getClassSignature(cls),
          isDefault: cls.isDefaultExport(),
          lineNumber: cls.getStartLineNumber(),
        });
      }
    }
  }

  // インターフェース宣言のエクスポート
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.isExported()) {
      exports.push({
        symbolName: iface.getName(),
        symbolType: "INTERFACE",
        signature: `interface ${iface.getName()}`,
        isDefault: false,
        lineNumber: iface.getStartLineNumber(),
      });
    }
  }

  // 型エイリアスのエクスポート
  for (const typeAlias of sourceFile.getTypeAliases()) {
    if (typeAlias.isExported()) {
      exports.push({
        symbolName: typeAlias.getName(),
        symbolType: "TYPE",
        signature: `type ${typeAlias.getName()}`,
        isDefault: false,
        lineNumber: typeAlias.getStartLineNumber(),
      });
    }
  }

  // Enumのエクスポート
  for (const enumDecl of sourceFile.getEnums()) {
    if (enumDecl.isExported()) {
      exports.push({
        symbolName: enumDecl.getName(),
        symbolType: "ENUM",
        signature: `enum ${enumDecl.getName()}`,
        isDefault: false,
        lineNumber: enumDecl.getStartLineNumber(),
      });
    }
  }

  // 変数宣言のエクスポート
  for (const stmt of sourceFile.getVariableStatements()) {
    if (stmt.isExported()) {
      for (const decl of stmt.getDeclarations()) {
        const symbolType = getVariableSymbolType(decl);
        exports.push({
          symbolName: decl.getName(),
          symbolType,
          signature: undefined,
          isDefault: false,
          lineNumber: stmt.getStartLineNumber(),
        });
      }
    }
  }

  // export default 式を処理
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const existingDefault = exports.find(e => e.isDefault);
    if (!existingDefault) {
      exports.push({
        symbolName: "default",
        symbolType: "CONST",
        signature: undefined,
        isDefault: true,
        lineNumber: sourceFile.getDefaultExportSymbol()?.getValueDeclaration()?.getStartLineNumber() || 1,
      });
    }
  }

  // re-export を処理 (export { foo } from './bar')
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    processExportDeclaration(exportDecl, exports);
  }

  return exports;
}

/**
 * export宣言（re-export）を処理
 */
function processExportDeclaration(
  exportDecl: ExportDeclaration,
  exports: ExtractedExport[]
): void {
  const namedExports = exportDecl.getNamedExports();

  for (const named of namedExports) {
    const name = named.getAliasNode()?.getText() || named.getName();
    // re-exportされたシンボルを追加
    if (!exports.find(e => e.symbolName === name)) {
      exports.push({
        symbolName: name,
        symbolType: "CONST", // re-exportは元の型が不明
        signature: undefined,
        isDefault: false,
        lineNumber: exportDecl.getStartLineNumber(),
      });
    }
  }

  // export * from './module' の場合
  if (exportDecl.isNamespaceExport()) {
    // 名前空間エクスポートは個別のシンボルとして追跡しない
  }
}

// ========================================
// データベースへの保存
// ========================================

/**
 * 抽出した依存関係をデータベースに保存
 */
export async function saveDependencies(
  repositoryId: string,
  extractions: DependencyExtractionResult[]
): Promise<void> {
  // 既存のデータを削除
  await prisma.$transaction([
    prisma.fileDependency.deleteMany({ where: { repositoryId } }),
    prisma.exportedSymbol.deleteMany({ where: { repositoryId } }),
  ]);

  // 新しいデータを挿入
  const dependencies: Array<{
    repositoryId: string;
    sourceFile: string;
    targetFile: string;
    importType: ImportType;
    importedSymbols: string[];
  }> = [];

  const symbols: Array<{
    repositoryId: string;
    filePath: string;
    symbolName: string;
    symbolType: SymbolType;
    signature: string | null;
    isDefault: boolean;
    lineNumber: number | null;
  }> = [];

  for (const extraction of extractions) {
    // 内部インポートのみを保存（外部パッケージは除外）
    for (const imp of extraction.imports) {
      if (!imp.isExternal && imp.resolvedPath) {
        dependencies.push({
          repositoryId,
          sourceFile: extraction.filePath,
          targetFile: imp.resolvedPath,
          importType: imp.importType,
          importedSymbols: imp.importedSymbols,
        });
      }
    }

    // エクスポートを保存
    for (const exp of extraction.exports) {
      symbols.push({
        repositoryId,
        filePath: extraction.filePath,
        symbolName: exp.symbolName,
        symbolType: exp.symbolType,
        signature: exp.signature || null,
        isDefault: exp.isDefault,
        lineNumber: exp.lineNumber || null,
      });
    }
  }

  // バッチ挿入
  if (dependencies.length > 0) {
    await prisma.fileDependency.createMany({
      data: dependencies,
      skipDuplicates: true,
    });
  }

  if (symbols.length > 0) {
    await prisma.exportedSymbol.createMany({
      data: symbols,
      skipDuplicates: true,
    });
  }
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * モジュールパスを解決
 */
function resolveModulePath(
  modulePath: string,
  fileDir: string,
  basePath: string
): string | undefined {
  // 外部モジュールは解決しない
  if (isExternalModule(modulePath)) {
    return undefined;
  }

  // 相対パスを解決
  let resolved = path.posix.join(fileDir, modulePath);

  // 拡張子がない場合は .ts を想定して追加
  if (!path.extname(resolved)) {
    // 実際のファイル存在チェックはここでは行わない
    // インデキシング時に存在チェックを行う
    resolved = resolved + ".ts";
  }

  // basePathを除去して相対パスに
  if (basePath && resolved.startsWith(basePath)) {
    resolved = resolved.slice(basePath.length);
  }

  return resolved;
}

/**
 * 外部モジュールかどうかを判定
 */
function isExternalModule(modulePath: string): boolean {
  // 相対パスでない場合は外部モジュール
  return !modulePath.startsWith(".");
}

/**
 * 関数のシグネチャを取得
 */
function getFunctionSignature(func: Node): string {
  if (!Node.isFunctionDeclaration(func)) return "";

  const name = func.getName() || "anonymous";
  const params = func.getParameters()
    .map(p => `${p.getName()}: ${p.getType().getText()}`)
    .join(", ");
  const returnType = func.getReturnType().getText();

  return `function ${name}(${params}): ${returnType}`;
}

/**
 * クラスのシグネチャを取得
 */
function getClassSignature(cls: Node): string {
  if (!Node.isClassDeclaration(cls)) return "";

  const name = cls.getName() || "AnonymousClass";
  const extendClause = cls.getExtends()?.getText();
  const implementsClause = cls.getImplements()
    .map(i => i.getText())
    .join(", ");

  let signature = `class ${name}`;
  if (extendClause) signature += ` extends ${extendClause}`;
  if (implementsClause) signature += ` implements ${implementsClause}`;

  return signature;
}

/**
 * 変数のシンボルタイプを取得
 */
function getVariableSymbolType(decl: Node): SymbolType {
  if (!Node.isVariableDeclaration(decl)) return "CONST";

  const init = decl.getInitializer();
  if (!init) return "CONST";

  if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
    return "FUNCTION";
  }

  if (Node.isClassExpression(init)) {
    return "CLASS";
  }

  // const/let/var を判定
  const parent = decl.getParent();
  if (Node.isVariableDeclarationList(parent)) {
    const keyword = parent.getDeclarationKind();
    if (keyword === VariableDeclarationKind.Var) return "VAR";
    if (keyword === VariableDeclarationKind.Let) return "LET";
    return "CONST";
  }

  return "CONST";
}

/**
 * 複数ファイルの依存関係を一括で抽出・保存
 */
export async function indexRepositoryDependencies(
  repositoryId: string,
  files: Array<{ path: string; content: string }>,
  basePath: string = ""
): Promise<{
  totalFiles: number;
  totalImports: number;
  totalExports: number;
  errors: string[];
}> {
  const extractions: DependencyExtractionResult[] = [];
  const errors: string[] = [];
  let totalImports = 0;
  let totalExports = 0;

  for (const file of files) {
    // TypeScript/JavaScript ファイルのみ処理
    if (!isAnalyzableFile(file.path)) {
      continue;
    }

    const result = extractDependencies(file.path, file.content, basePath);
    extractions.push(result);
    totalImports += result.imports.length;
    totalExports += result.exports.length;
    errors.push(...result.errors);
  }

  // データベースに保存
  await saveDependencies(repositoryId, extractions);

  return {
    totalFiles: extractions.length,
    totalImports,
    totalExports,
    errors,
  };
}

/**
 * 分析可能なファイルかどうかを判定
 */
function isAnalyzableFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext);
}
