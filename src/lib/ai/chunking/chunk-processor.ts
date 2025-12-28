/**
 * Chunk Processor
 *
 * 大規模PRを分割して並列処理するためのチャンキングシステム
 * pr-agentの分割処理戦略を参考に実装
 */

import type { ParsedFile } from "../../diff/types";
import { reconstructDiff } from "../../diff/parser";
import { countTokens } from "../../tokenizer";

// ========================================
// 設定
// ========================================

export interface ChunkConfig {
  // 1チャンクあたりの最大トークン数
  maxTokensPerChunk: number;
  // チャンク間のオーバーラップトークン数（コンテキスト維持用）
  overlapTokens: number;
  // 最大並列処理数
  parallelChunks: number;
  // 最小ファイル数（これ以下はチャンク分割しない）
  minFilesForChunking: number;
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxTokensPerChunk: parseInt(process.env.AI_MAX_TOKENS_PER_CHUNK || "50000", 10),
  overlapTokens: parseInt(process.env.AI_CHUNK_OVERLAP_TOKENS || "500", 10),
  parallelChunks: parseInt(process.env.AI_PARALLEL_CHUNKS || "3", 10),
  minFilesForChunking: 3,
};

// ========================================
// 型定義
// ========================================

export interface DiffChunk {
  id: string;
  index: number;
  files: ParsedFile[];
  diffContent: string;
  tokenCount: number;
  // チャンク情報
  isFirst: boolean;
  isLast: boolean;
  totalChunks: number;
}

export interface ChunkingResult {
  chunks: DiffChunk[];
  needsChunking: boolean;
  totalTokens: number;
  totalFiles: number;
  stats: {
    avgTokensPerChunk: number;
    maxTokensInChunk: number;
    minTokensInChunk: number;
  };
}

// ========================================
// チャンキング判定
// ========================================

/**
 * チャンキングが必要かどうかを判定
 */
export function needsChunking(
  files: ParsedFile[],
  diffContent: string,
  config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): boolean {
  // ファイル数が少なすぎる場合はチャンク不要
  if (files.length < config.minFilesForChunking) {
    return false;
  }

  // トークン数が閾値を超えている場合はチャンク必要
  const totalTokens = countTokens(diffContent);
  return totalTokens > config.maxTokensPerChunk;
}

// ========================================
// ファイルグループ化戦略
// ========================================

/**
 * ファイルをトークン数に基づいてグループ化
 * 関連ファイル（同じディレクトリ）を優先的にまとめる
 */
function groupFilesByTokenLimit(
  files: ParsedFile[],
  maxTokens: number
): ParsedFile[][] {
  const groups: ParsedFile[][] = [];
  let currentGroup: ParsedFile[] = [];
  let currentTokens = 0;

  // ファイルをディレクトリでソート（関連ファイルをまとめる）
  const sortedFiles = [...files].sort((a, b) => {
    const dirA = a.newPath.split("/").slice(0, -1).join("/");
    const dirB = b.newPath.split("/").slice(0, -1).join("/");
    return dirA.localeCompare(dirB);
  });

  for (const file of sortedFiles) {
    const fileDiff = reconstructDiff(file);
    const fileTokens = countTokens(fileDiff);

    // 単一ファイルが最大トークン数を超える場合
    if (fileTokens > maxTokens) {
      // 現在のグループをフラッシュ
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentTokens = 0;
      }

      // 大きなファイルは単独でグループ化
      groups.push([file]);
      console.warn(
        `[Chunking] Large file ${file.newPath} (${fileTokens} tokens) exceeds chunk limit, processing alone`
      );
      continue;
    }

    // 現在のグループに追加すると超過する場合
    if (currentTokens + fileTokens > maxTokens && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
      currentTokens = 0;
    }

    currentGroup.push(file);
    currentTokens += fileTokens;
  }

  // 残りのグループを追加
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// ========================================
// メインチャンキング関数
// ========================================

/**
 * ファイルリストをチャンクに分割
 */
