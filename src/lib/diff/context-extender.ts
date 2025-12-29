/**
 * Extended Diff Context
 *
 * Hunk前後のコンテキスト行を拡張して、AIにより多くの文脈を提供する
 * pr-agentの「extend patches」機能を参考に実装
 */

import type {
  ParsedFile,
  ParsedHunk,
  ExtendedContextOptions,
  ExtendedFile,
  ExtendedHunk,
  ContextExtensionResult,
  FileContentProvider,
} from "./types";
import { DEFAULT_CONTEXT_OPTIONS } from "./types";

// ========================================
// コンテキスト行数の制限
// ========================================

const MAX_CONTEXT_LINES = 10;
const MIN_CONTEXT_LINES = 0;

/**
 * コンテキスト行数を有効範囲に制限
 */
function clampContextLines(lines: number): number {
  return Math.max(MIN_CONTEXT_LINES, Math.min(MAX_CONTEXT_LINES, lines));
}

// ========================================
// ファイル内容のキャッシュ
// ========================================

// シンプルなインメモリキャッシュ
const fileContentCache = new Map<string, string[]>();

/**
 * キャッシュキーを生成
 */
function getCacheKey(path: string, ref: string): string {
  return `${ref}:${path}`;
}

/**
 * キャッシュをクリア
 */
export function clearContextCache(): void {
  fileContentCache.clear();
}

// ========================================
// コンテキスト拡張のメイン関数
// ========================================

/**
 * パースされたファイルのコンテキストを拡張
 *
 * @param files - パースされたファイル配列
 * @param ref - Gitの参照（commit SHA/branch）
 * @param provider - ファイル内容を取得するプロバイダー
 * @param options - 拡張オプション
 */
export async function extendDiffContext(
  files: ParsedFile[],
  ref: string,
  provider: FileContentProvider,
  options: Partial<ExtendedContextOptions> = {}
): Promise<ContextExtensionResult> {
  const opts: ExtendedContextOptions = {
    ...DEFAULT_CONTEXT_OPTIONS,
    ...options,
  };

  // コンテキスト行数を制限
  opts.contextLines = clampContextLines(opts.contextLines);

  const extendedFiles: ExtendedFile[] = [];
  let filesProcessed = 0;
  let filesSkipped = 0;
  let totalContextLinesAdded = 0;

  for (const file of files) {
    // 削除されたファイルはスキップ
    if (file.type === "delete") {
      extendedFiles.push({
        ...file,
        hunks: file.hunks.map((h) => convertToExtendedHunk(h)),
        contentFetched: false,
      });
      filesSkipped++;
      continue;
    }

    try {
      // ファイル内容を取得（キャッシュ確認）
      const cacheKey = getCacheKey(file.newPath, ref);
      let fileLines = fileContentCache.get(cacheKey);

      if (!fileLines) {
        const content = await provider.getFileContent(file.newPath, ref);

        if (!content) {
          console.log(`[ContextExtender] Could not fetch: ${file.newPath}`);
          extendedFiles.push({
            ...file,
            hunks: file.hunks.map((h) => convertToExtendedHunk(h)),
            contentFetched: false,
          });
          filesSkipped++;
          continue;
        }

        // ファイルサイズチェック
        if (content.length > opts.maxFileSize) {
          console.log(`[ContextExtender] File too large, skipping: ${file.newPath}`);
          extendedFiles.push({
            ...file,
            hunks: file.hunks.map((h) => convertToExtendedHunk(h)),
            contentFetched: false,
          });
          filesSkipped++;
          continue;
        }

        fileLines = content.split("\n");
        fileContentCache.set(cacheKey, fileLines);
      }

      // 各hunkを拡張
      const extendedHunks: ExtendedHunk[] = [];

      for (const hunk of file.hunks) {
        const extended = extendHunk(hunk, fileLines, opts.contextLines);
        totalContextLinesAdded += extended.extendedBefore.length + extended.extendedAfter.length;
        extendedHunks.push(extended);
      }

      extendedFiles.push({
        ...file,
        hunks: extendedHunks,
        contentFetched: true,
        totalLines: fileLines.length,
      });

      filesProcessed++;
    } catch (error) {
      console.warn(`[ContextExtender] Error processing ${file.newPath}:`, error);
      extendedFiles.push({
        ...file,
        hunks: file.hunks.map((h) => convertToExtendedHunk(h)),
        contentFetched: false,
      });
      filesSkipped++;
    }
  }

  // 拡張されたDiff文字列を生成
  const extendedDiff = reconstructExtendedDiff(extendedFiles, opts);

  console.log(
    `[ContextExtender] Processed ${filesProcessed} files, skipped ${filesSkipped}, added ${totalContextLinesAdded} context lines`
  );

  return {
    files: extendedFiles,
    extendedDiff,
    stats: {
      filesProcessed,
      filesSkipped,
      totalContextLinesAdded,
    },
  };
}

// ========================================
// Hunk拡張ロジック
// ========================================

/**
 * 単一のHunkを拡張
 *
 * @param hunk - 元のhunk
 * @param fileLines - ファイルの全行
 * @param contextLines - 追加するコンテキスト行数
 */
