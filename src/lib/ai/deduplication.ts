/**
 * Deduplication Module
 *
 * AIレビューコメントの重複検出・マージ・フィルタリング
 * pr-agentの重複除去戦略を参考に実装
 */

import type { InlineComment } from "./schemas";
import { SEVERITY_ORDER } from "./constants";

// ========================================
// 設定
// ========================================

export interface DeduplicationConfig {
  // テキスト類似度閾値（0.0-1.0）
  similarityThreshold: number;
  // 行範囲オーバーラップを考慮
  considerLineOverlap: boolean;
  // 同一ファイル内の近接コメントを考慮
  considerProximity: boolean;
  // 近接判定の行数閾値
  proximityLines: number;
  // 高関連性スコアを優先
  preserveHighestRelevance: boolean;
  // 高深刻度を優先
  preserveHighestSeverity: boolean;
  // 重複コメントをマージするか（falseの場合は削除）
  mergeInsteadOfDelete: boolean;
}

export const DEFAULT_DEDUP_CONFIG: DeduplicationConfig = {
  similarityThreshold: parseFloat(
    process.env.AI_DEDUP_SIMILARITY_THRESHOLD || "0.8"
  ),
  considerLineOverlap: true,
  considerProximity: true,
  proximityLines: parseInt(process.env.AI_DEDUP_PROXIMITY_LINES || "5", 10),
  preserveHighestRelevance: true,
  preserveHighestSeverity: true,
  mergeInsteadOfDelete: false,
};

// ========================================
// 型定義
// ========================================

export interface DuplicateGroup {
  // 保持するコメント
  kept: InlineComment;
  // 重複として除去されたコメント
  removed: InlineComment[];
  // 重複の理由
  reason: DuplicateReason;
  // 類似度スコア
  similarity: number;
}

export type DuplicateReason =
  | "text_similarity" // テキストが類似
  | "line_overlap" // 行範囲がオーバーラップ
  | "proximity" // 同一ファイル内で近接
  | "exact_match" // 完全一致
  | "semantic_duplicate"; // 意味的に重複

export interface DeduplicationResult {
  // 重複除去後のコメント
  comments: InlineComment[];
  // 重複グループ
  duplicateGroups: DuplicateGroup[];
  // 統計
  stats: {
    originalCount: number;
    finalCount: number;
    duplicatesRemoved: number;
    byReason: Record<DuplicateReason, number>;
  };
}

export interface SimilarityMatch {
  index1: number;
  index2: number;
  similarity: number;
  reason: DuplicateReason;
  isLineOverlap: boolean;
}

// ========================================
// 類似度計算
// ========================================

// トークンキャッシュ（同一テキストの再トークン化を防止）
const tokenCache = new Map<string, Set<string>>();
const TOKEN_CACHE_MAX_SIZE = 100;

/**
 * キャッシュ付きトークン化
 */
function getCachedTokens(text: string): Set<string> {
  const cached = tokenCache.get(text);
  if (cached) return cached;

  const tokens = tokenizeText(text);

  // キャッシュサイズ制限
  if (tokenCache.size >= TOKEN_CACHE_MAX_SIZE) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }

  tokenCache.set(text, tokens);
  return tokens;
}

/**
 * 2つの文字列のJaccard類似度を計算（単語単位）
 */
