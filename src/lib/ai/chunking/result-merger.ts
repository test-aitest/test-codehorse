/**
 * Result Merger
 *
 * 複数チャンクのレビュー結果をマージし、重複を除去
 * pr-agentの結果統合戦略を参考に実装
 */

import type { ReviewResult, InlineComment } from "../schemas";
import type { DiffChunk } from "./chunk-processor";

// ========================================
// 型定義
// ========================================

export interface ChunkReviewResult {
  chunk: DiffChunk;
  result: ReviewResult;
  error?: Error;
}

export interface MergedReviewResult {
  summary: string;
  walkthrough: Array<{ path: string; summary: string; changeType: "add" | "modify" | "delete" | "rename" }>;
  comments: InlineComment[];
  diagram?: string;
  // マージ統計
  stats: {
    totalChunks: number;
    successfulChunks: number;
    failedChunks: number;
    originalCommentCount: number;
    mergedCommentCount: number;
    duplicatesRemoved: number;
  };
}

// ========================================
// 重複検出設定
// ========================================

export interface DeduplicationConfig {
  // テキスト類似度閾値（0.0-1.0）
  similarityThreshold: number;
  // 行範囲オーバーラップを考慮
  considerLineOverlap: boolean;
  // 高関連性スコアを優先
  preserveHighestRelevance: boolean;
}

export const DEFAULT_DEDUP_CONFIG: DeduplicationConfig = {
  similarityThreshold: 0.8,
  considerLineOverlap: true,
  preserveHighestRelevance: true,
};

// ========================================
// 類似度計算
// ========================================

/**
 * 2つの文字列のJaccard類似度を計算
 * 単語単位で比較
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 && words2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * 2つのコメントの行範囲がオーバーラップするか判定
 */
function hasLineOverlap(comment1: InlineComment, comment2: InlineComment): boolean {
  if (comment1.path !== comment2.path) {
    return false;
  }

  const start1 = comment1.startLine ?? comment1.endLine;
  const end1 = comment1.endLine;
  const start2 = comment2.startLine ?? comment2.endLine;
  const end2 = comment2.endLine;

  // 範囲がオーバーラップするか
  return start1 <= end2 && start2 <= end1;
}

/**
 * 2つのコメントが重複しているか判定
 */
function isDuplicate(
  comment1: InlineComment,
  comment2: InlineComment,
  config: DeduplicationConfig
): boolean {
  // 同じファイルでない場合は重複なし
  if (comment1.path !== comment2.path) {
    return false;
  }

  // テキスト類似度チェック
  const textSimilarity = calculateTextSimilarity(comment1.body, comment2.body);
  if (textSimilarity >= config.similarityThreshold) {
    return true;
  }

  // 行範囲オーバーラップチェック（有効な場合）
  if (config.considerLineOverlap && hasLineOverlap(comment1, comment2)) {
    // オーバーラップしている場合、より低い類似度閾値を使用
    return textSimilarity >= config.similarityThreshold * 0.7;
  }

  return false;
}

// ========================================
// コメントマージ
// ========================================

/**
 * 重複コメントをマージ
 * 高関連性スコアを優先
 */
function mergeComments(
  comment1: InlineComment,
  comment2: InlineComment,
  preserveHighestRelevance: boolean
): InlineComment {
  // 関連性スコアで優先順位を決定
  const score1 = comment1.relevanceScore ?? 5;
  const score2 = comment2.relevanceScore ?? 5;

  if (preserveHighestRelevance && score1 !== score2) {
    return score1 >= score2 ? comment1 : comment2;
  }

  // 深刻度で優先順位を決定
  const severityOrder: Record<string, number> = {
    CRITICAL: 4,
    IMPORTANT: 3,
    INFO: 2,
    NITPICK: 1,
  };

  const sev1 = severityOrder[comment1.severity] ?? 0;
  const sev2 = severityOrder[comment2.severity] ?? 0;

  if (sev1 !== sev2) {
    return sev1 >= sev2 ? comment1 : comment2;
  }

  // より詳細な（長い）コメントを優先
  return comment1.body.length >= comment2.body.length ? comment1 : comment2;
}

