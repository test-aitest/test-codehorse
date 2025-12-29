/**
 * Phase 7: Draft PR Handler
 *
 * ドラフトPRの状態管理とレビュー判定ロジック
 */

import { prisma } from "@/lib/prisma";
import type { ReviewDepth } from "@prisma/client";

// ========================================
// 型定義
// ========================================

export interface DraftPRInfo {
  /** PR ID */
  pullRequestId: string;
  /** リポジトリID */
  repositoryId: string;
  /** PR番号 */
  number: number;
  /** ドラフト状態か */
  isDraft: boolean;
  /** 現在のコミットSHA */
  headSha: string;
  /** ドラフト時の最終コミットSHA */
  draftCommitSha?: string | null;
  /** ドラフト時にレビュー済みか */
  draftReviewedAt?: Date | null;
  /** 準備完了時にレビュー済みか */
  readyReviewedAt?: Date | null;
  /** ドラフトから準備完了に変更した日時 */
  markedReadyAt?: Date | null;
}

export interface DraftStateChange {
  /** 状態変更の種類 */
  type: "converted_to_draft" | "ready_for_review";
  /** 変更前のドラフト状態 */
  wasDraft: boolean;
  /** ドラフト時の最終コミット */
  draftCommitSha?: string | null;
  /** 現在のコミット */
  currentCommitSha: string;
  /** ドラフト時のレビュー日時 */
  draftReviewedAt?: Date | null;
}

export interface ReviewDecision {
  /** レビューを実行するか */
  shouldReview: boolean;
  /** レビュー深度 */
  reviewDepth: ReviewDepth;
  /** スキップ理由 */
  skipReason?: string;
  /** 追加情報 */
  info?: {
    /** ドラフト→準備完了の差分を含めるか */
    includeDraftDiff: boolean;
    /** ドラフト時のコミット */
    draftCommitSha?: string | null;
  };
}

// ========================================
// メイン関数
// ========================================

/**
 * PRのドラフト状態を取得
 */
export async function getDraftPRInfo(
  repositoryId: string,
  prNumber: number
): Promise<DraftPRInfo | null> {
  const pr = await prisma.pullRequest.findFirst({
    where: {
      repositoryId,
      number: prNumber,
    },
    select: {
      id: true,
      repositoryId: true,
      number: true,
      isDraft: true,
      headSha: true,
      draftCommitSha: true,
      draftReviewedAt: true,
      readyReviewedAt: true,
      markedReadyAt: true,
    },
  });

  if (!pr) return null;

  return {
    pullRequestId: pr.id,
    repositoryId: pr.repositoryId,
    number: pr.number,
    isDraft: pr.isDraft,
    headSha: pr.headSha,
    draftCommitSha: pr.draftCommitSha,
    draftReviewedAt: pr.draftReviewedAt,
    readyReviewedAt: pr.readyReviewedAt,
    markedReadyAt: pr.markedReadyAt,
  };
}

/**
 * ドラフト状態の変更を処理
 */
export async function handleDraftStateChange(
  pullRequestId: string,
  isDraft: boolean,
  currentCommitSha: string
): Promise<DraftStateChange> {
  const pr = await prisma.pullRequest.findUnique({
    where: { id: pullRequestId },
    select: {
      isDraft: true,
      draftCommitSha: true,
      headSha: true,
      draftReviewedAt: true,
    },
  });

  if (!pr) {
    throw new Error(`PullRequest not found: ${pullRequestId}`);
  }

  const wasDraft = pr.isDraft;

  if (isDraft && !wasDraft) {
    // 準備完了 → ドラフトに変更
    await prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: {
        isDraft: true,
        draftCommitSha: currentCommitSha,
      },
    });

    return {
      type: "converted_to_draft",
      wasDraft: false,
      currentCommitSha,
    };
  } else if (!isDraft && wasDraft) {
    // ドラフト → 準備完了に変更
    await prisma.pullRequest.update({
      where: { id: pullRequestId },
      data: {
        isDraft: false,
        markedReadyAt: new Date(),
      },
    });

    return {
      type: "ready_for_review",
      wasDraft: true,
      draftCommitSha: pr.draftCommitSha,
      currentCommitSha,
      draftReviewedAt: pr.draftReviewedAt,
    };
  }

  // 状態変更なし（通常は呼ばれない）
  return {
    type: isDraft ? "converted_to_draft" : "ready_for_review",
    wasDraft,
    currentCommitSha,
  };
}

