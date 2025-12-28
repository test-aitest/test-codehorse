// Diff 型定義

export interface ParsedDiff {
  files: ParsedFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface ParsedFile {
  oldPath: string;
  newPath: string;
  type: "add" | "delete" | "modify" | "rename";
  hunks: ParsedHunk[];
  additions: number;
  deletions: number;
}

export interface ParsedHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  changes: ParsedChange[];
}

export interface ParsedChange {
  type: "insert" | "delete" | "normal";
  content: string;
  oldLineNumber?: number;  // 元ファイルの行番号（delete/normalで使用）
  newLineNumber?: number;  // 新ファイルの行番号（insert/normalで使用）
  diffPosition: number;    // Diff内の位置（GitHub API用）
}

// Hunk範囲情報（検証用）
export interface HunkRange {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

// 行番号マッピング（diff位置からファイル行番号への変換）
export interface LineMapping {
  diffPosition: number;
  oldLineNumber?: number;
  newLineNumber?: number;
  type: "insert" | "delete" | "normal";
}

// コメント位置検証結果
export interface CommentValidationResult {
  valid: boolean;
  adjustedLine?: number;
  adjustedStartLine?: number;
  reason?: string;
}

// ========================================
// 拡張Diffコンテキスト
// ========================================

// コンテキスト拡張オプション
export interface ExtendedContextOptions {
  // 追加するコンテキスト行数（デフォルト: 3、最大: 10）
  contextLines: number;
  // ファイルヘッダーを含めるか
  includeFileHeaders: boolean;
  // 最大ファイルサイズ（バイト、超過時はスキップ）
  maxFileSize: number;
}

// デフォルト設定
export const DEFAULT_CONTEXT_OPTIONS: ExtendedContextOptions = {
  contextLines: parseInt(process.env.DIFF_CONTEXT_LINES || "5", 10),
  includeFileHeaders: true,
  maxFileSize: 500000, // 500KB
};

// ファイル内容プロバイダーインターフェース
export interface FileContentProvider {
  getFileContent(path: string, ref: string): Promise<string | null>;
}

// 拡張されたHunk（追加コンテキスト付き）
export interface ExtendedHunk extends ParsedHunk {
  // 拡張されたコンテキスト行
  extendedBefore: string[];
  extendedAfter: string[];
  // 元のhunk開始行からのオフセット
  extendedOldStart: number;
  extendedNewStart: number;
}

// 拡張されたファイル
export interface ExtendedFile extends Omit<ParsedFile, "hunks"> {
  hunks: ExtendedHunk[];
  // ファイル内容が取得できたかどうか
  contentFetched: boolean;
  // ファイルの総行数
  totalLines?: number;
}

// コンテキスト拡張結果
export interface ContextExtensionResult {
  files: ExtendedFile[];
  // 拡張されたDiff文字列
  extendedDiff: string;
  // 統計情報
  stats: {
    filesProcessed: number;
    filesSkipped: number;
    totalContextLinesAdded: number;
  };
}