function extendHunk(
  hunk: ParsedHunk,
  fileLines: string[],
  contextLines: number
): ExtendedHunk {
  // 新ファイルの行番号ベースで計算（1-indexed）
  const hunkStart = hunk.newStart;
  const hunkEnd = hunk.newStart + hunk.newLines - 1;

  // 拡張範囲を計算（ファイル境界を超えない）
  const extendedStart = Math.max(1, hunkStart - contextLines);
  const extendedEnd = Math.min(fileLines.length, hunkEnd + contextLines);

  // 前方コンテキスト行を取得
  const extendedBefore: string[] = [];
  for (let i = extendedStart; i < hunkStart; i++) {
    // 0-indexed で取得
    extendedBefore.push(fileLines[i - 1] || "");
  }

  // 後方コンテキスト行を取得
  const extendedAfter: string[] = [];
  for (let i = hunkEnd + 1; i <= extendedEnd; i++) {
    extendedAfter.push(fileLines[i - 1] || "");
  }

  return {
    ...hunk,
    extendedBefore,
    extendedAfter,
    extendedOldStart: Math.max(1, hunk.oldStart - extendedBefore.length),
    extendedNewStart: extendedStart,
  };
}

/**
 * ParsedHunkをExtendedHunkに変換（拡張なし）
 */
function convertToExtendedHunk(hunk: ParsedHunk): ExtendedHunk {
  return {
    ...hunk,
    extendedBefore: [],
    extendedAfter: [],
    extendedOldStart: hunk.oldStart,
    extendedNewStart: hunk.newStart,
  };
}

// ========================================
// Diff再構築
// ========================================

/**
 * 拡張されたファイルからDiff文字列を再構築
 */
function reconstructExtendedDiff(
  files: ExtendedFile[],
  options: ExtendedContextOptions
): string {
  const parts: string[] = [];

  for (const file of files) {
    const fileDiff = reconstructExtendedFileDiff(file, options);
    parts.push(fileDiff);
  }

  return parts.join("\n\n");
}

/**
 * 単一ファイルの拡張Diffを再構築
 */
function reconstructExtendedFileDiff(
  file: ExtendedFile,
  options: ExtendedContextOptions
): string {
  const lines: string[] = [];

  // ファイルヘッダー
  if (options.includeFileHeaders) {
    lines.push(`diff --git a/${file.oldPath} b/${file.newPath}`);

    if (file.type === "add") {
      lines.push(`new file mode 100644`);
    } else if (file.type === "delete") {
      lines.push(`deleted file mode 100644`);
    } else if (file.type === "rename") {
      lines.push(`rename from ${file.oldPath}`);
      lines.push(`rename to ${file.newPath}`);
    }

    lines.push(`--- a/${file.oldPath}`);
    lines.push(`+++ b/${file.newPath}`);
  }

  // 各hunkを出力
  for (const hunk of file.hunks) {
    // 拡張されたhunkヘッダー
    const oldLines =
      hunk.oldLines + hunk.extendedBefore.length + hunk.extendedAfter.length;
    const newLines =
      hunk.newLines + hunk.extendedBefore.length + hunk.extendedAfter.length;

    lines.push(
      `@@ -${hunk.extendedOldStart},${oldLines} +${hunk.extendedNewStart},${newLines} @@${hunk.content ? ` ${hunk.content}` : ""}`
    );

    // 前方コンテキスト（通常行として追加）
    for (const line of hunk.extendedBefore) {
      lines.push(` ${line}`);
    }

    // 元の変更行
    for (const change of hunk.changes) {
      const prefix =
        change.type === "insert" ? "+" : change.type === "delete" ? "-" : " ";
      lines.push(`${prefix}${change.content}`);
    }

    // 後方コンテキスト
    for (const line of hunk.extendedAfter) {
      lines.push(` ${line}`);
    }
  }

  return lines.join("\n");
}

// ========================================
// GitHub用のファイル内容プロバイダー
// ========================================

/**
 * GitHub Octokitを使用したファイル内容プロバイダーを作成
 */
export function createGitHubFileProvider(
  octokit: {
    rest: {
      repos: {
        getContent: (params: {
          owner: string;
          repo: string;
          path: string;
          ref: string;
        }) => Promise<{
          data:
            | { type: string; content?: string; encoding?: string }
            | Array<unknown>;
        }>;
      };
    };
  },
  owner: string,
  repo: string
): FileContentProvider {
  return {
    async getFileContent(path: string, ref: string): Promise<string | null> {
      try {
        const response = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });

        // 配列の場合はディレクトリなのでスキップ
        if (Array.isArray(response.data)) {
          return null;
        }

        const data = response.data;

        if (data.type !== "file" || !data.content) {
          return null;
        }

        // Base64デコード
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return content;
      } catch (error) {
        // 404などのエラーはnullを返す
        console.warn(`[GitHubFileProvider] Failed to fetch ${path}@${ref}:`, error);
        return null;
      }
    },
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * 拡張オプションを環境変数から取得
 */
export function getContextOptionsFromEnv(): ExtendedContextOptions {
  return {
    contextLines: clampContextLines(
      parseInt(process.env.DIFF_CONTEXT_LINES || "5", 10)
    ),
    includeFileHeaders: true,
    maxFileSize: parseInt(process.env.DIFF_MAX_FILE_SIZE || "500000", 10),
  };
}

/**
 * コンテキスト拡張が有効かどうかを確認
 */
export function isContextExtensionEnabled(): boolean {
  return process.env.DIFF_CONTEXT_EXTENSION_ENABLED !== "false";
}

/**
 * 拡張結果のサマリーを生成
 */
export function formatContextExtensionSummary(
  result: ContextExtensionResult
): string {
  return `Context Extension: ${result.stats.filesProcessed} files processed, ${result.stats.filesSkipped} skipped, ${result.stats.totalContextLinesAdded} lines added`;
}