export function createChunks(
  files: ParsedFile[],
  diffContent: string,
  config: Partial<ChunkConfig> = {}
): ChunkingResult {
  const opts: ChunkConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };
  const totalTokens = countTokens(diffContent);

  // チャンキング不要の場合
  if (!needsChunking(files, diffContent, opts)) {
    const chunk: DiffChunk = {
      id: "chunk-0",
      index: 0,
      files,
      diffContent,
      tokenCount: totalTokens,
      isFirst: true,
      isLast: true,
      totalChunks: 1,
    };

    return {
      chunks: [chunk],
      needsChunking: false,
      totalTokens,
      totalFiles: files.length,
      stats: {
        avgTokensPerChunk: totalTokens,
        maxTokensInChunk: totalTokens,
        minTokensInChunk: totalTokens,
      },
    };
  }

  // ファイルをグループ化
  const fileGroups = groupFilesByTokenLimit(files, opts.maxTokensPerChunk);

  // 各グループをチャンクに変換
  const chunks: DiffChunk[] = fileGroups.map((group, index) => {
    const chunkDiff = group.map(reconstructDiff).join("\n\n");
    const tokenCount = countTokens(chunkDiff);

    return {
      id: `chunk-${index}`,
      index,
      files: group,
      diffContent: chunkDiff,
      tokenCount,
      isFirst: index === 0,
      isLast: index === fileGroups.length - 1,
      totalChunks: fileGroups.length,
    };
  });

  // 統計計算
  const tokenCounts = chunks.map((c) => c.tokenCount);
  const avgTokens = tokenCounts.reduce((a, b) => a + b, 0) / chunks.length;
  const maxTokens = Math.max(...tokenCounts);
  const minTokens = Math.min(...tokenCounts);

  console.log(
    `[Chunking] Split ${files.length} files into ${chunks.length} chunks ` +
    `(avg: ${Math.round(avgTokens)} tokens, max: ${maxTokens}, min: ${minTokens})`
  );

  return {
    chunks,
    needsChunking: true,
    totalTokens,
    totalFiles: files.length,
    stats: {
      avgTokensPerChunk: avgTokens,
      maxTokensInChunk: maxTokens,
      minTokensInChunk: minTokens,
    },
  };
}

// ========================================
// 並列処理ユーティリティ
// ========================================

/**
 * チャンクを並列処理（同時実行数制限付き）
 */
export async function processChunksInParallel<T>(
  chunks: DiffChunk[],
  processor: (chunk: DiffChunk) => Promise<T>,
  maxParallel: number = DEFAULT_CHUNK_CONFIG.parallelChunks
): Promise<Array<{ chunk: DiffChunk; result: T; error?: Error }>> {
  const results: Array<{ chunk: DiffChunk; result: T; error?: Error }> = [];

  // チャンクをバッチに分割
  for (let i = 0; i < chunks.length; i += maxParallel) {
    const batch = chunks.slice(i, i + maxParallel);

    console.log(
      `[Chunking] Processing batch ${Math.floor(i / maxParallel) + 1}/${Math.ceil(chunks.length / maxParallel)} ` +
      `(${batch.length} chunks)`
    );

    // バッチ内は並列処理
    const batchResults = await Promise.allSettled(
      batch.map(async (chunk) => {
        const result = await processor(chunk);
        return { chunk, result };
      })
    );

    // 結果を収集
    for (let j = 0; j < batchResults.length; j++) {
      const batchResult = batchResults[j];
      const chunk = batch[j];

      if (batchResult.status === "fulfilled") {
        results.push(batchResult.value as { chunk: DiffChunk; result: T });
      } else {
        console.error(`[Chunking] Chunk ${chunk.id} failed:`, batchResult.reason);
        results.push({
          chunk,
          result: null as unknown as T,
          error: batchResult.reason as Error,
        });
      }
    }
  }

  return results;
}

// ========================================
// チャンクコンテキスト生成
// ========================================

/**
 * チャンク用のコンテキスト情報を生成
 * 他のチャンクで処理されるファイルの情報を含める
 */
export function buildChunkContext(
  chunk: DiffChunk,
  allChunks: DiffChunk[]
): string {
  if (allChunks.length <= 1) {
    return "";
  }

  const otherChunks = allChunks.filter((c) => c.id !== chunk.id);
  const otherFiles = otherChunks.flatMap((c) =>
    c.files.map((f) => `- ${f.newPath} (${f.type}: +${f.additions}/-${f.deletions})`)
  );

  return `
## チャンク情報

このレビューは大規模なPRの一部（${chunk.index + 1}/${chunk.totalChunks}）です。

### 他のチャンクで処理されるファイル
${otherFiles.join("\n")}

### 注意
- 他のチャンクで処理されるファイルとの関連性を考慮してください
- 重複したコメントは避けてください
`;
}

// ========================================
// ユーティリティ
// ========================================

/**
 * チャンキング設定を環境変数から取得
 */
export function getChunkConfigFromEnv(): ChunkConfig {
  return {
    maxTokensPerChunk: parseInt(process.env.AI_MAX_TOKENS_PER_CHUNK || "50000", 10),
    overlapTokens: parseInt(process.env.AI_CHUNK_OVERLAP_TOKENS || "500", 10),
    parallelChunks: parseInt(process.env.AI_PARALLEL_CHUNKS || "3", 10),
    minFilesForChunking: parseInt(process.env.AI_MIN_FILES_FOR_CHUNKING || "3", 10),
  };
}

/**
 * チャンキングが有効かどうかを確認
 */
export function isChunkingEnabled(): boolean {
  return process.env.AI_CHUNKING_ENABLED !== "false";
}

/**
 * チャンキング結果のサマリーを生成
 */
export function formatChunkingSummary(result: ChunkingResult): string {
  if (!result.needsChunking) {
    return `Chunking: Not needed (${result.totalTokens} tokens, ${result.totalFiles} files)`;
  }

  return `Chunking: ${result.chunks.length} chunks, ` +
    `${result.totalFiles} files, ` +
    `avg ${Math.round(result.stats.avgTokensPerChunk)} tokens/chunk`;
}
