import { countTokens, truncateToTokenLimit } from "./index";
import type { ParsedFile, ParsedHunk } from "../diff/types";

// =====================================================
// チャンク型定義
// =====================================================

export interface Chunk {
  id: string;
  filePath: string;
  content: string;
  tokenCount: number;
  startLine: number;
  endLine: number;
}

const DEFAULT_MAX_TOKENS = 4000;

// =====================================================
// チャンキング関数
// =====================================================

/**
 * Diffファイルをトークン制限内のチャンクに分割
 */
export function chunkDiffFile(
  file: ParsedFile,
  maxTokensPerChunk: number = DEFAULT_MAX_TOKENS
): Chunk[] {
  const chunks: Chunk[] = [];

  // ファイル全体が収まる場合
  const fullContent = file.hunks.map((h) => h.content).join("\n");
  const fullTokens = countTokens(fullContent);

  if (fullTokens <= maxTokensPerChunk) {
    chunks.push({
      id: `${file.newPath}-0`,
      filePath: file.newPath,
      content: fullContent,
      tokenCount: fullTokens,
      startLine: file.hunks[0]?.newStart || 0,
      endLine:
        file.hunks[file.hunks.length - 1]?.newStart +
          (file.hunks[file.hunks.length - 1]?.newLines || 0) || 0,
    });
    return chunks;
  }

  // ハンク単位で分割
  let currentChunk = "";
  let currentTokens = 0;
  let chunkIndex = 0;
  let startLine = 0;

  for (const hunk of file.hunks) {
    const hunkTokens = countTokens(hunk.content);

    if (currentTokens + hunkTokens > maxTokensPerChunk) {
      // 現在のチャンクを保存
      if (currentChunk) {
        chunks.push({
          id: `${file.newPath}-${chunkIndex}`,
          filePath: file.newPath,
          content: currentChunk,
          tokenCount: currentTokens,
          startLine,
          endLine: hunk.newStart - 1,
        });
        chunkIndex++;
      }

      // ハンク単体でも大きすぎる場合は切り詰め
      if (hunkTokens > maxTokensPerChunk) {
        const truncated = truncateToTokenLimit(hunk.content, maxTokensPerChunk);
        chunks.push({
          id: `${file.newPath}-${chunkIndex}`,
          filePath: file.newPath,
          content: truncated + "\n... [truncated]",
          tokenCount: maxTokensPerChunk,
          startLine: hunk.newStart,
          endLine: hunk.newStart + hunk.newLines,
        });
        chunkIndex++;
        currentChunk = "";
        currentTokens = 0;
      } else {
        currentChunk = hunk.content;
        currentTokens = hunkTokens;
        startLine = hunk.newStart;
      }
    } else {
      if (!currentChunk) startLine = hunk.newStart;
      currentChunk += (currentChunk ? "\n" : "") + hunk.content;
      currentTokens += hunkTokens;
    }
  }

  // 残りのチャンクを保存
  if (currentChunk) {
    const lastHunk = file.hunks[file.hunks.length - 1];
    chunks.push({
      id: `${file.newPath}-${chunkIndex}`,
      filePath: file.newPath,
      content: currentChunk,
      tokenCount: currentTokens,
      startLine,
      endLine: lastHunk ? lastHunk.newStart + lastHunk.newLines : 0,
    });
  }

  return chunks;
}

/**
 * 複数ファイルのDiffをトークン制限内にまとめる
 */
export function combineFilesWithinTokenLimit(
  files: ParsedFile[],
  maxTokens: number
): { content: string; includedFiles: string[]; truncated: boolean } {
  let content = "";
  const includedFiles: string[] = [];
  let currentTokens = 0;
  let truncated = false;

  for (const file of files) {
    const fileContent = file.hunks.map((h) => h.content).join("\n");
    const fileHeader = `\n### ${file.newPath}\n\`\`\`diff\n`;
    const fileFooter = "\n```\n";

    const fileTokens = countTokens(fileHeader + fileContent + fileFooter);

    if (currentTokens + fileTokens > maxTokens) {
      truncated = true;
      break;
    }

    content += fileHeader + fileContent + fileFooter;
    currentTokens += fileTokens;
    includedFiles.push(file.newPath);
  }

  return { content, includedFiles, truncated };
}

/**
 * テキストを指定トークン数で分割
 */
export function splitTextByTokens(
  text: string,
  maxTokensPerChunk: number
): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let currentChunk = "";
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line + "\n");

    if (currentTokens + lineTokens > maxTokensPerChunk) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
      currentTokens = lineTokens;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + line;
      currentTokens += lineTokens;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
