/**
 * Phase 5: Public API Detector
 *
 * 公開APIを検出し、ドキュメントの有無を分析
 */

import {
  Project,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  MethodDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  VariableDeclaration,
  EnumDeclaration,
  SyntaxKind,
} from "ts-morph";
import { SymbolType } from "@prisma/client";

// ========================================
// 型定義
// ========================================

export interface PublicAPI {
  /** シンボル名 */
  name: string;
  /** シンボルの種類 */
  symbolType: SymbolType;
  /** ファイルパス */
  filePath: string;
  /** 開始行 */
  lineNumber: number;
  /** エクスポートの種類 */
  exportType: "named" | "default" | "re-export";
  /** JSDocの有無 */
  hasJSDoc: boolean;
  /** 現在のJSDoc */
  jsDoc?: string;
  /** シグネチャ（関数の場合） */
  signature?: string;
  /** パラメータ情報（関数の場合） */
  parameters?: ParameterDoc[];
  /** 戻り値の型（関数の場合） */
  returnType?: string;
  /** メンバー（クラス/インターフェースの場合） */
  members?: MemberDoc[];
  /** 広く使用されているか（推定） */
  isWidelyUsed: boolean;
  /** ドキュメントの品質スコア (0-100) */
  docQualityScore: number;
}

export interface ParameterDoc {
  name: string;
  type: string;
  isOptional: boolean;
  hasDefault: boolean;
  hasDoc: boolean;
  docDescription?: string;
}

export interface MemberDoc {
  name: string;
  kind: "method" | "property" | "getter" | "setter";
  hasDoc: boolean;
  signature?: string;
}

export interface PublicAPIAnalysisResult {
  /** 検出された公開API */
  apis: PublicAPI[];
  /** 分析エラー */
  errors: string[];
  /** 統計情報 */
  stats: {
    totalApis: number;
    documentedApis: number;
    undocumentedApis: number;
    documentationRate: number;
  };
}

// ========================================
// メイン関数
// ========================================

/**
 * ファイルから公開APIを検出
 */
export function detectPublicAPIs(
  filePath: string,
  content: string
): PublicAPIAnalysisResult {
  const result: PublicAPIAnalysisResult = {
    apis: [],
    errors: [],
    stats: {
      totalApis: 0,
      documentedApis: 0,
      undocumentedApis: 0,
      documentationRate: 0,
    },
  };

  // テストファイルはスキップ
  if (filePath.includes(".test.") || filePath.includes(".spec.")) {
    return result;
  }

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

    // エクスポートされた関数を検出
    for (const func of sourceFile.getFunctions()) {
      if (func.isExported()) {
        const api = analyzeFunctionDeclaration(func, filePath);
        if (api) result.apis.push(api);
      }
    }

    // エクスポートされたクラスを検出
    for (const cls of sourceFile.getClasses()) {
      if (cls.isExported()) {
        const api = analyzeClassDeclaration(cls, filePath);
        if (api) result.apis.push(api);
      }
    }

    // エクスポートされたインターフェースを検出
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.isExported()) {
        const api = analyzeInterfaceDeclaration(iface, filePath);
        if (api) result.apis.push(api);
      }
    }

    // エクスポートされた型エイリアスを検出
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (typeAlias.isExported()) {
        const api = analyzeTypeAliasDeclaration(typeAlias, filePath);
        if (api) result.apis.push(api);
      }
    }

    // エクスポートされた変数（アロー関数含む）を検出
    for (const varStmt of sourceFile.getVariableStatements()) {
      if (varStmt.isExported()) {
        for (const decl of varStmt.getDeclarations()) {
          const api = analyzeVariableDeclaration(decl, varStmt, filePath);
          if (api) result.apis.push(api);
        }
      }
    }

    // エクスポートされたenumを検出
    for (const enumDecl of sourceFile.getEnums()) {
      if (enumDecl.isExported()) {
        const api = analyzeEnumDeclaration(enumDecl, filePath);
        if (api) result.apis.push(api);
      }
    }

    // default exportを検出
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const decl = defaultExport.getValueDeclaration();
      if (decl) {
        const api = analyzeDefaultExport(decl, filePath);
        if (api) result.apis.push(api);
      }
    }

    // 統計を計算
    result.stats.totalApis = result.apis.length;
    result.stats.documentedApis = result.apis.filter(a => a.hasJSDoc).length;
    result.stats.undocumentedApis = result.stats.totalApis - result.stats.documentedApis;
    result.stats.documentationRate = result.stats.totalApis > 0
      ? (result.stats.documentedApis / result.stats.totalApis) * 100
      : 100;

  } catch (error) {
    result.errors.push(`Failed to analyze ${filePath}: ${(error as Error).message}`);
  }

  return result;
}