export function calculateJaccardSimilarity(
  text1: string,
  text2: string
): number {
  const words1 = getCachedTokens(text1);
  const words2 = getCachedTokens(text2);

  if (words1.size === 0 && words2.size === 0) {
    return 1.0;
  }

  if (words1.size === 0 || words2.size === 0) {
    return 0.0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * テキストをトークン化（正規化済み単語セット）
 */
function tokenizeText(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // コードブロックを除去
      .replace(/```[\s\S]*?```/g, "")
      // マークダウンシンタックスを除去
      .replace(/[#*_~`]/g, "")
      // 単語に分割
      .split(/\s+/)
      // 短すぎる単語を除外
      .filter((w) => w.length > 2)
      // ストップワードを除外
      .filter((w) => !STOP_WORDS.has(w))
  );
}

// 一般的なストップワード
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "and",
  "or",
  "but",
  "if",
  "then",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "into",
  "です",
  "ます",
  "した",
  "する",
  "ある",
  "いる",
  "この",
  "その",
  "これ",
  "それ",
  "という",
  "として",
  "ため",
  "こと",
  "もの",
  "よう",
  "など",
  "ください",
]);

/**
 * コサイン類似度を計算（TF-IDF風）
 */
export function calculateCosineSimilarity(
  text1: string,
  text2: string
): number {
  const words1 = getCachedTokens(text1);
  const words2 = getCachedTokens(text2);

  if (words1.size === 0 || words2.size === 0) {
    return 0.0;
  }

  // 共通単語のカウント
  const commonWords = [...words1].filter((w) => words2.has(w));

  // コサイン類似度の簡易計算
  const dotProduct = commonWords.length;
  const magnitude = Math.sqrt(words1.size) * Math.sqrt(words2.size);

  return dotProduct / magnitude;
}

/**
 * 編集距離に基づく類似度（レーベンシュタイン距離）
 */
export function calculateEditDistanceSimilarity(
  text1: string,
  text2: string
): number {
  const s1 = text1.toLowerCase().trim();
  const s2 = text2.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // 長いテキストの場合は簡易計算
  if (s1.length > 500 || s2.length > 500) {
    return calculateJaccardSimilarity(text1, text2);
  }

  const matrix: number[][] = [];

  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * 複合類似度を計算（複数の手法を組み合わせ）
 */
export function calculateCombinedSimilarity(
  text1: string,
  text2: string
): number {
  const jaccard = calculateJaccardSimilarity(text1, text2);
  const cosine = calculateCosineSimilarity(text1, text2);

  // 重み付け平均（Jaccardを重視）
  return jaccard * 0.6 + cosine * 0.4;
}

// ========================================
// 行範囲チェック
// ========================================

/**
 * 2つのコメントの行範囲がオーバーラップするか判定
 */
export function hasLineOverlap(
  comment1: InlineComment,
  comment2: InlineComment
): boolean {
  if (comment1.path !== comment2.path) {
    return false;
  }

  const start1 = comment1.startLine ?? comment1.endLine;
  const end1 = comment1.endLine;
  const start2 = comment2.startLine ?? comment2.endLine;
  const end2 = comment2.endLine;

  return start1 <= end2 && start2 <= end1;
}

/**
 * 2つのコメントが近接しているか判定
 */
export function isProximate(
  comment1: InlineComment,
  comment2: InlineComment,
  proximityLines: number
): boolean {
  if (comment1.path !== comment2.path) {
    return false;
  }

  const end1 = comment1.endLine;
  const end2 = comment2.endLine;

  return Math.abs(end1 - end2) <= proximityLines;
}

// ========================================
// 重複検出
// ========================================

/**
 * 2つのコメントが重複しているか判定
 */
export function isDuplicate(
  comment1: InlineComment,
  comment2: InlineComment,
  config: DeduplicationConfig
): { isDuplicate: boolean; reason: DuplicateReason; similarity: number } {
  // 異なるファイルは重複なし
  if (comment1.path !== comment2.path) {
    return { isDuplicate: false, reason: "text_similarity", similarity: 0 };
  }

  // 完全一致チェック
  if (comment1.body.trim() === comment2.body.trim()) {
    return { isDuplicate: true, reason: "exact_match", similarity: 1.0 };
  }

  // テキスト類似度チェック
  const similarity = calculateCombinedSimilarity(comment1.body, comment2.body);

  if (similarity >= config.similarityThreshold) {
    return { isDuplicate: true, reason: "text_similarity", similarity };
  }

  // 行範囲オーバーラップチェック
  if (config.considerLineOverlap && hasLineOverlap(comment1, comment2)) {
    // オーバーラップしている場合、より低い閾値を使用
    if (similarity >= config.similarityThreshold * 0.7) {
      return { isDuplicate: true, reason: "line_overlap", similarity };
    }
  }

  // 近接チェック
  if (
    config.considerProximity &&
    isProximate(comment1, comment2, config.proximityLines)
  ) {
    // 近接している場合、意味的重複をチェック
    if (similarity >= config.similarityThreshold * 0.75) {
      return { isDuplicate: true, reason: "proximity", similarity };
    }
  }

  return { isDuplicate: false, reason: "text_similarity", similarity };
}

/**
 * 全てのコメントペアの類似度マッチを検出
 * 最適化: 同一ファイル内のコメントのみを比較（O(n²)からO(Σm²)へ、mはファイル内コメント数）
 */
export function findAllSimilarityMatches(
  comments: InlineComment[],
  config: DeduplicationConfig
): SimilarityMatch[] {
  const matches: SimilarityMatch[] = [];

  // ファイル別にコメントをグループ化
  const byFile = new Map<string, Array<{ index: number; comment: InlineComment }>>();
  for (let i = 0; i < comments.length; i++) {
    const path = comments[i].path;
    if (!byFile.has(path)) {
      byFile.set(path, []);
    }
    byFile.get(path)!.push({ index: i, comment: comments[i] });
  }

  // 各ファイル内でのみ比較
  for (const fileComments of byFile.values()) {
    for (let i = 0; i < fileComments.length; i++) {
      for (let j = i + 1; j < fileComments.length; j++) {
        const c1 = fileComments[i];
        const c2 = fileComments[j];
        const result = isDuplicate(c1.comment, c2.comment, config);

        if (result.isDuplicate) {
          matches.push({
            index1: c1.index,
            index2: c2.index,
            similarity: result.similarity,
            reason: result.reason,
            isLineOverlap: hasLineOverlap(c1.comment, c2.comment),
          });
        }
      }
    }
  }

  // 類似度の高い順にソート
  return matches.sort((a, b) => b.similarity - a.similarity);
}

// ========================================
// コメント優先度
// ========================================

/**
 * 2つのコメントを比較し、保持すべきものを決定
 */
export function selectBetterComment(
  comment1: InlineComment,
  comment2: InlineComment,
  config: DeduplicationConfig
): { kept: InlineComment; removed: InlineComment } {
  // 関連性スコアで比較
  if (config.preserveHighestRelevance) {
    const score1 = comment1.relevanceScore ?? 5;
    const score2 = comment2.relevanceScore ?? 5;

    if (score1 !== score2) {
      return score1 > score2
        ? { kept: comment1, removed: comment2 }
        : { kept: comment2, removed: comment1 };
    }
  }

  // 深刻度で比較
  if (config.preserveHighestSeverity) {
    const sev1 = SEVERITY_ORDER[comment1.severity] ?? 0;
    const sev2 = SEVERITY_ORDER[comment2.severity] ?? 0;

    if (sev1 !== sev2) {
      return sev1 > sev2
        ? { kept: comment1, removed: comment2 }
        : { kept: comment2, removed: comment1 };
    }
  }

  // より詳細な（長い）コメントを優先
  if (comment1.body.length !== comment2.body.length) {
    return comment1.body.length > comment2.body.length
      ? { kept: comment1, removed: comment2 }
      : { kept: comment2, removed: comment1 };
  }

  // 修正提案があるものを優先
  if (comment1.suggestion && !comment2.suggestion) {
    return { kept: comment1, removed: comment2 };
  }
  if (!comment1.suggestion && comment2.suggestion) {
    return { kept: comment2, removed: comment1 };
  }

  // デフォルトは最初のコメントを保持
  return { kept: comment1, removed: comment2 };
}

// ========================================
// コメントマージ
// ========================================

/**
 * 2つのコメントをマージ
 */
export function mergeComments(
  comment1: InlineComment,
  comment2: InlineComment
): InlineComment {
  const { kept, removed } = selectBetterComment(
    comment1,
    comment2,
    DEFAULT_DEDUP_CONFIG
  );

  // 行範囲を拡張
  const startLine = Math.min(
    kept.startLine ?? kept.endLine,
    removed.startLine ?? removed.endLine
  );
  const endLine = Math.max(kept.endLine, removed.endLine);

  // マージしたコメントを作成
  const merged: InlineComment = {
    ...kept,
    startLine: startLine !== endLine ? startLine : null,
    endLine,
  };

  // 両方のボディに重要な情報がある場合は結合
  if (
    removed.body.length > 50 &&
    !kept.body.includes(removed.body.slice(0, 30))
  ) {
    merged.body = `${kept.body}\n\n---\n\n**追加の指摘:** ${removed.body}`;
  }

  // 修正提案をマージ
  if (!merged.suggestion && removed.suggestion) {
    merged.suggestion = removed.suggestion;
    merged.suggestionStartLine = removed.suggestionStartLine;
    merged.suggestionEndLine = removed.suggestionEndLine;
  }

  return merged;
}

// ========================================
// メイン重複除去関数
// ========================================

/**
 * コメントリストから重複を除去
 */
export function deduplicateComments(
  comments: InlineComment[],
  config: Partial<DeduplicationConfig> = {}
): DeduplicationResult {
  const opts: DeduplicationConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };

  if (comments.length <= 1) {
    return {
      comments,
      duplicateGroups: [],
      stats: {
        originalCount: comments.length,
        finalCount: comments.length,
        duplicatesRemoved: 0,
        byReason: {
          text_similarity: 0,
          line_overlap: 0,
          proximity: 0,
          exact_match: 0,
          semantic_duplicate: 0,
        },
      },
    };
  }

  // 重複マッチを検出
  const matches = findAllSimilarityMatches(comments, opts);

  // 除去済みインデックスを追跡
  const removed = new Set<number>();
  const duplicateGroups: DuplicateGroup[] = [];
  const reasonCounts: Record<DuplicateReason, number> = {
    text_similarity: 0,
    line_overlap: 0,
    proximity: 0,
    exact_match: 0,
    semantic_duplicate: 0,
  };

  // マージ用のコメントコピー
  const processedComments = [...comments];

  // 類似度の高い順に処理
  for (const match of matches) {
    if (removed.has(match.index1) || removed.has(match.index2)) {
      continue;
    }

    const comment1 = processedComments[match.index1];
    const comment2 = processedComments[match.index2];

    if (opts.mergeInsteadOfDelete) {
      // マージモード
      const merged = mergeComments(comment1, comment2);
      processedComments[match.index1] = merged;
      removed.add(match.index2);

      duplicateGroups.push({
        kept: merged,
        removed: [comment2],
        reason: match.reason,
        similarity: match.similarity,
      });
    } else {
      // 削除モード
      const { kept, removed: removedComment } = selectBetterComment(
        comment1,
        comment2,
        opts
      );
      const removedIndex =
        removedComment === comment1 ? match.index1 : match.index2;

      removed.add(removedIndex);

      // 既存のグループに追加するか新規作成
      const existingGroup = duplicateGroups.find((g) => g.kept === kept);
      if (existingGroup) {
        existingGroup.removed.push(removedComment);
      } else {
        duplicateGroups.push({
          kept,
          removed: [removedComment],
          reason: match.reason,
          similarity: match.similarity,
        });
      }
    }

    reasonCounts[match.reason]++;
  }

  // 結果を構築
  const resultComments = processedComments.filter(
    (_, idx) => !removed.has(idx)
  );

  // 深刻度と関連性スコアでソート
  resultComments.sort((a, b) => {
    const sevDiff =
      (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
    if (sevDiff !== 0) return sevDiff;

    const scoreDiff = (b.relevanceScore ?? 5) - (a.relevanceScore ?? 5);
    if (scoreDiff !== 0) return scoreDiff;

    const pathDiff = a.path.localeCompare(b.path);
    if (pathDiff !== 0) return pathDiff;

    return a.endLine - b.endLine;
  });

  const duplicatesRemoved = comments.length - resultComments.length;

  if (duplicatesRemoved > 0) {
    console.log(
      `[Deduplication] Removed ${duplicatesRemoved} duplicate comments ` +
        `(${reasonCounts.exact_match} exact, ${reasonCounts.text_similarity} similar, ` +
        `${reasonCounts.line_overlap} overlap, ${reasonCounts.proximity} proximity)`
    );
  }

  return {
    comments: resultComments,
    duplicateGroups,
    stats: {
      originalCount: comments.length,
      finalCount: resultComments.length,
      duplicatesRemoved,
      byReason: reasonCounts,
    },
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * 重複除去が有効かどうかを確認
 */
export function isDeduplicationEnabled(): boolean {
  return process.env.AI_DEDUPLICATION_ENABLED !== "false";
}

/**
 * 重複除去設定を環境変数から取得
 */
export function getDeduplicationConfigFromEnv(): DeduplicationConfig {
  return {
    similarityThreshold: parseFloat(
      process.env.AI_DEDUP_SIMILARITY_THRESHOLD || "0.8"
    ),
    considerLineOverlap: process.env.AI_DEDUP_LINE_OVERLAP !== "false",
    considerProximity: process.env.AI_DEDUP_PROXIMITY !== "false",
    proximityLines: parseInt(process.env.AI_DEDUP_PROXIMITY_LINES || "5", 10),
    preserveHighestRelevance: true,
    preserveHighestSeverity: true,
    mergeInsteadOfDelete: process.env.AI_DEDUP_MERGE === "true",
  };
}

/**
 * 重複除去結果のサマリーを生成
 */
export function formatDeduplicationSummary(
  result: DeduplicationResult
): string {
  const { stats } = result;

  if (stats.duplicatesRemoved === 0) {
    return "重複なし";
  }

  const reasons: string[] = [];
  if (stats.byReason.exact_match > 0) {
    reasons.push(`完全一致: ${stats.byReason.exact_match}`);
  }
  if (stats.byReason.text_similarity > 0) {
    reasons.push(`類似テキスト: ${stats.byReason.text_similarity}`);
  }
  if (stats.byReason.line_overlap > 0) {
    reasons.push(`行オーバーラップ: ${stats.byReason.line_overlap}`);
  }
  if (stats.byReason.proximity > 0) {
    reasons.push(`近接: ${stats.byReason.proximity}`);
  }

  return `${stats.originalCount} → ${stats.finalCount} コメント（${
    stats.duplicatesRemoved
  }件除去: ${reasons.join(", ")}）`;
}

/**
 * 重複グループの詳細レポートを生成
 */
export function generateDuplicateReport(result: DeduplicationResult): string {
  if (result.duplicateGroups.length === 0) {
    return "重複グループなし";
  }

  let report = `## 重複検出レポート\n\n`;
  report += `- 元のコメント数: ${result.stats.originalCount}\n`;
  report += `- 最終コメント数: ${result.stats.finalCount}\n`;
  report += `- 除去された重複: ${result.stats.duplicatesRemoved}\n\n`;

  report += `### 重複グループ\n\n`;

  for (let i = 0; i < result.duplicateGroups.length; i++) {
    const group = result.duplicateGroups[i];
    report += `#### グループ ${i + 1} (${group.reason}, 類似度: ${(
      group.similarity * 100
    ).toFixed(1)}%)\n\n`;
    report += `**保持:** ${group.kept.path}:${
      group.kept.endLine
    } - ${group.kept.body.slice(0, 100)}...\n\n`;
    report += `**除去:**\n`;
    for (const removed of group.removed) {
      report += `- ${removed.path}:${removed.endLine} - ${removed.body.slice(
        0,
        100
      )}...\n`;
    }
    report += `\n`;
  }

  return report;
}
