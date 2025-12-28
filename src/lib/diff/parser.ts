import type { ParsedDiff, ParsedFile, ParsedHunk } from "./types";

// pr-agentの正規表現パターンを参考にしたDiffパーサー
// https://github.com/qodo-ai/pr-agent/blob/main/pr_agent/algo/git_patch_processing.py

// Hunkヘッダー: @@ -start,size +start,size @@ optional context
const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)?$/;

// Diffヘッダー: diff --git a/path b/path
const DIFF_HEADER_REGEX = /^diff --git a\/(.*) b\/(.*)$/;

// ファイルモード: new file mode / deleted file mode
const NEW_FILE_REGEX = /^new file mode \d+$/;
const DELETED_FILE_REGEX = /^deleted file mode \d+$/;
const RENAME_FROM_REGEX = /^rename from (.*)$/;
const RENAME_TO_REGEX = /^rename to (.*)$/;

// ファイルパス: --- a/path または +++ b/path
const OLD_FILE_PATH_REGEX = /^--- (?:a\/)?(.*)$/;
const NEW_FILE_PATH_REGEX = /^\+\+\+ (?:b\/)?(.*)$/;

// Binary file
const BINARY_FILE_REGEX = /^Binary files .* differ$/;

/**
 * Hunkヘッダーをパース
 */
function parseHunkHeader(line: string): {
  oldStart: number;
  oldSize: number;
  newStart: number;
  newSize: number;
  sectionHeader: string;
} | null {
  const match = HUNK_HEADER_REGEX.exec(line);
  if (!match) return null;

  return {
    oldStart: parseInt(match[1], 10),
    oldSize: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newSize: match[4] ? parseInt(match[4], 10) : 1,
    sectionHeader: match[5]?.trim() || "",
  };
}

/**
 * 生のDiffテキストをパースして構造化
 */
export function parseDiff(rawDiff: string): ParsedDiff {
  const lines = rawDiff.split("\n");
  const files: ParsedFile[] = [];

  let currentFile: Partial<ParsedFile> | null = null;
  let currentHunk: Partial<ParsedHunk> | null = null;

  let diffPosition = 0;
  let currentOldLine = 0;
  let currentNewLine = 0;
  let renameFrom = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Diffヘッダー: diff --git a/path b/path
    const diffMatch = DIFF_HEADER_REGEX.exec(line);
    if (diffMatch) {
      // 前のファイルを保存
      if (currentHunk && currentFile) {
        currentFile.hunks = currentFile.hunks || [];
        currentFile.hunks.push(currentHunk as ParsedHunk);
      }
      if (currentFile && currentFile.hunks) {
        files.push(currentFile as ParsedFile);
      }

      // 新しいファイルを開始
      currentFile = {
        oldPath: diffMatch[1],
        newPath: diffMatch[2],
        type: "modify",
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      diffPosition = 0;
      renameFrom = "";
      continue;
    }

    // ファイルモードの検出
    if (currentFile) {
      if (NEW_FILE_REGEX.test(line)) {
        currentFile.type = "add";
        continue;
      }
      if (DELETED_FILE_REGEX.test(line)) {
        currentFile.type = "delete";
        continue;
      }
      const renameFromMatch = RENAME_FROM_REGEX.exec(line);
      if (renameFromMatch) {
        renameFrom = renameFromMatch[1];
        continue;
      }
      const renameToMatch = RENAME_TO_REGEX.exec(line);
      if (renameToMatch) {
        currentFile.type = "rename";
        currentFile.oldPath = renameFrom || currentFile.oldPath;
        continue;
      }
    }

    // Binary file
    if (BINARY_FILE_REGEX.test(line)) {
      continue;
    }

    // --- a/path（旧ファイルパス）
    if (currentFile && OLD_FILE_PATH_REGEX.test(line)) {
      continue;
    }

    // +++ b/path（新ファイルパス）
    if (currentFile && NEW_FILE_PATH_REGEX.test(line)) {
      continue;
    }

    // Hunkヘッダー: @@ -start,size +start,size @@
    const hunkHeader = parseHunkHeader(line);
    if (hunkHeader && currentFile) {
      // 前のhunkを保存
      if (currentHunk && currentHunk.changes) {
        currentFile.hunks = currentFile.hunks || [];
        currentFile.hunks.push(currentHunk as ParsedHunk);
      }

      // 新しいhunkを開始
      currentHunk = {
        oldStart: hunkHeader.oldStart,
        oldLines: hunkHeader.oldSize,
        newStart: hunkHeader.newStart,
        newLines: hunkHeader.newSize,
        content: hunkHeader.sectionHeader,
        changes: [],
      };

      currentOldLine = hunkHeader.oldStart;
      currentNewLine = hunkHeader.newStart;
      diffPosition = 0;
      continue;
    }

    // 変更行（+, -, スペース）
    if (currentHunk && currentFile) {
      if (line.startsWith("+")) {
        // 追加行
        diffPosition++;
        currentFile.additions = (currentFile.additions || 0) + 1;
        currentHunk.changes = currentHunk.changes || [];
        currentHunk.changes.push({
          type: "insert",
          content: line.substring(1),
          newLineNumber: currentNewLine,
          diffPosition,
        });
        currentNewLine++;
      } else if (line.startsWith("-")) {
        // 削除行
        diffPosition++;
        currentFile.deletions = (currentFile.deletions || 0) + 1;
        currentHunk.changes = currentHunk.changes || [];
        currentHunk.changes.push({
          type: "delete",
          content: line.substring(1),
          oldLineNumber: currentOldLine,
          diffPosition,
        });
        currentOldLine++;
      } else if (line.startsWith(" ") || line === "") {
        // コンテキスト行（変更なし）
        diffPosition++;
        currentHunk.changes = currentHunk.changes || [];
        currentHunk.changes.push({
          type: "normal",
          content: line.substring(1),
          oldLineNumber: currentOldLine,
          newLineNumber: currentNewLine,
          diffPosition,
        });
        currentOldLine++;
        currentNewLine++;
      }
      // それ以外の行（indexなど）は無視
    }
  }

  // 最後のファイルとhunkを保存
  if (currentHunk && currentFile) {
    currentFile.hunks = currentFile.hunks || [];
    currentFile.hunks.push(currentHunk as ParsedHunk);
  }
  if (currentFile && currentFile.hunks) {
    files.push(currentFile as ParsedFile);
  }

  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}

