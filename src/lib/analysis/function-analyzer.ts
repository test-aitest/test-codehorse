/**
 * Phase 4: Function Analyzer
 *
 * コード内の関数を解析し、テスト生成に必要な情報を抽出
 */

import {
  Project,
  Node,
  FunctionDeclaration,
  ArrowFunction,
  MethodDeclaration,
  ParameterDeclaration,
  SyntaxKind,
} from "ts-morph";

// ========================================
// 型定義
// ========================================

export interface FunctionInfo {
  /** 関数名 */
  name: string;
  /** ファイルパス */
  filePath: string;
  /** 開始行 */
  startLine: number;
  /** 終了行 */
  endLine: number;
  /** パラメータ情報 */
  parameters: ParameterInfo[];
  /** 戻り値の型 */
  returnType: string;
  /** async関数かどうか */
  isAsync: boolean;
  /** エクスポートされているか */
  isExported: boolean;
  /** 関数の種類 */
  kind: "function" | "arrow" | "method";
  /** JSDocコメント */
  jsDoc?: string;
  /** 関数本体のコード */
  body: string;
  /** 関数シグネチャ */
  signature: string;
  /** 依存する外部関数/モジュール */
  dependencies: string[];
  /** 使用しているAPI（fetch, fs, etc.） */
  usedAPIs: string[];
}

export interface ParameterInfo {
  /** パラメータ名 */
  name: string;
  /** パラメータの型 */
  type: string;
  /** デフォルト値があるか */
  hasDefault: boolean;
  /** デフォルト値 */
  defaultValue?: string;
  /** オプショナルか */
  isOptional: boolean;
  /** rest parameterか */
  isRest: boolean;
}

export interface AnalysisResult {
  /** 抽出された関数一覧 */
  functions: FunctionInfo[];
  /** エラーメッセージ */
  errors: string[];
}

// ========================================
// メイン関数
// ========================================

/**
 * ファイルから関数を抽出して解析
 */
export function analyzeFunctions(
  filePath: string,
  content: string
): AnalysisResult {
  const result: AnalysisResult = {
    functions: [],
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

    // 関数宣言を抽出
    for (const func of sourceFile.getFunctions()) {
      const info = extractFunctionInfo(func, filePath, "function");
      if (info) {
        result.functions.push(info);
      }
    }

    // クラスメソッドを抽出
    for (const cls of sourceFile.getClasses()) {
      for (const method of cls.getMethods()) {
        const info = extractMethodInfo(method, filePath, cls.getName() || "Anonymous");
        if (info) {
          result.functions.push(info);
        }
      }
    }

    // アロー関数の変数宣言を抽出
    for (const varStmt of sourceFile.getVariableStatements()) {
      for (const decl of varStmt.getDeclarations()) {
        const init = decl.getInitializer();
        if (init && Node.isArrowFunction(init)) {
          const info = extractArrowFunctionInfo(
            init,
            decl.getName(),
            filePath,
            varStmt.isExported()
          );
          if (info) {
            result.functions.push(info);
          }
        }
      }
    }

    // エクスポートされた関数式を抽出
    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const decl = defaultExport.getValueDeclaration();
      if (decl && Node.isArrowFunction(decl)) {
        const info = extractArrowFunctionInfo(decl, "default", filePath, true);
        if (info) {
          result.functions.push(info);
        }
      }
    }

  } catch (error) {
    result.errors.push(`Failed to analyze ${filePath}: ${(error as Error).message}`);
  }

  return result;
}

/**
 * 新しく追加された関数のみを抽出
 */
export function extractNewFunctions(
  filePath: string,
  diffContent: string,
  fullContent: string
): FunctionInfo[] {
  // diffから追加された行を特定
  const addedLines = new Set<number>();
  const lines = diffContent.split("\n");
  let currentLine = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // @@ -x,y +a,b @@ の形式からaを抽出
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLine = parseInt(match[1], 10) - 1;
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.add(currentLine);
      currentLine++;
    } else if (!line.startsWith("-")) {
      currentLine++;
    }
  }

  // 全ファイルを解析
  const analysis = analyzeFunctions(filePath, fullContent);

  // 追加された行に含まれる関数のみをフィルタ
  return analysis.functions.filter(func => {
    // 関数の開始行が追加された行に含まれているか
    for (let line = func.startLine; line <= func.endLine; line++) {
      if (addedLines.has(line)) {
        return true;
      }
    }
    return false;
  });
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * 関数宣言から情報を抽出
 */
function extractFunctionInfo(
  func: FunctionDeclaration,
  filePath: string,
  kind: "function" | "arrow" | "method"
): FunctionInfo | null {
  const name = func.getName();
  if (!name) return null;

  return {
    name,
    filePath,
    startLine: func.getStartLineNumber(),
    endLine: func.getEndLineNumber(),
    parameters: extractParameters(func.getParameters()),
    returnType: getReturnTypeString(func),
    isAsync: func.isAsync(),
    isExported: func.isExported(),
    kind,
    jsDoc: extractJsDoc(func),
    body: func.getBodyText() || "",
    signature: buildSignature(name, func.getParameters(), getReturnTypeString(func), func.isAsync()),
    dependencies: extractDependencies(func),
    usedAPIs: extractUsedAPIs(func),
  };
}

/**
 * メソッドから情報を抽出
 */
function extractMethodInfo(
  method: MethodDeclaration,
  filePath: string,
  className: string
): FunctionInfo | null {
  const name = method.getName();

  return {
    name: `${className}.${name}`,
    filePath,
    startLine: method.getStartLineNumber(),
    endLine: method.getEndLineNumber(),
    parameters: extractParameters(method.getParameters()),
    returnType: getReturnTypeString(method),
    isAsync: method.isAsync(),
    isExported: true, // クラスメソッドは基本的にアクセス可能
    kind: "method",
    jsDoc: extractJsDoc(method),
    body: method.getBodyText() || "",
    signature: buildSignature(name, method.getParameters(), getReturnTypeString(method), method.isAsync()),
    dependencies: extractDependencies(method),
    usedAPIs: extractUsedAPIs(method),
  };
}

