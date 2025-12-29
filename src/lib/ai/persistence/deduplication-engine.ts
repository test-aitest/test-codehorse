/**
 * Phase 1: Deduplication Engine
 *
 * クロスレビュー重複排除エンジン
 * 複数のコメントから重複を検出し、オリジナルのみを返す
 */

import { prisma } from "@/lib/prisma";
import {
  generateFingerprint,
  calculateSimilarity,
} from "./comment-fingerprint";
import { findSimilarFingerprint } from "./comment-history-store";
import type {
  DeduplicationInput,
  DeduplicationResult,
  DeduplicationComment,
  DuplicateInfo,
  DuplicateReason,
  DeduplicationStats,
  FingerprintResult,
} from "./types";

// ========================================
// 重複検出
// ========================================

/**
 * コメント間の重複を検出する
 *
 * @param comments コメントリスト
 * @param threshold 類似度閾値
 * @returns 重複ペアのリスト
 */
function detectDuplicatesWithinBatch(
  comments: DeduplicationComment[],
  fingerprints: Map<string, FingerprintResult>,
  threshold: number
): Map<string, { duplicateOfTempId: string; score: number }> {
  const duplicates = new Map<
    string,
    { duplicateOfTempId: string; score: number }
  >();

  // すべてのペアをチェック
  for (let i = 0; i < comments.length; i++) {
    const comment1 = comments[i];
    const fp1 = fingerprints.get(comment1.tempId);

    if (!fp1 || duplicates.has(comment1.tempId)) {
      continue;
    }

    for (let j = i + 1; j < comments.length; j++) {
      const comment2 = comments[j];
      const fp2 = fingerprints.get(comment2.tempId);

      if (!fp2 || duplicates.has(comment2.tempId)) {
        continue;
      }

      const similarity = calculateSimilarity(fp1, fp2);

      if (similarity >= threshold) {
        // comment2をcomment1の重複としてマーク
        duplicates.set(comment2.tempId, {
          duplicateOfTempId: comment1.tempId,
          score: similarity,
        });
      }
    }
  }

  return duplicates;
}

/**
 * 履歴との重複を検出する
 *
 * @param repositoryId リポジトリID
 * @param comments コメントリスト
 * @param fingerprints フィンガープリントマップ
 * @param threshold 類似度閾値
 * @param includeResolved 解決済みを含めるか
 * @param includeAcknowledged 認識済みを含めるか
 * @returns 履歴との重複情報
 */
async function detectDuplicatesWithHistory(
  repositoryId: string,
  comments: DeduplicationComment[],
  fingerprints: Map<string, FingerprintResult>,
  threshold: number,
  includeResolved: boolean,
  includeAcknowledged: boolean
): Promise<Map<string, DuplicateInfo>> {
  const duplicates = new Map<string, DuplicateInfo>();

  // 並列で履歴との類似性をチェック
  const checks = comments.map(async (comment) => {
    const similarFp = await findSimilarFingerprint(
      repositoryId,
      comment.body,
      threshold
    );

    if (!similarFp) {
      return null;
    }

    // 解決済みの場合
    if (similarFp.isResolved && !includeResolved) {
      return {
        tempId: comment.tempId,
        duplicateOfFingerprintId: similarFp.fingerprintId,
        similarityScore: similarFp.score,
        reason: "RESOLVED_ISSUE" as DuplicateReason,
      };
    }

    // 認識済みの場合
    if (similarFp.isAcknowledged && !includeAcknowledged) {
      return {
        tempId: comment.tempId,
        duplicateOfFingerprintId: similarFp.fingerprintId,
        similarityScore: similarFp.score,
        reason: "ACKNOWLEDGED" as DuplicateReason,
      };
    }

    // 最近報告された場合（24時間以内）
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    if (similarFp.lastSeenAt > oneDayAgo) {
      return {
        tempId: comment.tempId,
        duplicateOfFingerprintId: similarFp.fingerprintId,
        similarityScore: similarFp.score,
        reason: "RECENTLY_REPORTED" as DuplicateReason,
      };
    }

    // 完全一致
    if (similarFp.score >= 0.99) {
      return {
        tempId: comment.tempId,
        duplicateOfFingerprintId: similarFp.fingerprintId,
        similarityScore: similarFp.score,
        reason: "EXACT_MATCH" as DuplicateReason,
      };
    }

    // 同じパターン
    const fp = fingerprints.get(comment.tempId);
    if (fp) {
      // 履歴のフィンガープリントを取得
      const historyFp = await prisma.commentFingerprint.findUnique({
        where: { id: similarFp.fingerprintId },
      });

      if (historyFp && historyFp.patternType === fp.patternType) {
        return {
          tempId: comment.tempId,
          duplicateOfFingerprintId: similarFp.fingerprintId,
          similarityScore: similarFp.score,
          reason: "SAME_PATTERN" as DuplicateReason,
        };
      }
    }

    // 高い類似度
    return {
      tempId: comment.tempId,
      duplicateOfFingerprintId: similarFp.fingerprintId,
      similarityScore: similarFp.score,
      reason: "HIGH_SIMILARITY" as DuplicateReason,
    };
  });

  const results = await Promise.all(checks);

  for (const result of results) {
    if (result) {
      duplicates.set(result.tempId, {
        tempId: result.tempId,
        duplicateOfFingerprintId: result.duplicateOfFingerprintId,
        similarityScore: result.similarityScore,
        reason: result.reason,
      });
    }
  }

  return duplicates;
}

