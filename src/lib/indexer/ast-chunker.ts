import {
  Project,
  SourceFile,
  Node,
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  VariableStatement,
  MethodDeclaration,
} from "ts-morph";
import type { CodeChunk, ChunkType, ChunkingResult } from "./types";
import { countTokens } from "../tokenizer";

// チャンクの最大トークン数（大きすぎるチャンクは分割）
const MAX_CHUNK_TOKENS = 2000;
// 最小チャンクトークン数（小さすぎるチャンクは統合）
const MIN_CHUNK_TOKENS = 50;

/**
 * TypeScript/JavaScript ファイルをAST解析してチャンクに分割
 */
export function chunkTypeScriptFile(
  filePath: string,
  content: string
): ChunkingResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
    },
  });

  const sourceFile = project.createSourceFile(filePath, content);
  const chunks: CodeChunk[] = [];

  // トップレベルの宣言を処理
  processTopLevelDeclarations(sourceFile, filePath, chunks);

  // 小さすぎるチャンクを統合
  const optimizedChunks = optimizeChunks(chunks, filePath);

  return {
    filePath,
    chunks: optimizedChunks,
    totalLines: sourceFile.getEndLineNumber(),
    totalChunks: optimizedChunks.length,
  };
}

/**
 * トップレベルの宣言を処理
 */
function processTopLevelDeclarations(
  sourceFile: SourceFile,
  filePath: string,
  chunks: CodeChunk[]
): void {
  const language = filePath.endsWith(".ts") || filePath.endsWith(".tsx")
    ? "typescript"
    : "javascript";

  // 関数宣言
  sourceFile.getFunctions().forEach((func) => {
    const chunk = extractFunctionChunk(func, filePath, language);
    if (chunk) chunks.push(chunk);
  });

  // クラス宣言
  sourceFile.getClasses().forEach((cls) => {
    const classChunks = extractClassChunks(cls, filePath, language);
    chunks.push(...classChunks);
  });

  // インターフェース宣言
  sourceFile.getInterfaces().forEach((iface) => {
    const chunk = extractInterfaceChunk(iface, filePath, language);
    if (chunk) chunks.push(chunk);
  });

  // 型エイリアス
  sourceFile.getTypeAliases().forEach((typeAlias) => {
    const chunk = extractTypeAliasChunk(typeAlias, filePath, language);
    if (chunk) chunks.push(chunk);
  });

  // 変数宣言（関数式を含む）
  sourceFile.getVariableStatements().forEach((stmt) => {
    const chunk = extractVariableChunk(stmt, filePath, language);
    if (chunk) chunks.push(chunk);
  });
}

/**
 * 関数宣言からチャンクを抽出
 */
function extractFunctionChunk(
  func: FunctionDeclaration,
  filePath: string,
  language: string
): CodeChunk | null {
  const name = func.getName();
  if (!name) return null;

  const content = func.getText();
  const signature = getSignature(func);

  return createChunk({
    filePath,
    language,
    chunkType: "function",
    name,
    content,
    signature,
    startLine: func.getStartLineNumber(),
    endLine: func.getEndLineNumber(),
    exports: func.isExported(),
  });
}

/**
 * クラス宣言からチャンクを抽出（クラス全体 + 各メソッド）
 */