/**
 * 複数ファイルから公開APIを検出
 */
export function detectPublicAPIsFromFiles(
  files: Array<{ path: string; content: string }>
): PublicAPIAnalysisResult {
  const allApis: PublicAPI[] = [];
  const allErrors: string[] = [];

  for (const file of files) {
    const result = detectPublicAPIs(file.path, file.content);
    allApis.push(...result.apis);
    allErrors.push(...result.errors);
  }

  const documentedCount = allApis.filter(a => a.hasJSDoc).length;

  return {
    apis: allApis,
    errors: allErrors,
    stats: {
      totalApis: allApis.length,
      documentedApis: documentedCount,
      undocumentedApis: allApis.length - documentedCount,
      documentationRate: allApis.length > 0
        ? (documentedCount / allApis.length) * 100
        : 100,
    },
  };
}

// ========================================
// 個別の解析関数
// ========================================

function analyzeFunctionDeclaration(
  func: FunctionDeclaration,
  filePath: string
): PublicAPI | null {
  const name = func.getName();
  if (!name) return null;

  const jsDoc = extractJSDoc(func);
  const parameters = analyzeParameters(func, jsDoc);
  const returnType = getReturnTypeString(func);

  return {
    name,
    symbolType: "FUNCTION",
    filePath,
    lineNumber: func.getStartLineNumber(),
    exportType: func.isDefaultExport() ? "default" : "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    signature: buildFunctionSignature(name, func),
    parameters,
    returnType,
    isWidelyUsed: false, // 依存関係分析で後から判定
    docQualityScore: calculateDocQuality(jsDoc, parameters, returnType),
  };
}

function analyzeClassDeclaration(
  cls: ClassDeclaration,
  filePath: string
): PublicAPI | null {
  const name = cls.getName();
  if (!name) return null;

  const jsDoc = extractJSDoc(cls);
  const members = analyzeClassMembers(cls);

  return {
    name,
    symbolType: "CLASS",
    filePath,
    lineNumber: cls.getStartLineNumber(),
    exportType: cls.isDefaultExport() ? "default" : "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    members,
    isWidelyUsed: false,
    docQualityScore: calculateClassDocQuality(jsDoc, members),
  };
}

function analyzeInterfaceDeclaration(
  iface: InterfaceDeclaration,
  filePath: string
): PublicAPI {
  const name = iface.getName();
  const jsDoc = extractJSDoc(iface);
  const members = analyzeInterfaceMembers(iface);

  return {
    name,
    symbolType: "INTERFACE",
    filePath,
    lineNumber: iface.getStartLineNumber(),
    exportType: "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    members,
    isWidelyUsed: false,
    docQualityScore: calculateTypeDocQuality(jsDoc),
  };
}

function analyzeTypeAliasDeclaration(
  typeAlias: TypeAliasDeclaration,
  filePath: string
): PublicAPI {
  const name = typeAlias.getName();
  const jsDoc = extractJSDoc(typeAlias);

  return {
    name,
    symbolType: "TYPE",
    filePath,
    lineNumber: typeAlias.getStartLineNumber(),
    exportType: "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    isWidelyUsed: false,
    docQualityScore: calculateTypeDocQuality(jsDoc),
  };
}

