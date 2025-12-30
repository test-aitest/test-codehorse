import type { ParsedDiff, CommentValidationResult } from "./types";
import { getHunkRanges, getFileByPath } from "./parser";
import { COMMENT_ADJUSTMENT_TOLERANCE } from "../ai/constants";

/**
 * diff内で実際にコメント可能な行番号のセットを取得
 * GitHubはdiff内で表示されている行にのみコメントを付けられる
 */
export function getCommentableLines(
  filePath: string,
  parsedDiff: ParsedDiff
): Set<number> {
  const commentableLines = new Set<number>();

  // O(1)ルックアップを使用
  const file = getFileByPath(filePath, parsedDiff);
  if (!file) return commentableLines;

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      // insert行とnormal行（コンテキスト行）はコメント可能
      // delete行はnewLineNumberを持たないのでコメント不可
      if (
        change.newLineNumber !== undefined &&
        (change.type === "insert" || change.type === "normal")
      ) {
        commentableLines.add(change.newLineNumber);
      }
    }
  }

  return commentableLines;
}

/**
 * 指定行に最も近いコメント可能な行を見つける
 */
function findNearestCommentableLine(
  targetLine: number,
  commentableLines: Set<number>,
  tolerance: number = COMMENT_ADJUSTMENT_TOLERANCE
): number | undefined {
  if (commentableLines.has(targetLine)) {
    return targetLine;
  }

  // 許容範囲内で最も近い行を探す
  for (let offset = 1; offset <= tolerance; offset++) {
    if (commentableLines.has(targetLine + offset)) {
      return targetLine + offset;
    }
    if (commentableLines.has(targetLine - offset)) {
      return targetLine - offset;
    }
  }

  return undefined;
}

/**
 * コメント位置がPRのhunk内にあるか検証
 * pr-agentのvalidate_comments_inside_hunks()を参考
 *
 * 重要: GitHubはdiff内で実際に表示されている行にのみコメントを付けられる
 * hunkの範囲内でも、削除された行やdiff外の行にはコメントできない
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

  // 実際にコメント可能な行を取得
  const commentableLines = getCommentableLines(filePath, parsedDiff);

  if (commentableLines.size === 0) {
    return { valid: false, reason: "No commentable lines in diff" };
  }

  // Step 1: 指定行がコメント可能かチェック
  if (commentableLines.has(line)) {
    // 単一行コメント
    if (!startLine || startLine === line) {
      return { valid: true };
    }

    // 複数行コメント: startLineもコメント可能かチェック
    if (commentableLines.has(startLine)) {
      // startLineからlineまでの範囲が有効か確認
      // 連続した範囲である必要はないが、両端が有効であれば許可
      return { valid: true };
    }

    // startLineが無効な場合、最も近いコメント可能な行に調整
    const adjustedStartLine = findNearestCommentableLine(startLine, commentableLines);
    if (adjustedStartLine !== undefined && adjustedStartLine <= line) {
      return {
        valid: true,
        adjustedStartLine,
        reason: `Adjusted start_line from ${startLine} to ${adjustedStartLine} (nearest commentable line)`,
      };
    }

    // startLineを調整できない場合、単一行コメントにダウングレード
    return {
      valid: true,
      adjustedStartLine: line, // 単一行に変換
      reason: `Could not find valid start_line, converted to single-line comment at ${line}`,
    };
  }

  // Step 2: 行がコメント不可の場合、近くのコメント可能な行に調整
  const adjustedLine = findNearestCommentableLine(line, commentableLines);

  if (adjustedLine === undefined) {
    // 許容範囲内にコメント可能な行がない
    return {
      valid: false,
      reason: `Line ${line} is not commentable and no nearby commentable line found within ${COMMENT_ADJUSTMENT_TOLERANCE} lines`
    };
  }

  // 調整後の行で検証
  let adjustedStartLine: number | undefined;
  if (startLine !== undefined && startLine !== adjustedLine) {
    adjustedStartLine = findNearestCommentableLine(startLine, commentableLines);
    if (adjustedStartLine === undefined || adjustedStartLine > adjustedLine) {
      // startLineを調整できないか、line以降になる場合は単一行に変換
      adjustedStartLine = adjustedLine;
    }
  }

  return {
    valid: true,
    adjustedLine,
    adjustedStartLine,
    reason: `Adjusted line from ${line} to ${adjustedLine} (nearest commentable line)`,
  };
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
  const commentableLines = getCommentableLines(filePath, parsedDiff);
  return commentableLines.has(lineNumber);
}