function extractClassChunks(
  cls: ClassDeclaration,
  filePath: string,
  language: string
): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const className = cls.getName() || "AnonymousClass";

  // クラス全体のチャンク（メソッド本体を除く概要）
  const classSignature = getClassSignature(cls);
  const classContent = cls.getText();

  // クラスが大きすぎる場合はメソッドごとに分割
  if (countTokens(classContent) > MAX_CHUNK_TOKENS) {
    // クラスのシグネチャのみ
    chunks.push(
      createChunk({
        filePath,
        language,
        chunkType: "class",
        name: className,
        content: classSignature,
        signature: classSignature,
        startLine: cls.getStartLineNumber(),
        endLine: cls.getStartLineNumber(),
        exports: cls.isExported(),
      })
    );

    // 各メソッドを個別チャンクに
    cls.getMethods().forEach((method) => {
      const methodChunk = extractMethodChunk(method, filePath, language, className);
      if (methodChunk) chunks.push(methodChunk);
    });
  } else {
    // クラス全体を1チャンクに
    chunks.push(
      createChunk({
        filePath,
        language,
        chunkType: "class",
        name: className,
        content: classContent,
        signature: classSignature,
        startLine: cls.getStartLineNumber(),
        endLine: cls.getEndLineNumber(),
        exports: cls.isExported(),
      })
    );
  }

  return chunks;
}

/**
 * メソッドからチャンクを抽出
 */
function extractMethodChunk(
  method: MethodDeclaration,
  filePath: string,
  language: string,
  parentName: string
): CodeChunk | null {
  const name = method.getName();
  const content = method.getText();
  const signature = getMethodSignature(method);

  return createChunk({
    filePath,
    language,
    chunkType: "function",
    name,
    content,
    signature,
    parentName,
    startLine: method.getStartLineNumber(),
    endLine: method.getEndLineNumber(),
  });
}

/**
 * インターフェースからチャンクを抽出
 */
function extractInterfaceChunk(
  iface: InterfaceDeclaration,
  filePath: string,
  language: string
): CodeChunk | null {
  const name = iface.getName();
  const content = iface.getText();

  return createChunk({
    filePath,
    language,
    chunkType: "interface",
    name,
    content,
    signature: `interface ${name}`,
    startLine: iface.getStartLineNumber(),
    endLine: iface.getEndLineNumber(),
    exports: iface.isExported(),
  });
}

/**
 * 型エイリアスからチャンクを抽出
 */
function extractTypeAliasChunk(
  typeAlias: TypeAliasDeclaration,
  filePath: string,
  language: string
): CodeChunk | null {
  const name = typeAlias.getName();
  const content = typeAlias.getText();

  return createChunk({
    filePath,
    language,
    chunkType: "type",
    name,
    content,
    signature: `type ${name}`,
    startLine: typeAlias.getStartLineNumber(),
    endLine: typeAlias.getEndLineNumber(),
    exports: typeAlias.isExported(),
  });
}

/**
 * 変数宣言からチャンクを抽出（関数式含む）
 */
function extractVariableChunk(
  stmt: VariableStatement,
  filePath: string,
  language: string
): CodeChunk | null {
  const declarations = stmt.getDeclarations();
  if (declarations.length === 0) return null;

  const firstDecl = declarations[0];
  const name = firstDecl.getName();
  const initializer = firstDecl.getInitializer();

  // 関数式・アロー関数の場合
  if (
    initializer &&
    (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))
  ) {
    const content = stmt.getText();
    const signature = getVariableFunctionSignature(firstDecl);

    return createChunk({
      filePath,
      language,
      chunkType: "function",
      name,
      content,
      signature,
      startLine: stmt.getStartLineNumber(),
      endLine: stmt.getEndLineNumber(),
      exports: stmt.isExported(),
    });
  }

  // 通常の変数（定数オブジェクトなど、ある程度のサイズがあるもの）
  const content = stmt.getText();
  if (countTokens(content) >= MIN_CHUNK_TOKENS) {
    return createChunk({
      filePath,
      language,
      chunkType: "variable",
      name,
      content,
      startLine: stmt.getStartLineNumber(),
      endLine: stmt.getEndLineNumber(),
      exports: stmt.isExported(),
    });
  }

  return null;
}

/**
 * チャンクを作成
 */