/**
 * コメントリストから重複を除去
 */
export function deduplicateComments(
  comments: InlineComment[],
  config: Partial<DeduplicationConfig> = {}
): { comments: InlineComment[]; duplicatesRemoved: number } {
  const opts: DeduplicationConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };

  if (comments.length <= 1) {
    return { comments, duplicatesRemoved: 0 };
  }

  const result: InlineComment[] = [];
  const merged: Set<number> = new Set();

  for (let i = 0; i < comments.length; i++) {
    if (merged.has(i)) continue;

    let current = comments[i];

    // 後続のコメントとの重複をチェック
    for (let j = i + 1; j < comments.length; j++) {
      if (merged.has(j)) continue;

      if (isDuplicate(current, comments[j], opts)) {
        current = mergeComments(current, comments[j], opts.preserveHighestRelevance);
        merged.add(j);
      }
    }

    result.push(current);
  }

  return {
    comments: result,
    duplicatesRemoved: comments.length - result.length,
  };
}

// ========================================
// サマリーマージ
// ========================================

/**
 * 複数のサマリーを統合
 */
function mergeSummaries(summaries: string[]): string {
  if (summaries.length === 0) {
    return "レビュー結果がありません。";
  }

  if (summaries.length === 1) {
    return summaries[0];
  }

  // 重複する文を除去しながら統合
  const sentences = new Set<string>();
  const result: string[] = [];

  for (const summary of summaries) {
    // 段落で分割
    const paragraphs = summary.split(/\n\n+/);

    for (const para of paragraphs) {
      const normalized = para.trim().toLowerCase();
      if (normalized && !sentences.has(normalized)) {
        sentences.add(normalized);
        result.push(para.trim());
      }
    }
  }

  return result.join("\n\n");
}

type ChangeType = "add" | "modify" | "delete" | "rename";
type WalkthroughItem = { path: string; summary: string; changeType: ChangeType };

/**
 * 複数のwalkthroughを統合
 */
