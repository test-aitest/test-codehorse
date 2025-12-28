import type { CodeChunk, ChunkingResult, ChunkType } from "./types";
import { countTokens } from "../tokenizer";

// チャンクの最大トークン数
const MAX_CHUNK_TOKENS = 2000;

/**
 * 汎用的なチャンカー（AST解析を使わない言語用）
 * 関数/クラス定義のパターンマッチングで分割
 */
export function chunkGenericFile(
  filePath: string,
  content: string,
  language: string
): ChunkingResult {
  const lines = content.split("\n");
  const chunks: CodeChunk[] = [];

  // 言語別のパターン
  const patterns = getLanguagePatterns(language);

  let currentChunk: {
    startLine: number;
    endLine: number;
    lines: string[];
    type: ChunkType;
    name: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 新しい定義の開始を検出
    const match = detectDefinitionStart(line, patterns);

    if (match) {
      // 前のチャンクを保存
      if (currentChunk) {
        chunks.push(createChunkFromLines(currentChunk, filePath, language));
      }

      // 新しいチャンクを開始
      currentChunk = {
        startLine: lineNum,
        endLine: lineNum,
        lines: [line],
        type: match.type,
        name: match.name,
      };
    } else if (currentChunk) {
      // 現在のチャンクに追加
      currentChunk.lines.push(line);
      currentChunk.endLine = lineNum;

      // トークン数が上限を超えたら分割
      const currentTokens = countTokens(currentChunk.lines.join("\n"));
      if (currentTokens > MAX_CHUNK_TOKENS) {
        chunks.push(createChunkFromLines(currentChunk, filePath, language));
        currentChunk = null;
      }
    }
  }

  // 最後のチャンクを保存
  if (currentChunk) {
    chunks.push(createChunkFromLines(currentChunk, filePath, language));
  }

  // チャンクがない場合はファイル全体を1チャンクに
  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      filePath,
      language,
      chunkType: "other",
      name: getFileName(filePath),
      content: content,
      startLine: 1,
      endLine: lines.length,
    });
  }

  return {
    filePath,
    chunks,
    totalLines: lines.length,
    totalChunks: chunks.length,
  };
}

/**
 * 言語別の定義パターンを取得
 */
function getLanguagePatterns(language: string): DefinitionPattern[] {
  const patterns: Record<string, DefinitionPattern[]> = {
    python: [
      { regex: /^(async\s+)?def\s+(\w+)\s*\(/, type: "function", nameGroup: 2 },
      { regex: /^class\s+(\w+)/, type: "class", nameGroup: 1 },
    ],
    go: [
      { regex: /^func\s+(\w+)\s*\(/, type: "function", nameGroup: 1 },
      { regex: /^func\s+\(\w+\s+\*?(\w+)\)\s+(\w+)\s*\(/, type: "function", nameGroup: 2 },
      { regex: /^type\s+(\w+)\s+struct/, type: "class", nameGroup: 1 },
      { regex: /^type\s+(\w+)\s+interface/, type: "interface", nameGroup: 1 },
    ],
    rust: [
      { regex: /^(pub\s+)?fn\s+(\w+)/, type: "function", nameGroup: 2 },
      { regex: /^(pub\s+)?struct\s+(\w+)/, type: "class", nameGroup: 2 },
      { regex: /^(pub\s+)?enum\s+(\w+)/, type: "type", nameGroup: 2 },
      { regex: /^(pub\s+)?trait\s+(\w+)/, type: "interface", nameGroup: 2 },
      { regex: /^impl\s+(\w+)/, type: "class", nameGroup: 1 },
    ],
    java: [
      { regex: /^\s*(public|private|protected)?\s*(static)?\s*\w+\s+(\w+)\s*\(/, type: "function", nameGroup: 3 },
      { regex: /^\s*(public|private|protected)?\s*class\s+(\w+)/, type: "class", nameGroup: 2 },
      { regex: /^\s*(public|private|protected)?\s*interface\s+(\w+)/, type: "interface", nameGroup: 2 },
    ],
    kotlin: [
      { regex: /^\s*(fun|suspend\s+fun)\s+(\w+)/, type: "function", nameGroup: 2 },
      { regex: /^\s*(class|data\s+class|sealed\s+class)\s+(\w+)/, type: "class", nameGroup: 2 },
      { regex: /^\s*interface\s+(\w+)/, type: "interface", nameGroup: 1 },
    ],
    swift: [
      { regex: /^\s*(func|static\s+func)\s+(\w+)/, type: "function", nameGroup: 2 },
      { regex: /^\s*(class|struct)\s+(\w+)/, type: "class", nameGroup: 2 },
      { regex: /^\s*protocol\s+(\w+)/, type: "interface", nameGroup: 1 },
    ],
    c: [
      { regex: /^(\w+\s+)+(\w+)\s*\([^)]*\)\s*\{?$/, type: "function", nameGroup: 2 },
      { regex: /^struct\s+(\w+)/, type: "class", nameGroup: 1 },
      { regex: /^typedef\s+struct/, type: "type", nameGroup: 0 },
    ],
    cpp: [
      { regex: /^(\w+\s+)+(\w+)\s*\([^)]*\)\s*(const)?\s*\{?$/, type: "function", nameGroup: 2 },
      { regex: /^class\s+(\w+)/, type: "class", nameGroup: 1 },
      { regex: /^struct\s+(\w+)/, type: "class", nameGroup: 1 },
      { regex: /^namespace\s+(\w+)/, type: "other", nameGroup: 1 },
    ],
    csharp: [
      { regex: /^\s*(public|private|protected|internal)?\s*(static|async)?\s*\w+\s+(\w+)\s*\(/, type: "function", nameGroup: 3 },
      { regex: /^\s*(public|private|protected|internal)?\s*(partial)?\s*class\s+(\w+)/, type: "class", nameGroup: 3 },
      { regex: /^\s*(public|private|protected|internal)?\s*interface\s+(\w+)/, type: "interface", nameGroup: 2 },
    ],
    php: [
      { regex: /^\s*(public|private|protected)?\s*(static)?\s*function\s+(\w+)/, type: "function", nameGroup: 3 },
      { regex: /^\s*class\s+(\w+)/, type: "class", nameGroup: 1 },
      { regex: /^\s*interface\s+(\w+)/, type: "interface", nameGroup: 1 },
    ],
    ruby: [
      { regex: /^\s*def\s+(\w+)/, type: "function", nameGroup: 1 },
      { regex: /^\s*class\s+(\w+)/, type: "class", nameGroup: 1 },
      { regex: /^\s*module\s+(\w+)/, type: "other", nameGroup: 1 },
    ],
  };

  return patterns[language] || [];
}

interface DefinitionPattern {
  regex: RegExp;
  type: ChunkType;
  nameGroup: number;
}

/**
 * 定義の開始を検出
 */
function detectDefinitionStart(
  line: string,
  patterns: DefinitionPattern[]
): { type: ChunkType; name: string } | null {
  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      const name = match[pattern.nameGroup] || "anonymous";
      return { type: pattern.type, name };
    }
  }
  return null;
}

/**
 * 行からチャンクを作成
 */
function createChunkFromLines(
  data: {
    startLine: number;
    endLine: number;
    lines: string[];
    type: ChunkType;
    name: string;
  },
  filePath: string,
  language: string
): CodeChunk {
  return {
    filePath,
    language,
    chunkType: data.type,
    name: data.name,
    content: data.lines.join("\n"),
    startLine: data.startLine,
    endLine: data.endLine,
  };
}

/**
 * ファイルパスからファイル名を取得
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}