// ========================================
// メイン関数
// ========================================

/**
 * コメントの重複排除を実行する
 *
 * @param input 重複排除の入力
 * @returns 重複排除の結果
 */
export async function deduplicateComments(
  input: DeduplicationInput
): Promise<DeduplicationResult> {
  const threshold = input.similarityThreshold || 0.85;
  const includeResolved = input.includeResolved ?? false;
  const includeAcknowledged = input.includeAcknowledged ?? false;

  // 1. すべてのコメントのフィンガープリントを生成
  const fingerprints = new Map<string, FingerprintResult>();
  for (const comment of input.comments) {
    const fp = generateFingerprint({
      body: comment.body,
      category: comment.category,
      severity: comment.severity,
    });
    fingerprints.set(comment.tempId, fp);
  }

  // 2. バッチ内の重複を検出
  const batchDuplicates = detectDuplicatesWithinBatch(
    input.comments,
    fingerprints,
    threshold
  );

  // 3. 履歴との重複を検出（バッチ内で重複していないものだけ）
  const nonBatchDuplicates = input.comments.filter(
    (c) => !batchDuplicates.has(c.tempId)
  );

  const historyDuplicates = await detectDuplicatesWithHistory(
    input.repositoryId,
    nonBatchDuplicates,
    fingerprints,
    threshold,
    includeResolved,
    includeAcknowledged
  );

  // 4. 結果を集計
  const duplicates: DuplicateInfo[] = [];
  const originalComments: DeduplicationComment[] = [];

  // バッチ内重複を追加
  for (const [tempId, info] of batchDuplicates) {
    const originalTempId = info.duplicateOfTempId;
    const originalFp = fingerprints.get(originalTempId);

    duplicates.push({
      tempId,
      // バッチ内重複の場合、fingerprintIdはまだない
      duplicateOfFingerprintId: originalFp?.hash || "batch-duplicate",
      similarityScore: info.score,
      reason: info.score >= 0.99 ? "EXACT_MATCH" : "HIGH_SIMILARITY",
    });
  }

  // 履歴重複を追加
  for (const info of historyDuplicates.values()) {
    duplicates.push(info);
  }

  // オリジナルコメントを特定
  for (const comment of input.comments) {
    if (
      !batchDuplicates.has(comment.tempId) &&
      !historyDuplicates.has(comment.tempId)
    ) {
      originalComments.push(comment);
    }
  }

  // 5. 統計を計算
  const stats = calculateStats(input.comments.length, duplicates);

  return {
    originalComments,
    duplicates,
    stats,
  };
}

/**
 * 統計を計算する
 */
