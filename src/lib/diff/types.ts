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
  lineNumber: number; // ファイル内の行番号
  diffPosition: number; // Diff内の位置（GitHub API用）
}
