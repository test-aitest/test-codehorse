/**
 * Phase 1: Comment History Store
 *
 * リポジトリ/ユーザー別のコメント履歴管理モジュール
 * フィンガープリントの保存、更新、クエリを担当
 */

import { prisma } from "@/lib/prisma";
import {
  generateFingerprint,
  calculateSimilarity,
} from "./comment-fingerprint";
import {
  DEFAULT_PERSISTENCE_CONFIG,
  type CommentOccurrenceInput,
  type RecordedOccurrence,
  type CommentHistoryQuery,
  type CommentHistoryEntry,
  type CommentHistoryStats,
  type ResolutionInput,
  type UserActionInput,
  type SimilarityInfo,
  type ProgressiveSeverity,
  type CommentPersistenceConfig,
} from "./types";

// ========================================
// フィンガープリント操作
// ========================================

/**
 * 類似したフィンガープリントを検索する
 *
 * @param repositoryId リポジトリID
 * @param body コメント本文
 * @param threshold 類似度閾値
 * @returns 類似したフィンガープリントの情報（見つからない場合はnull）
 */
export async function findSimilarFingerprint(
  repositoryId: string,
  body: string,
  threshold: number = 0.85
): Promise<SimilarityInfo | null> {
  // 入力のフィンガープリントを生成
  const inputFp = generateFingerprint({ body });

  // 完全一致を最初に検索
  const exactMatch = await prisma.commentFingerprint.findFirst({
    where: {
      repositoryId,
      fingerprint: inputFp.hash,
    },
    include: {
      occurrences: {
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (exactMatch) {
    return {
      fingerprintId: exactMatch.id,
      score: 1.0,
      originalBody: exactMatch.occurrences[0]?.commentBody || "",
      occurrenceCount: exactMatch.occurrenceCount,
      lastSeenAt: exactMatch.lastSeenAt,
      isResolved: exactMatch.resolvedAt !== null,
      isAcknowledged: exactMatch.userAcknowledged,
    };
  }

  // 同じカテゴリのフィンガープリントを検索して類似度を計算
  const candidates = await prisma.commentFingerprint.findMany({
    where: {
      repositoryId,
      category: inputFp.category,
    },
    include: {
      occurrences: {
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
    take: 100, // 最大100件まで
  });

  let bestMatch: {
    fingerprint: (typeof candidates)[0];
    score: number;
  } | null = null;

  for (const candidate of candidates) {
    // 候補のフィンガープリント情報を再構築
    const candidateFp = generateFingerprint({
      body: candidate.occurrences[0]?.commentBody || "",
      category: candidate.category || undefined,
      patternType: candidate.patternType || undefined,
    });

    const score = calculateSimilarity(inputFp, candidateFp);

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { fingerprint: candidate, score };
    }
  }

  if (bestMatch) {
    return {
      fingerprintId: bestMatch.fingerprint.id,
      score: bestMatch.score,
      originalBody: bestMatch.fingerprint.occurrences[0]?.commentBody || "",
      occurrenceCount: bestMatch.fingerprint.occurrenceCount,
      lastSeenAt: bestMatch.fingerprint.lastSeenAt,
      isResolved: bestMatch.fingerprint.resolvedAt !== null,
      isAcknowledged: bestMatch.fingerprint.userAcknowledged,
    };
  }

  return null;
}

/**
 * コメントの発生を記録する
 *
 * @param input コメント発生の入力
 * @returns 記録された発生情報
 */
export async function recordCommentOccurrence(
  input: CommentOccurrenceInput
): Promise<RecordedOccurrence> {
  // フィンガープリントを生成
  const fp = generateFingerprint({
    body: input.commentBody,
    category: input.category,
    patternType: input.patternType,
    severity: input.severity,
  });

  // 既存のフィンガープリントを検索
  const existingFp = await prisma.commentFingerprint.findFirst({
    where: {
      repositoryId: input.repositoryId,
      fingerprint: fp.hash,
    },
  });

  let fingerprintId: string;
  let isNewFingerprint: boolean;
  let previousOccurrenceCount: number;
  let wasReintroduced = false;

  if (existingFp) {
    // 既存のフィンガープリントを更新
    fingerprintId = existingFp.id;
    isNewFingerprint = false;
    previousOccurrenceCount = existingFp.occurrenceCount;

    // 解決済みだった問題が再発した場合
    if (existingFp.resolvedAt) {
      wasReintroduced = true;
    }

    await prisma.commentFingerprint.update({
      where: { id: existingFp.id },
      data: {
        lastSeenAt: new Date(),
        occurrenceCount: existingFp.occurrenceCount + 1,
        // 再発した場合は解決状態をリセット
        resolvedAt: wasReintroduced ? null : existingFp.resolvedAt,
      },
    });
  } else {
    // 新しいフィンガープリントを作成
    const newFp = await prisma.commentFingerprint.create({
      data: {
        repositoryId: input.repositoryId,
        fingerprint: fp.hash,
        category: fp.category,
        patternType: fp.patternType,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        occurrenceCount: 1,
      },
    });

    fingerprintId = newFp.id;
    isNewFingerprint = true;
    previousOccurrenceCount = 0;
  }

  // 発生を記録
  const occurrence = await prisma.commentOccurrence.create({
    data: {
      fingerprintId,
      reviewId: input.reviewId,
      pullRequestId: input.pullRequestId,
      filePath: input.filePath,
      lineNumber: input.lineNumber,
      commentBody: input.commentBody,
      severity: input.severity || "INFO",
    },
  });

  return {
    occurrenceId: occurrence.id,
    fingerprintId,
    isNewFingerprint,
    previousOccurrenceCount,
    wasReintroduced,
  };
}

// ========================================
// 解決・ユーザーアクション
// ========================================

/**
 * コメントを解決済みとしてマークする
 */
export async function markAsResolved(input: ResolutionInput): Promise<void> {
  // 解決記録を作成
  await prisma.commentResolution.create({
    data: {
      fingerprintId: input.fingerprintId,
      pullRequestId: input.pullRequestId,
      resolutionType: input.resolutionType,
      commitSha: input.commitSha,
    },
  });

  // フィンガープリントを更新
  await prisma.commentFingerprint.update({
    where: { id: input.fingerprintId },
    data: {
      resolvedAt: new Date(),
      userAcknowledged:
        input.resolutionType === "ACKNOWLEDGED" ||
        input.resolutionType === "FALSE_POSITIVE",
    },
  });
}

/**
 * ユーザーアクションを処理する
 */
export async function processUserAction(input: UserActionInput): Promise<void> {
  const occurrence = await prisma.commentOccurrence.findUnique({
    where: { id: input.occurrenceId },
    include: { fingerprint: true },
  });

  if (!occurrence) {
    throw new Error(`Occurrence not found: ${input.occurrenceId}`);
  }

  // 発生を更新
  await prisma.commentOccurrence.update({
    where: { id: input.occurrenceId },
    data: {
      wasAddressed: input.actionType === "ADDRESSED",
      wasIgnored: input.actionType === "IGNORED",
      userResponse: input.userResponse,
    },
  });

  // アクションに応じてフィンガープリントを更新
  switch (input.actionType) {
    case "ADDRESSED":
      await prisma.commentFingerprint.update({
        where: { id: occurrence.fingerprintId },
        data: {
          resolvedAt: new Date(),
        },
      });
      break;

    case "ACKNOWLEDGED":
      await prisma.commentFingerprint.update({
        where: { id: occurrence.fingerprintId },
        data: {
          userAcknowledged: true,
        },
      });
      break;

    case "IGNORED":
      await prisma.commentFingerprint.update({
        where: { id: occurrence.fingerprintId },
        data: {
          ignoredAt: new Date(),
        },
      });
      break;
  }
}

// ========================================
// 履歴クエリ
// ========================================

/**
 * コメント履歴を取得する
 */
export async function getCommentHistory(
  query: CommentHistoryQuery
): Promise<CommentHistoryEntry[]> {
  const where: Record<string, unknown> = {
    repositoryId: query.repositoryId,
  };

  // フィルタを適用
  if (query.category) {
    where.category = query.category;
  }

  if (query.patternType) {
    where.patternType = query.patternType;
  }

  if (!query.includeResolved) {
    where.resolvedAt = null;
  }

  if (!query.includeAcknowledged) {
    where.userAcknowledged = false;
  }

  if (!query.includeIgnored) {
    where.ignoredAt = null;
  }

  if (query.since) {
    where.firstSeenAt = { gte: query.since };
  }

  if (query.until) {
    where.lastSeenAt = { lte: query.until };
  }

  if (query.minOccurrences) {
    where.occurrenceCount = { gte: query.minOccurrences };
  }

  const fingerprints = await prisma.commentFingerprint.findMany({
    where,
    include: {
      occurrences: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { lastSeenAt: "desc" },
    take: query.limit || 50,
    skip: query.offset || 0,
  });

  return fingerprints.map((fp) => ({
    fingerprintId: fp.id,
    fingerprint: fp.fingerprint,
    category: fp.category || "general",
    patternType: fp.patternType || "general",
    occurrenceCount: fp.occurrenceCount,
    firstSeenAt: fp.firstSeenAt,
    lastSeenAt: fp.lastSeenAt,
    isResolved: fp.resolvedAt !== null,
    resolvedAt: fp.resolvedAt || undefined,
    isAcknowledged: fp.userAcknowledged,
    isIgnored: fp.ignoredAt !== null,
    latestOccurrences: fp.occurrences.map((occ) => ({
      filePath: occ.filePath,
      lineNumber: occ.lineNumber,
      reviewId: occ.reviewId,
      commentBody: occ.commentBody,
      createdAt: occ.createdAt,
    })),
  }));
}

/**
 * コメント履歴の統計を取得する
 */
export async function getCommentHistoryStats(
  repositoryId: string
): Promise<CommentHistoryStats> {
  // 基本的なカウント
  const [total, resolved, acknowledged, ignored] = await Promise.all([
    prisma.commentFingerprint.count({
      where: { repositoryId },
    }),
    prisma.commentFingerprint.count({
      where: { repositoryId, resolvedAt: { not: null } },
    }),
    prisma.commentFingerprint.count({
      where: { repositoryId, userAcknowledged: true },
    }),
    prisma.commentFingerprint.count({
      where: { repositoryId, ignoredAt: { not: null } },
    }),
  ]);

  // カテゴリ別の内訳
  const categoryGroups = await prisma.commentFingerprint.groupBy({
    by: ["category"],
    where: { repositoryId },
    _count: { id: true },
  });

  const byCategory: Record<string, number> = {};
  for (const group of categoryGroups) {
    byCategory[group.category || "general"] = group._count.id;
  }

  // 最も頻繁に発生する問題トップ5
  const topIssues = await prisma.commentFingerprint.findMany({
    where: {
      repositoryId,
      resolvedAt: null,
    },
    orderBy: { occurrenceCount: "desc" },
    take: 5,
    select: {
      id: true,
      category: true,
      occurrenceCount: true,
    },
  });

  return {
    totalFingerprints: total,
    resolvedCount: resolved,
    unresolvedCount: total - resolved,
    acknowledgedCount: acknowledged,
    ignoredCount: ignored,
    byCategory,
    topRecurringIssues: topIssues.map((issue) => ({
      fingerprintId: issue.id,
      category: issue.category || "general",
      occurrenceCount: issue.occurrenceCount,
    })),
  };
}

// ========================================
// 進行型重要度
// ========================================

/**
 * 進行型重要度を計算する
 *
 * コメントの発生回数に基づいて、表示レベルを決定する
 * - 1回目: 詳細な説明
 * - 2-3回目: 要約
 * - 4-9回目: 参照のみ
 * - 10回以上: 表示しない（設定による）
 */
export async function calculateProgressiveSeverity(
  repositoryId: string,
  body: string,
  config: CommentPersistenceConfig = DEFAULT_PERSISTENCE_CONFIG
): Promise<ProgressiveSeverity> {
  const similarFp = await findSimilarFingerprint(
    repositoryId,
    body,
    config.similarityThreshold
  );

  if (!similarFp) {
    // 新しいコメント
    return {
      level: "DETAILED",
      occurrenceCount: 0,
      recommendedFormat: "full",
    };
  }

  // ユーザーが認識済みの場合
  if (similarFp.isAcknowledged) {
    return {
      level: "SILENT",
      occurrenceCount: similarFp.occurrenceCount,
      recommendedFormat: "hidden",
      context: "User has acknowledged this issue",
    };
  }

  // 解決済みの場合は参照のみ
  if (similarFp.isResolved) {
    return {
      level: "REFERENCE",
      occurrenceCount: similarFp.occurrenceCount,
      recommendedFormat: "link",
      context: "This issue was previously resolved",
    };
  }

  // 発生回数に基づいてレベルを決定
  const count = similarFp.occurrenceCount;

  if (count < config.maxDetailedOccurrences) {
    return {
      level: "DETAILED",
      occurrenceCount: count,
      recommendedFormat: "full",
    };
  }

  if (count < config.maxSummaryOccurrences) {
    return {
      level: "SUMMARY",
      occurrenceCount: count,
      recommendedFormat: "brief",
      context: `This issue has been reported ${count} times`,
    };
  }

  if (count < config.minOccurrencesToIgnore) {
    return {
      level: "REFERENCE",
      occurrenceCount: count,
      recommendedFormat: "link",
      context: `Recurring issue (${count} occurrences)`,
    };
  }

  return {
    level: "SILENT",
    occurrenceCount: count,
    recommendedFormat: "hidden",
    context: `Issue reported ${count}+ times, consider addressing systematically`,
  };
}

// ========================================
// クリーンアップ
// ========================================

/**
 * 古いフィンガープリントをクリーンアップする
 *
 * @param repositoryId リポジトリID
 * @param expirationDays 有効期限（日数）
 * @returns 削除されたフィンガープリント数
 */
export async function cleanupExpiredFingerprints(
  repositoryId: string,
  expirationDays: number = 90
): Promise<number> {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() - expirationDays);

  // 解決済みで期限切れのフィンガープリントを削除
  const result = await prisma.commentFingerprint.deleteMany({
    where: {
      repositoryId,
      resolvedAt: { not: null },
      lastSeenAt: { lt: expirationDate },
    },
  });

  return result.count;
}
