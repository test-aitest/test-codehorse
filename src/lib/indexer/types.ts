// インデキシング関連の型定義

/**
 * コードチャンク
 */
export interface CodeChunk {
  // 識別情報
  filePath: string;
  language: string;
  chunkType: ChunkType;
  name: string;

  // 位置情報
  startLine: number;
  endLine: number;

  // コンテンツ
  content: string;
  signature?: string; // 関数シグネチャやクラス宣言

  // 階層情報
  parentName?: string; // クラスメソッドの場合の親クラス名
  exports?: boolean; // export されているか
}

/**
 * チャンクタイプ
 */
export type ChunkType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "import"
  | "other";

/**
 * インデキシング対象ファイル
 */
export interface IndexableFile {
  path: string;
  content: string;
  language: string;
}

/**
 * チャンキング結果
 */
export interface ChunkingResult {
  filePath: string;
  chunks: CodeChunk[];
  totalLines: number;
  totalChunks: number;
}

/**
 * サポートする言語
 */
export const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * 言語がサポートされているか
 */
export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(language as SupportedLanguage);
}