function analyzeVariableDeclaration(
  decl: VariableDeclaration,
  _stmt: Node,
  filePath: string
): PublicAPI | null {
  const name = decl.getName();
  const init = decl.getInitializer();

  // アロー関数の場合
  if (init && Node.isArrowFunction(init)) {
    return analyzeArrowFunction(init, name, filePath);
  }

  // 通常の定数の場合
  const jsDoc = extractJSDocFromNode(decl);

  return {
    name,
    symbolType: "CONST",
    filePath,
    lineNumber: decl.getStartLineNumber(),
    exportType: "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    isWidelyUsed: false,
    docQualityScore: jsDoc ? 50 : 0,
  };
}

function analyzeArrowFunction(
  func: ArrowFunction,
  name: string,
  filePath: string
): PublicAPI {
  const jsDoc = extractJSDocFromNode(func.getParent()?.getParent() || func);
  const parameters = analyzeArrowParameters(func, jsDoc);
  const returnType = getReturnTypeString(func);

  return {
    name,
    symbolType: "FUNCTION",
    filePath,
    lineNumber: func.getStartLineNumber(),
    exportType: "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    signature: buildArrowSignature(name, func),
    parameters,
    returnType,
    isWidelyUsed: false,
    docQualityScore: calculateDocQuality(jsDoc, parameters, returnType),
  };
}

function analyzeEnumDeclaration(
  enumDecl: EnumDeclaration,
  filePath: string
): PublicAPI {
  const name = enumDecl.getName();
  const jsDoc = extractJSDoc(enumDecl);

  return {
    name,
    symbolType: "ENUM",
    filePath,
    lineNumber: enumDecl.getStartLineNumber(),
    exportType: "named",
    hasJSDoc: !!jsDoc,
    jsDoc,
    isWidelyUsed: false,
    docQualityScore: calculateTypeDocQuality(jsDoc),
  };
}

function analyzeDefaultExport(
  decl: Node,
  filePath: string
): PublicAPI | null {
  if (Node.isFunctionDeclaration(decl)) {
    return analyzeFunctionDeclaration(decl, filePath);
  }
  if (Node.isClassDeclaration(decl)) {
    return analyzeClassDeclaration(decl, filePath);
  }
  if (Node.isArrowFunction(decl)) {
    return analyzeArrowFunction(decl, "default", filePath);
  }
  return null;
}

// ========================================
// ヘルパー関数
// ========================================

function extractJSDoc(node: Node): string | undefined {
  const jsDocs = node.getChildrenOfKind(SyntaxKind.JSDoc);
  if (jsDocs.length > 0) {
    return jsDocs[0].getText();
  }
  return undefined;
}

function extractJSDocFromNode(node: Node): string | undefined {
  // 親ノードからJSDocを探す
  let current: Node | undefined = node;
  while (current) {
    const jsDocs = current.getChildrenOfKind(SyntaxKind.JSDoc);
    if (jsDocs.length > 0) {
      return jsDocs[0].getText();
    }
    current = current.getParent();
  }
  return undefined;
}

function analyzeParameters(
  func: FunctionDeclaration | MethodDeclaration,
  jsDoc?: string
): ParameterDoc[] {
  const paramDocs = parseJSDocParams(jsDoc);

  return func.getParameters().map(param => {
    const name = param.getName();
    const paramDoc = paramDocs.get(name);

    return {
      name,
      type: param.getType().getText() || "any",
      isOptional: param.isOptional(),
      hasDefault: !!param.getInitializer(),
      hasDoc: !!paramDoc,
      docDescription: paramDoc,
    };
  });
}

function analyzeArrowParameters(
  func: ArrowFunction,
  jsDoc?: string
): ParameterDoc[] {
  const paramDocs = parseJSDocParams(jsDoc);

  return func.getParameters().map(param => {
    const name = param.getName();
    const paramDoc = paramDocs.get(name);

    return {
      name,
      type: param.getType().getText() || "any",
      isOptional: param.isOptional(),
      hasDefault: !!param.getInitializer(),
      hasDoc: !!paramDoc,
      docDescription: paramDoc,
    };
  });
}