function calculateStats(
  totalInput: number,
  duplicates: DuplicateInfo[]
): DeduplicationStats {
  const byReason: Record<DuplicateReason, number> = {
    EXACT_MATCH: 0,
    HIGH_SIMILARITY: 0,
    SAME_PATTERN: 0,
    ACKNOWLEDGED: 0,
    RECENTLY_REPORTED: 0,
    RESOLVED_ISSUE: 0,
  };

  for (const dup of duplicates) {
    byReason[dup.reason]++;
  }

  return {
    totalInput,
    originalCount: totalInput - duplicates.length,
    duplicateCount: duplicates.length,
    duplicateRate:
      totalInput > 0 ? duplicates.length / totalInput : 0,
    byReason,
  };
}

// ========================================
// ユーティリティ
// ========================================

/**
 * 重複排除の結果をサマリとして整形する
 */
export function formatDeduplicationSummary(
  result: DeduplicationResult
): string {
  const { stats } = result;

  const lines = [
    `重複排除結果:`,
    `  入力: ${stats.totalInput}件`,
    `  オリジナル: ${stats.originalCount}件`,
    `  重複: ${stats.duplicateCount}件 (${(stats.duplicateRate * 100).toFixed(1)}%)`,
  ];

  if (stats.duplicateCount > 0) {
    lines.push(`  内訳:`);

    if (stats.byReason.EXACT_MATCH > 0) {
      lines.push(`    - 完全一致: ${stats.byReason.EXACT_MATCH}件`);
    }
    if (stats.byReason.HIGH_SIMILARITY > 0) {
      lines.push(`    - 高類似度: ${stats.byReason.HIGH_SIMILARITY}件`);
    }
    if (stats.byReason.SAME_PATTERN > 0) {
      lines.push(`    - 同パターン: ${stats.byReason.SAME_PATTERN}件`);
    }
    if (stats.byReason.ACKNOWLEDGED > 0) {
      lines.push(`    - 認識済み: ${stats.byReason.ACKNOWLEDGED}件`);
    }
    if (stats.byReason.RECENTLY_REPORTED > 0) {
      lines.push(`    - 最近報告: ${stats.byReason.RECENTLY_REPORTED}件`);
    }
    if (stats.byReason.RESOLVED_ISSUE > 0) {
      lines.push(`    - 解決済み: ${stats.byReason.RESOLVED_ISSUE}件`);
    }
  }

  return lines.join("\n");
}

/**
 * 単一のコメントが重複かどうかをチェックする
 *
 * @param repositoryId リポジトリID
 * @param body コメント本文
 * @param threshold 類似度閾値
 * @returns 重複の場合はtrue
 */
export async function isDuplicate(
  repositoryId: string,
  body: string,
  threshold: number = 0.85
): Promise<boolean> {
  const similarFp = await findSimilarFingerprint(repositoryId, body, threshold);
  return similarFp !== null;
}

/**
 * 重複コメントの詳細情報を取得する
 *
 * @param repositoryId リポジトリID
 * @param body コメント本文
 * @param threshold 類似度閾値
 * @returns 重複情報（重複でない場合はnull）
 */
export async function getDuplicateInfo(
  repositoryId: string,
  body: string,
  threshold: number = 0.85
): Promise<DuplicateInfo | null> {
  const similarFp = await findSimilarFingerprint(repositoryId, body, threshold);

  if (!similarFp) {
    return null;
  }

  let reason: DuplicateReason;

  if (similarFp.score >= 0.99) {
    reason = "EXACT_MATCH";
  } else if (similarFp.isAcknowledged) {
    reason = "ACKNOWLEDGED";
  } else if (similarFp.isResolved) {
    reason = "RESOLVED_ISSUE";
  } else {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    if (similarFp.lastSeenAt > oneDayAgo) {
      reason = "RECENTLY_REPORTED";
    } else {
      reason = "HIGH_SIMILARITY";
    }
  }

  return {
    tempId: "", // 単一チェック時は空
    duplicateOfFingerprintId: similarFp.fingerprintId,
    similarityScore: similarFp.score,
    reason,
  };
}
