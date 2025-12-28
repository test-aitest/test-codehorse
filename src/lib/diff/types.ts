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