/**
 * アロー関数から情報を抽出
 */
function extractArrowFunctionInfo(
  func: ArrowFunction,
  name: string,
  filePath: string,
  isExported: boolean
): FunctionInfo | null {
  return {
    name,
    filePath,
    startLine: func.getStartLineNumber(),
    endLine: func.getEndLineNumber(),
    parameters: extractParameters(func.getParameters()),
    returnType: getReturnTypeString(func),
    isAsync: func.isAsync(),
    isExported,
    kind: "arrow",
    jsDoc: undefined, // アロー関数はJSDocを直接持たない
    body: func.getBodyText() || "",
    signature: buildSignature(name, func.getParameters(), getReturnTypeString(func), func.isAsync()),
    dependencies: extractDependencies(func),
    usedAPIs: extractUsedAPIs(func),
  };
}

/**
 * パラメータ情報を抽出
 */
function extractParameters(params: ParameterDeclaration[]): ParameterInfo[] {
  return params.map(param => {
    const initializer = param.getInitializer();
    return {
      name: param.getName(),
      type: param.getType().getText() || "any",
      hasDefault: !!initializer,
      defaultValue: initializer?.getText(),
      isOptional: param.isOptional(),
      isRest: param.isRestParameter(),
    };
  });
}

/**
 * 戻り値の型を文字列で取得
 */
function getReturnTypeString(func: FunctionDeclaration | MethodDeclaration | ArrowFunction): string {
  try {
    const returnType = func.getReturnType();
    return returnType.getText() || "void";
  } catch {
    return "unknown";
  }
}

/**
 * シグネチャを構築
 */
function buildSignature(
  name: string,
  params: ParameterDeclaration[],
  returnType: string,
  isAsync: boolean
): string {
  const paramStr = params
    .map(p => {
      let str = p.getName();
      if (p.isOptional()) str += "?";
      str += `: ${p.getType().getText() || "any"}`;
      return str;
    })
    .join(", ");

  const asyncPrefix = isAsync ? "async " : "";
  return `${asyncPrefix}function ${name}(${paramStr}): ${returnType}`;
}

/**
 * JSDocを抽出
 */
function extractJsDoc(node: Node): string | undefined {
  const jsDocs = node.getChildrenOfKind(SyntaxKind.JSDoc);
  if (jsDocs.length > 0) {
    return jsDocs[0].getText();
  }
  return undefined;
}

/**
 * 依存関係を抽出（呼び出している関数名）
 */
function extractDependencies(node: Node): string[] {
  const deps = new Set<string>();

  node.forEachDescendant(child => {
    if (Node.isCallExpression(child)) {
      const expr = child.getExpression();
      if (Node.isIdentifier(expr)) {
        deps.add(expr.getText());
      } else if (Node.isPropertyAccessExpression(expr)) {
        deps.add(expr.getText());
      }
    }
  });

  return Array.from(deps);
}

/**
 * 使用しているAPIを抽出
 */
function extractUsedAPIs(node: Node): string[] {
  const apis = new Set<string>();

  // よく使われるAPI名のリスト
  const knownAPIs = [
    "fetch", "axios", "request",
    "fs", "path", "os", "crypto",
    "console", "JSON", "Math", "Date",
    "setTimeout", "setInterval", "Promise",
    "localStorage", "sessionStorage",
    "document", "window",
    "process", "Buffer",
    "prisma", "db", "database",
    "redis", "cache",
  ];

  node.forEachDescendant(child => {
    if (Node.isIdentifier(child)) {
      const name = child.getText();
      if (knownAPIs.includes(name)) {
        apis.add(name);
      }
    }
  });

  return Array.from(apis);
}

/**
 * テスト可能な関数かどうかを判定
 */
export function isTestableFunction(func: FunctionInfo): boolean {
  // テストファイル自体は除外
  if (func.filePath.includes(".test.") || func.filePath.includes(".spec.")) {
    return false;
  }

  // 空の関数は除外
  if (!func.body.trim()) {
    return false;
  }

  // エクスポートされていない関数も一応テスト可能
  // ただし優先度は低い

  // 非常に短い関数（getter/setterなど）は低優先度
  const bodyLines = func.body.split("\n").length;
  if (bodyLines < 2) {
    return false;
  }

  return true;
}

/**
 * 関数の複雑度を計算（簡易版）
 */
export function calculateComplexity(func: FunctionInfo): number {
  let complexity = 1; // 基本

  const body = func.body;

  // 条件分岐
  complexity += (body.match(/\bif\b/g) || []).length;
  complexity += (body.match(/\belse\b/g) || []).length;
  complexity += (body.match(/\bcase\b/g) || []).length;
  complexity += (body.match(/\?\s*[^:]/g) || []).length; // 三項演算子

  // ループ
  complexity += (body.match(/\bfor\b/g) || []).length;
  complexity += (body.match(/\bwhile\b/g) || []).length;
  complexity += (body.match(/\.map\(/g) || []).length;
  complexity += (body.match(/\.filter\(/g) || []).length;
  complexity += (body.match(/\.reduce\(/g) || []).length;

  // 例外処理
  complexity += (body.match(/\btry\b/g) || []).length;
  complexity += (body.match(/\bcatch\b/g) || []).length;

  // 論理演算子
  complexity += (body.match(/&&/g) || []).length;
  complexity += (body.match(/\|\|/g) || []).length;

  return complexity;
}