function mergeWalkthroughs(
  walkthroughs: Array<Array<WalkthroughItem>>
): Array<WalkthroughItem> {
  const pathMap = new Map<string, WalkthroughItem>();

  for (const walkthrough of walkthroughs) {
    for (const item of walkthrough) {
      // 同じパスは後のものが優先（より多くのコンテキストがある可能性）
      if (!pathMap.has(item.path)) {
        pathMap.set(item.path, item);
      } else {
        // サマリーがより詳細な場合は更新
        const existing = pathMap.get(item.path)!;
        if (item.summary.length > existing.summary.length) {
          pathMap.set(item.path, item);
        }
      }
    }
  }

  // パスでソートして返す
  return Array.from(pathMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 複数のダイアグラムを統合
 */
function mergeDiagrams(diagrams: (string | null | undefined)[]): string | undefined {
  const validDiagrams = diagrams.filter((d): d is string => !!d && d.trim().length > 0);

  if (validDiagrams.length === 0) {
    return undefined;
  }

  if (validDiagrams.length === 1) {
    return validDiagrams[0];
  }

  // 複数のダイアグラムがある場合は最も詳細なものを選択
  // （ノード数が最も多いもの）
  let bestDiagram = validDiagrams[0];
  let maxNodes = countMermaidNodes(bestDiagram);

  for (const diagram of validDiagrams.slice(1)) {
    const nodeCount = countMermaidNodes(diagram);
    if (nodeCount > maxNodes) {
      maxNodes = nodeCount;
      bestDiagram = diagram;
    }
  }

  return bestDiagram;
}

/**
 * Mermaidダイアグラムのノード数を概算
 */
function countMermaidNodes(diagram: string): number {
  // ノード定義のパターンにマッチする数をカウント
  const nodePatterns = [
    /\[[^\]]+\]/g,  // [node]
    /\([^)]+\)/g,   // (node)
    /\{[^}]+\}/g,   // {node}
  ];

  let count = 0;
  for (const pattern of nodePatterns) {
    const matches = diagram.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

// ========================================
// メインマージ関数
// ========================================

/**
 * 複数チャンクのレビュー結果をマージ
 */
export function mergeChunkResults(
  chunkResults: ChunkReviewResult[],
  dedupConfig: Partial<DeduplicationConfig> = {}
): MergedReviewResult {
  const successfulResults = chunkResults.filter((r) => !r.error && r.result);
  const failedChunks = chunkResults.filter((r) => r.error || !r.result);

  if (successfulResults.length === 0) {
    return {
      summary: "全てのチャンクの処理に失敗しました。",
      walkthrough: [],
      comments: [],
      stats: {
        totalChunks: chunkResults.length,
        successfulChunks: 0,
        failedChunks: failedChunks.length,
        originalCommentCount: 0,
        mergedCommentCount: 0,
        duplicatesRemoved: 0,
      },
    };
  }

  // サマリーをマージ
  const summaries = successfulResults.map((r) => r.result.summary);
  const mergedSummary = mergeSummaries(summaries);

  // Walkthroughをマージ
  const walkthroughs = successfulResults.map((r) => r.result.walkthrough);
  const mergedWalkthrough = mergeWalkthroughs(walkthroughs);

  // コメントを収集
  const allComments = successfulResults.flatMap((r) => r.result.comments);
  const originalCommentCount = allComments.length;

  // コメントの重複を除去
  const { comments: dedupedComments, duplicatesRemoved } = deduplicateComments(
    allComments,
    dedupConfig
  );

  // ダイアグラムをマージ
  const diagrams = successfulResults.map((r) => r.result.diagram);
  const mergedDiagram = mergeDiagrams(diagrams);

  // 結果を深刻度と関連性スコアでソート
  const sortedComments = dedupedComments.sort((a, b) => {
    const severityOrder: Record<string, number> = {
      CRITICAL: 4,
      IMPORTANT: 3,
      INFO: 2,
      NITPICK: 1,
    };

    const sevDiff = (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;

    const scoreDiff = (b.relevanceScore ?? 5) - (a.relevanceScore ?? 5);
    if (scoreDiff !== 0) return scoreDiff;

    // 同じ深刻度・スコアならパス→行番号でソート
    const pathDiff = a.path.localeCompare(b.path);
    if (pathDiff !== 0) return pathDiff;

    return a.endLine - b.endLine;
  });

  console.log(
    `[ResultMerger] Merged ${successfulResults.length} chunks: ` +
    `${originalCommentCount} → ${sortedComments.length} comments ` +
    `(${duplicatesRemoved} duplicates removed)`
  );

  return {
    summary: mergedSummary,
    walkthrough: mergedWalkthrough,
    comments: sortedComments,
    diagram: mergedDiagram,
    stats: {
      totalChunks: chunkResults.length,
      successfulChunks: successfulResults.length,
      failedChunks: failedChunks.length,
      originalCommentCount,
      mergedCommentCount: sortedComments.length,
      duplicatesRemoved,
    },
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * マージ結果のサマリーを生成
 */
export function formatMergeSummary(result: MergedReviewResult): string {
  const { stats } = result;

  let summary = `## チャンクマージ結果\n\n`;
  summary += `- 処理チャンク数: ${stats.successfulChunks}/${stats.totalChunks}\n`;

  if (stats.failedChunks > 0) {
    summary += `- 失敗チャンク数: ${stats.failedChunks}\n`;
  }

  summary += `- コメント数: ${stats.originalCommentCount} → ${stats.mergedCommentCount}\n`;

  if (stats.duplicatesRemoved > 0) {
    summary += `- 重複除去: ${stats.duplicatesRemoved}件\n`;
  }

  return summary;
}

/**
 * チャンク処理が必要かどうかの閾値チェック用
 */
export function shouldMergeResults(chunkCount: number): boolean {
  return chunkCount > 1;
}