/**
 * ParsedFileからDiff文字列を再構築
 */
export function reconstructDiff(file: ParsedFile): string {
  const lines: string[] = [];

  lines.push(`diff --git a/${file.oldPath} b/${file.newPath}`);

  if (file.type === "add") {
    lines.push(`new file mode 100644`);
  } else if (file.type === "delete") {
    lines.push(`deleted file mode 100644`);
  }

  lines.push(`--- a/${file.oldPath}`);
  lines.push(`+++ b/${file.newPath}`);

  for (const hunk of file.hunks) {
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    );
    for (const change of hunk.changes) {
      const prefix =
        change.type === "insert"
          ? "+"
          : change.type === "delete"
          ? "-"
          : " ";
      lines.push(`${prefix}${change.content}`);
    }
  }

  return lines.join("\n");
}

/**
 * 指定されたファイルパスと行番号に対応するdiff位置を検索
 * GitHub APIのインラインコメントに必要
 */
export function findDiffPosition(
  filePath: string,
  lineNumber: number,
  parsedDiff: ParsedDiff,
  side: "old" | "new" = "new"
): number | null {
  const file = parsedDiff.files.find(
    (f) => f.newPath === filePath || f.oldPath === filePath
  );
  if (!file) return null;

  let cumulativeDiffPosition = 0;

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      cumulativeDiffPosition++;

      if (side === "new") {
        if (
          change.newLineNumber === lineNumber &&
          (change.type === "insert" || change.type === "normal")
        ) {
          return cumulativeDiffPosition;
        }
      } else {
        if (
          change.oldLineNumber === lineNumber &&
          (change.type === "delete" || change.type === "normal")
        ) {
          return cumulativeDiffPosition;
        }
      }
    }
  }

  return null;
}

/**
 * ファイルのhunk範囲を取得
 */
export function getHunkRanges(
  filePath: string,
  parsedDiff: ParsedDiff
): Array<{ newStart: number; newEnd: number; oldStart: number; oldEnd: number }> {
  const file = parsedDiff.files.find(
    (f) => f.newPath === filePath || f.oldPath === filePath
  );
  if (!file) return [];

  return file.hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldEnd: hunk.oldStart + hunk.oldLines - 1,
    newStart: hunk.newStart,
    newEnd: hunk.newStart + hunk.newLines - 1,
  }));
}

/**
 * 行番号がいずれかのhunk内に含まれるかチェック
 */
export function isLineInHunks(
  filePath: string,
  lineNumber: number,
  parsedDiff: ParsedDiff
): boolean {
  const ranges = getHunkRanges(filePath, parsedDiff);
  return ranges.some(
    (range) => lineNumber >= range.newStart && lineNumber <= range.newEnd
  );
}