function parseJSDocParams(jsDoc?: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!jsDoc) return params;

  // @param {type} name description パターンをパース
  const paramRegex = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*(?:-\s*)?([^\n@]*)/g;
  let match;
  while ((match = paramRegex.exec(jsDoc)) !== null) {
    params.set(match[1], match[2].trim());
  }

  return params;
}

function analyzeClassMembers(cls: ClassDeclaration): MemberDoc[] {
  const members: MemberDoc[] = [];

  for (const method of cls.getMethods()) {
    if (method.getScope() !== "private") {
      members.push({
        name: method.getName(),
        kind: "method",
        hasDoc: !!extractJSDoc(method),
        signature: buildMethodSignature(method),
      });
    }
  }

  for (const prop of cls.getProperties()) {
    if (prop.getScope() !== "private") {
      members.push({
        name: prop.getName(),
        kind: "property",
        hasDoc: !!extractJSDoc(prop),
      });
    }
  }

  for (const getter of cls.getGetAccessors()) {
    if (getter.getScope() !== "private") {
      members.push({
        name: getter.getName(),
        kind: "getter",
        hasDoc: !!extractJSDoc(getter),
      });
    }
  }

  return members;
}

function analyzeInterfaceMembers(iface: InterfaceDeclaration): MemberDoc[] {
  const members: MemberDoc[] = [];

  for (const method of iface.getMethods()) {
    members.push({
      name: method.getName(),
      kind: "method",
      hasDoc: !!extractJSDoc(method),
    });
  }

  for (const prop of iface.getProperties()) {
    members.push({
      name: prop.getName(),
      kind: "property",
      hasDoc: !!extractJSDoc(prop),
    });
  }

  return members;
}

function getReturnTypeString(
  func: FunctionDeclaration | MethodDeclaration | ArrowFunction
): string {
  try {
    return func.getReturnType().getText() || "void";
  } catch {
    return "unknown";
  }
}

function buildFunctionSignature(
  name: string,
  func: FunctionDeclaration
): string {
  const params = func.getParameters()
    .map(p => {
      let str = p.getName();
      if (p.isOptional()) str += "?";
      str += `: ${p.getType().getText() || "any"}`;
      return str;
    })
    .join(", ");

  const returnType = getReturnTypeString(func);
  const asyncPrefix = func.isAsync() ? "async " : "";

  return `${asyncPrefix}function ${name}(${params}): ${returnType}`;
}

function buildArrowSignature(name: string, func: ArrowFunction): string {
  const params = func.getParameters()
    .map(p => {
      let str = p.getName();
      if (p.isOptional()) str += "?";
      str += `: ${p.getType().getText() || "any"}`;
      return str;
    })
    .join(", ");

  const returnType = getReturnTypeString(func);
  const asyncPrefix = func.isAsync() ? "async " : "";

  return `${asyncPrefix}const ${name} = (${params}) => ${returnType}`;
}

function buildMethodSignature(method: MethodDeclaration): string {
  const params = method.getParameters()
    .map(p => {
      let str = p.getName();
      if (p.isOptional()) str += "?";
      str += `: ${p.getType().getText() || "any"}`;
      return str;
    })
    .join(", ");

  const returnType = getReturnTypeString(method);

  return `${method.getName()}(${params}): ${returnType}`;
}

// ========================================
// ドキュメント品質スコア計算
// ========================================

function calculateDocQuality(
  jsDoc?: string,
  parameters?: ParameterDoc[],
  returnType?: string
): number {
  if (!jsDoc) return 0;

  let score = 30; // 基本スコア（JSDocがある）

  // 説明文の長さ
  const descriptionMatch = jsDoc.match(/\/\*\*\s*\n?\s*\*\s*([^@\n]+)/);
  if (descriptionMatch && descriptionMatch[1].trim().length > 20) {
    score += 20;
  } else if (descriptionMatch && descriptionMatch[1].trim().length > 0) {
    score += 10;
  }

  // パラメータドキュメント
  if (parameters && parameters.length > 0) {
    const documentedParams = parameters.filter(p => p.hasDoc).length;
    const paramScore = (documentedParams / parameters.length) * 25;
    score += paramScore;
  } else {
    score += 25; // パラメータがない場合は満点
  }

  // 戻り値ドキュメント
  if (returnType && returnType !== "void" && returnType !== "undefined") {
    if (jsDoc.includes("@returns") || jsDoc.includes("@return")) {
      score += 15;
    }
  } else {
    score += 15; // 戻り値がない場合は満点
  }

  // 使用例
  if (jsDoc.includes("@example")) {
    score += 10;
  }

  return Math.min(score, 100);
}

