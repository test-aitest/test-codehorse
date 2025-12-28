// Diff行番号 → position 変換
// GitHub APIの `position` パラメータは最初の '@@' hunkヘッダーからの相対行数
// https://docs.github.com/rest/pulls/reviews#create-a-review-for-a-pull-request
//
// 例:
// @@ -1,3 +1,4 @@   <- position計算の起点（カウントしない）
//  context           <- position 1
// +insert            <- position 2
// @@ -10,3 +11,3 @@  <- position 3（hunkヘッダーもカウント）
//  context           <- position 4

import type { ParsedFile } from "./types";

/**
 * ファイル行番号からdiff position へのマッピングを構築
 * position はファイル全体で累積し、hunkヘッダーも1行としてカウント
 */
function buildLineToPositionMap(file: ParsedFile): Map<number, number> {
  const lineToPosition = new Map<number, number>();
  let cumulativePosition = 0;

  for (let i = 0; i < file.hunks.length; i++) {
    const hunk = file.hunks[i];

    // 最初のhunk以外は、hunkヘッダー（@@行）を1行としてカウント
    if (i > 0) {
      cumulativePosition++;
    }

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

  // デバッグ: 利用可能なファイルパス一覧
  console.log(
    "[LineValidator] Available files:",
    files.map((f) => f.newPath)
  );

  // ファイルごとのマッピングをキャッシュ
  const fileMapCache = new Map<string, Map<number, number>>();

  for (const comment of comments) {
    // ファイルを検索
    const file = files.find(
      (f) => f.newPath === comment.path || f.oldPath === comment.path
    );

    if (!file) {
      console.warn(`[LineValidator] File not found: ${comment.path}`);
      console.warn(
        `[LineValidator] Available: ${files.map((f) => f.newPath).join(", ")}`
      );
      continue;
    }

    // マッピングを取得（キャッシュがあれば使用）
    let lineToPosition = fileMapCache.get(file.newPath);
    if (!lineToPosition) {
      lineToPosition = buildLineToPositionMap(file);
      fileMapCache.set(file.newPath, lineToPosition);
      // デバッグ: マッピング内容
      console.log(
        `[LineValidator] ${file.newPath} line→position map:`,
        Array.from(lineToPosition.entries()).slice(0, 10)
      );
    }

    // 行番号からpositionを取得
    const position = lineToPosition.get(comment.line);
    if (position !== undefined) {
      result.push({
        path: comment.path,
        position,
        body: comment.body,
      });
      console.log(
        `[LineValidator] ✓ ${comment.path}:${comment.line} → position ${position}`
      );
    } else {
      console.warn(
        `[LineValidator] ✗ Line ${comment.line} not in diff: ${comment.path}`
      );
      console.warn(
        `[LineValidator] Available lines: ${Array.from(lineToPosition.keys())
          .sort((a, b) => a - b)
          .join(", ")}`
      );
    }
  }

  console.log(
    `[LineValidator] Converted ${comments.length} → ${result.length} comments`
  );

  return result;
}
