import gitdiffParser from "gitdiff-parser";
import type { ParsedDiff, ParsedFile, ParsedHunk, ParsedChange } from "./types";

/**
 * 生のDiffテキストをパースして構造化
 */
export function parseDiff(rawDiff: string): ParsedDiff {
  const files = gitdiffParser.parse(rawDiff);

  let totalAdditions = 0;
  let totalDeletions = 0;

  const parsedFiles: ParsedFile[] = files.map((file) => {
    const parsedHunks: ParsedHunk[] = file.hunks.map((hunk) => {
      let diffPosition = 0;
      // gitdiff-parserはinsert/deleteの行番号をundefinedで返すことがあるため
      // hunkのnewStart/oldStartから自分で計算する
      let currentNewLine = hunk.newStart;
      let currentOldLine = hunk.oldStart;

      const changes: ParsedChange[] = hunk.changes.map((change) => {
        diffPosition++;

        let lineNumber: number;
        if (change.type === "delete") {
          // 削除行：旧ファイルの行番号を使用
          lineNumber = (change as any).oldLineNumber || currentOldLine;
          currentOldLine++;
        } else if (change.type === "insert") {
          // 追加行：新ファイルの行番号を使用
          lineNumber = (change as any).newLineNumber || currentNewLine;
          currentNewLine++;
        } else {
          // normal（変更なし）：両方の行番号をインクリメント
          lineNumber = (change as any).newLineNumber || currentNewLine;
          currentNewLine++;
          currentOldLine++;
        }

        return {
          type: change.type as "insert" | "delete" | "normal",
          content: change.content,
          lineNumber,
          diffPosition,
        };
      });

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        content: hunk.content,
        changes,
      };
    });

    const additions = (file as any).additions || 0;
    const deletions = (file as any).deletions || 0;
    totalAdditions += additions;
    totalDeletions += deletions;

    // ファイルタイプを決定
    let fileType: ParsedFile["type"];
    if (file.type === "add") {
      fileType = "add";
    } else if (file.type === "delete") {
      fileType = "delete";
    } else if (file.type === "rename") {
      fileType = "rename";
    } else {
      fileType = "modify";
    }

    return {
      oldPath: file.oldPath,
      newPath: file.newPath,
      type: fileType,
      hunks: parsedHunks,
      additions,
      deletions,
    };
  });

  return { files: parsedFiles, totalAdditions, totalDeletions };
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