function calculateClassDocQuality(jsDoc?: string, members?: MemberDoc[]): number {
  if (!jsDoc) return 0;

  let score = 30;

  // 説明文
  const descriptionMatch = jsDoc.match(/\/\*\*\s*\n?\s*\*\s*([^@\n]+)/);
  if (descriptionMatch && descriptionMatch[1].trim().length > 20) {
    score += 30;
  } else if (descriptionMatch) {
    score += 15;
  }

  // メンバーのドキュメント率
  if (members && members.length > 0) {
    const documentedMembers = members.filter(m => m.hasDoc).length;
    const memberScore = (documentedMembers / members.length) * 30;
    score += memberScore;
  } else {
    score += 30;
  }

  // 使用例
  if (jsDoc.includes("@example")) {
    score += 10;
  }

  return Math.min(score, 100);
}

function calculateTypeDocQuality(jsDoc?: string): number {
  if (!jsDoc) return 0;

  let score = 40;

  const descriptionMatch = jsDoc.match(/\/\*\*\s*\n?\s*\*\s*([^@\n]+)/);
  if (descriptionMatch && descriptionMatch[1].trim().length > 20) {
    score += 40;
  } else if (descriptionMatch) {
    score += 20;
  }

  if (jsDoc.includes("@example")) {
    score += 20;
  }

  return Math.min(score, 100);
}

// ========================================
// ユーティリティ
// ========================================

/**
 * APIの重要度を判定
 */
export function determineAPISeverity(api: PublicAPI): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  // デフォルトエクスポートは重要
  if (api.exportType === "default") {
    return "CRITICAL";
  }

  // クラスとインターフェースは高重要度
  if (api.symbolType === "CLASS" || api.symbolType === "INTERFACE") {
    return "HIGH";
  }

  // 関数で多くのパラメータを持つものは高重要度
  if (api.symbolType === "FUNCTION" && api.parameters && api.parameters.length >= 3) {
    return "HIGH";
  }

  // その他のエクスポート関数
  if (api.symbolType === "FUNCTION") {
    return "MEDIUM";
  }

  // 型、定数、enum
  return "LOW";
}

/**
 * 公開API分析結果をMarkdown形式で出力
 */
export function formatPublicAPIMarkdown(result: PublicAPIAnalysisResult): string {
  const lines: string[] = [];

  lines.push("## 公開API分析レポート");
  lines.push("");
  lines.push(`- **総API数**: ${result.stats.totalApis}`);
  lines.push(`- **ドキュメント済み**: ${result.stats.documentedApis}`);
  lines.push(`- **未ドキュメント**: ${result.stats.undocumentedApis}`);
  lines.push(`- **ドキュメント率**: ${result.stats.documentationRate.toFixed(1)}%`);
  lines.push("");

  // ドキュメントが必要なAPIをリスト
  const undocumented = result.apis.filter(a => !a.hasJSDoc);
  if (undocumented.length > 0) {
    lines.push("### ドキュメントが必要なAPI");
    lines.push("");
    for (const api of undocumented.slice(0, 10)) {
      const severity = determineAPISeverity(api);
      const icon = severity === "CRITICAL" ? "🔴" : severity === "HIGH" ? "🟠" : severity === "MEDIUM" ? "🟡" : "🟢";
      lines.push(`- ${icon} \`${api.name}\` (${api.symbolType}) - ${api.filePath}:${api.lineNumber}`);
    }
    if (undocumented.length > 10) {
      lines.push(`- ... 他 ${undocumented.length - 10} 件`);
    }
  }

  return lines.join("\n");
}