/**
 * レビュー実行判定
 */
export function decideReviewAction(
  isDraft: boolean,
  draftReviewEnabled: boolean,
  prInfo?: DraftPRInfo | null
): ReviewDecision {
  // ドラフトPRレビューが無効な場合
  if (isDraft && !draftReviewEnabled) {
    return {
      shouldReview: false,
      reviewDepth: "FULL",
      skipReason: "Draft PR review is disabled",
    };
  }

  // ドラフトPRの場合
  if (isDraft) {
    return {
      shouldReview: true,
      reviewDepth: "LIGHT",
      info: {
        includeDraftDiff: false,
      },
    };
  }

  // 準備完了PRで、ドラフトからの変更がある場合
  if (prInfo?.draftCommitSha && prInfo.markedReadyAt) {
    return {
      shouldReview: true,
      reviewDepth: "FULL",
      info: {
        includeDraftDiff: true,
        draftCommitSha: prInfo.draftCommitSha,
      },
    };
  }

  // 通常のPR
  return {
    shouldReview: true,
    reviewDepth: "FULL",
    info: {
      includeDraftDiff: false,
    },
  };
}

/**
 * ドラフトレビュー完了を記録
 */
export async function markDraftReviewed(
  pullRequestId: string,
  commitSha: string
): Promise<void> {
  await prisma.pullRequest.update({
    where: { id: pullRequestId },
    data: {
      draftReviewedAt: new Date(),
      draftCommitSha: commitSha,
    },
  });
}

/**
 * 準備完了レビュー完了を記録
 */
export async function markReadyReviewed(
  pullRequestId: string
): Promise<void> {
  await prisma.pullRequest.update({
    where: { id: pullRequestId },
    data: {
      readyReviewedAt: new Date(),
    },
  });
}

/**
 * PRのドラフト状態を更新
 */
export async function updateDraftStatus(
  pullRequestId: string,
  isDraft: boolean,
  commitSha?: string
): Promise<void> {
  const updateData: {
    isDraft: boolean;
    draftCommitSha?: string;
    markedReadyAt?: Date;
  } = {
    isDraft,
  };

  if (isDraft && commitSha) {
    updateData.draftCommitSha = commitSha;
  } else if (!isDraft) {
    updateData.markedReadyAt = new Date();
  }

  await prisma.pullRequest.update({
    where: { id: pullRequestId },
    data: updateData,
  });
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * ドラフトレビューが有効か確認
 */
export function isDraftReviewEnabled(): boolean {
  return process.env.DRAFT_PR_REVIEW_ENABLED === "true";
}

/**
 * デフォルトのドラフトレビュー深度を取得
 */
export function getDefaultDraftReviewDepth(): ReviewDepth {
  const depth = process.env.DRAFT_REVIEW_DEPTH?.toUpperCase();
  if (depth === "FULL") return "FULL";
  return "LIGHT"; // デフォルトは軽量レビュー
}

/**
 * ドラフト→準備完了の変更があったか確認
 */
export function hasTransitionedFromDraft(prInfo: DraftPRInfo): boolean {
  return !prInfo.isDraft && prInfo.markedReadyAt !== null;
}

/**
 * ドラフト時からの差分が必要か判定
 */
export function needsDraftDiffComparison(prInfo: DraftPRInfo): boolean {
  if (prInfo.isDraft) return false;
  if (!prInfo.draftCommitSha) return false;
  if (!prInfo.markedReadyAt) return false;

  // ドラフト時の最終コミットと現在のコミットが異なる場合
  return prInfo.draftCommitSha !== prInfo.headSha;
}
