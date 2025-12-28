import type { ParsedDiff, CommentValidationResult } from "./types";
import { getHunkRanges } from "./parser";

// コメント位置調整の許容範囲（行数）
const ADJUSTMENT_TOLERANCE = 10;

/**
 * コメント位置がPRのhunk内にあるか検証
 * pr-agentのvalidate_comments_inside_hunks()を参考
 */
export function validateCommentPosition(
  filePath: string,
  line: number,
  startLine: number | undefined,
  parsedDiff: ParsedDiff
): CommentValidationResult {
  const ranges = getHunkRanges(filePath, parsedDiff);

  if (ranges.length === 0) {
    return { valid: false, reason: "File not in diff" };
  }

  // 行がいずれかのhunk内にあるかチェック
  for (const range of ranges) {
    if (line >= range.newStart && line <= range.newEnd) {
      // 単一行コメント: 有効
      if (!startLine || startLine === line) {
        return { valid: true };
      }

      // 複数行コメント: startLineもhunk内にあるかチェック
      if (startLine >= range.newStart && startLine <= line) {
        return { valid: true };
      }

      // startLineがhunk外の場合、hunk境界に調整
      if (startLine < range.newStart) {
        return {
          valid: true,
          adjustedStartLine: range.newStart,
          reason: `Adjusted start_line from ${startLine} to ${range.newStart} (hunk boundary)`,
        };
      }
    }
  }

  // 許容範囲内で最も近いhunkの行に調整を試みる
  for (const range of ranges) {
    // lineがhunkの少し外にある場合
    if (line >= range.newStart - ADJUSTMENT_TOLERANCE && line <= range.newEnd + ADJUSTMENT_TOLERANCE) {
      const adjustedLine = Math.min(Math.max(line, range.newStart), range.newEnd);

      let adjustedStartLine: number | undefined;
      if (startLine !== undefined && startLine !== adjustedLine) {
        adjustedStartLine = Math.min(Math.max(startLine, range.newStart), adjustedLine);
      }

      return {
        valid: true,
        adjustedLine,
        adjustedStartLine,
        reason: `Adjusted line from ${line} to ${adjustedLine}`,
      };
    }
  }

  return { valid: false, reason: `Line ${line} not in any hunk` };
}

/**
 * ファイルの有効な行範囲を取得
 */
export function getValidLineRanges(
  filePath: string,
  parsedDiff: ParsedDiff
): Array<{ start: number; end: number }> {
  const ranges = getHunkRanges(filePath, parsedDiff);
  return ranges.map((range) => ({
    start: range.newStart,
    end: range.newEnd,
  }));
}

/**
 * 複数のコメントをバッチ検証
 */
export function validateComments(
  comments: Array<{
    path: string;
    line: number;
    startLine?: number;
  }>,
  parsedDiff: ParsedDiff
): Array<{
  original: { path: string; line: number; startLine?: number };
  validation: CommentValidationResult;
  adjusted?: { path: string; line: number; startLine?: number };
}> {
  return comments.map((comment) => {
    const validation = validateCommentPosition(
      comment.path,
      comment.line,
      comment.startLine,
      parsedDiff
    );

    if (!validation.valid) {
      return { original: comment, validation };
    }

    // 調整が必要な場合
    if (validation.adjustedLine || validation.adjustedStartLine) {
      return {
        original: comment,
        validation,
        adjusted: {
          path: comment.path,
          line: validation.adjustedLine ?? comment.line,
          startLine: validation.adjustedStartLine ?? comment.startLine,
        },
      };
    }

    return { original: comment, validation };
  });
}

/**
 * 行番号がhunk内の追加行（insert）または変更なし行（normal）かチェック
 * コメントは追加された行にのみ付けられる
 */
export function isCommentableLineInDiff(
  filePath: string,
  lineNumber: number,
  parsedDiff: ParsedDiff
): boolean {
  const file = parsedDiff.files.find(
    (f) => f.newPath === filePath || f.oldPath === filePath
  );
  if (!file) return false;

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      if (
        change.newLineNumber === lineNumber &&
        (change.type === "insert" || change.type === "normal")
      ) {
        return true;
      }
    }
  }

  return false;
}