function createChunk(params: {
  filePath: string;
  language: string;
  chunkType: ChunkType;
  name: string;
  content: string;
  signature?: string;
  parentName?: string;
  startLine: number;
  endLine: number;
  exports?: boolean;
}): CodeChunk {
  return {
    filePath: params.filePath,
    language: params.language,
    chunkType: params.chunkType,
    name: params.name,
    content: params.content,
    signature: params.signature,
    parentName: params.parentName,
    startLine: params.startLine,
    endLine: params.endLine,
    exports: params.exports,
  };
}

/**
 * 関数のシグネチャを取得
 */
function getSignature(func: FunctionDeclaration): string {
  const name = func.getName() || "anonymous";
  const params = func.getParameters().map((p) => p.getText()).join(", ");
  const returnType = func.getReturnType().getText();
  return `function ${name}(${params}): ${returnType}`;
}

/**
 * クラスのシグネチャを取得
 */
function getClassSignature(cls: ClassDeclaration): string {
  const name = cls.getName() || "AnonymousClass";
  const extendClause = cls.getExtends()?.getText();
  const implementsClause = cls.getImplements().map((i) => i.getText()).join(", ");

  let signature = `class ${name}`;
  if (extendClause) signature += ` extends ${extendClause}`;
  if (implementsClause) signature += ` implements ${implementsClause}`;

  return signature;
}

/**
 * メソッドのシグネチャを取得
 */
function getMethodSignature(method: MethodDeclaration): string {
  const name = method.getName();
  const params = method.getParameters().map((p) => p.getText()).join(", ");
  const returnType = method.getReturnType().getText();
  const modifiers = method.getModifiers().map((m) => m.getText()).join(" ");
  return `${modifiers} ${name}(${params}): ${returnType}`.trim();
}

/**
 * 変数に代入された関数のシグネチャを取得
 */
function getVariableFunctionSignature(decl: Node): string | undefined {
  const init = (decl as { getInitializer?: () => Node | undefined }).getInitializer?.();
  if (!init) return undefined;

  if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
    const params = init.getParameters().map((p: { getText: () => string }) => p.getText()).join(", ");
    const returnType = init.getReturnType()?.getText() || "unknown";
    return `(${params}) => ${returnType}`;
  }

  return undefined;
}

/**
 * 小さすぎるチャンクを統合して最適化
 */
function optimizeChunks(chunks: CodeChunk[], filePath: string): CodeChunk[] {
  if (chunks.length === 0) return chunks;

  // トークン数が少なすぎるチャンクを統合
  const optimized: CodeChunk[] = [];
  let pending: CodeChunk[] = [];
  let pendingTokens = 0;

  for (const chunk of chunks) {
    const tokens = countTokens(chunk.content);

    if (tokens >= MIN_CHUNK_TOKENS) {
      // 保留中のチャンクがあれば先にフラッシュ
      if (pending.length > 0) {
        optimized.push(mergeChunks(pending, filePath));
        pending = [];
        pendingTokens = 0;
      }
      optimized.push(chunk);
    } else {
      // 小さいチャンクは保留
      pending.push(chunk);
      pendingTokens += tokens;

      // 保留トークンが閾値を超えたらマージ
      if (pendingTokens >= MIN_CHUNK_TOKENS) {
        optimized.push(mergeChunks(pending, filePath));
        pending = [];
        pendingTokens = 0;
      }
    }
  }

  // 残りの保留チャンクをマージ
  if (pending.length > 0) {
    optimized.push(mergeChunks(pending, filePath));
  }

  return optimized;
}

/**
 * 複数のチャンクを1つにマージ
 */
function mergeChunks(chunks: CodeChunk[], filePath: string): CodeChunk {
  if (chunks.length === 1) return chunks[0];

  const names = chunks.map((c) => c.name).join(", ");
  const content = chunks.map((c) => c.content).join("\n\n");
  const startLine = Math.min(...chunks.map((c) => c.startLine));
  const endLine = Math.max(...chunks.map((c) => c.endLine));

  return {
    filePath,
    language: chunks[0].language,
    chunkType: "other",
    name: `[${names}]`,
    content,
    startLine,
    endLine,
  };
}
