// Diff行番号 → position 変換
// GitHub APIの `position` パラメータは '@@' hunkヘッダーからの累積相対位置
// https://docs.github.com/rest/pulls/reviews#create-a-review-for-a-pull-request

import type { ParsedFile } from "./types";

/**
 * ファイル行番号からdiff position へのマッピングを構築
 * position はファイル全体で累積（hunk間でリセットしない）
 */
function buildLineToPositionMap(file: ParsedFile): Map<number, number> {
  const lineToPosition = new Map<number, number>();
  let cumulativePosition = 0;

  for (const hunk of file.hunks) {
    for (const change of hunk.changes) {
      cumulativePosition++;
      // insert または normal の行のみが新ファイル側でコメント可能
      if (change.type === "insert" || change.type === "normal") {
        lineToPosition.set(change.lineNumber, cumulativePosition);
      }
    }
  }

  return lineToPosition;
}

/**
 * コメント配列を position ベースに変換
 * 無効な行番号のコメントは除外
 */
export function convertCommentsToPositionBased(
  comments: Array<{ path: string; line: number; side: "RIGHT"; body: string }>,
  files: ParsedFile[]
): Array<{ path: string; position: number; body: string }> {
  const result: Array<{ path: string; position: number; body: string }> = [];

  // ファイルごとのマッピングをキャッシュ
  const fileMapCache = new Map<string, Map<number, number>>();

  for (const comment of comments) {
    // ファイルを検索
    const file = files.find(
      (f) => f.newPath === comment.path || f.oldPath === comment.path
    );

    if (!file) {
      console.warn(`[LineValidator] File not found: ${comment.path}`);
      continue;
    }

    // マッピングを取得（キャッシュがあれば使用）
    let lineToPosition = fileMapCache.get(file.newPath);
    if (!lineToPosition) {
      lineToPosition = buildLineToPositionMap(file);
      fileMapCache.set(file.newPath, lineToPosition);
    }

    // 行番号からpositionを取得
    const position = lineToPosition.get(comment.line);
    if (position !== undefined) {
      result.push({
        path: comment.path,
        position,
        body: comment.body,
      });
    } else {
      console.warn(
        `[LineValidator] Line ${comment.line} not in diff: ${comment.path}`
      );
    }
  }

  if (comments.length !== result.length) {
    console.log(
      `[LineValidator] ${comments.length} → ${result.length} comments`
    );
  }

  return result;
}
