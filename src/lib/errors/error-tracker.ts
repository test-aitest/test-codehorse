/**
 * Phase 6: Error Tracker
 *
 * エラーの発生を追跡し、分析用にDBに保存
 */

import { prisma } from "@/lib/prisma";
import { ErrorType } from "@prisma/client";
import {
  translateError,
  translateGitHubError,
  type TranslatedError,
  type ErrorContext,
} from "./error-translator";

// ========================================
// 型定義
// ========================================

export interface TrackErrorOptions {
  /** リポジトリID */
  repositoryId?: string;
  /** エラーコンテキスト */
  context?: ErrorContext;
  /** スタックトレースを保存するか */
  saveStackTrace?: boolean;
  /** コンソールにログ出力するか */
  logToConsole?: boolean;
}

export interface ErrorStats {
  /** エラータイプ別の発生回数 */
  byType: Record<ErrorType, number>;
  /** エラーコード別の発生回数 */
  byCode: Record<string, number>;
  /** 直近24時間のエラー数 */
  last24Hours: number;
  /** 直近7日間のエラー数 */
  last7Days: number;
  /** 最も頻繁なエラー */
  mostFrequent: Array<{
    type: ErrorType;
    code?: string;
    count: number;
    lastOccurrence: Date;
  }>;
}

// ========================================
// メイン関数
// ========================================

/**
 * エラーを追跡・記録
 */
export async function trackError(
  error: Error | unknown,
  options: TrackErrorOptions = {}
): Promise<TranslatedError> {
  const {
    repositoryId,
    context,
    saveStackTrace = true,
    logToConsole = true,
  } = options;

  // エラーを翻訳
  const translated = translateError(error, context);

  // コンソールログ
  if (logToConsole) {
    console.error(`[ErrorTracker] ${translated.type}: ${translated.originalMessage}`, {
      code: translated.code,
      pattern: translated.patternName,
      retryable: translated.retryable,
    });
  }

  // DBに保存（非同期で実行、エラーは握りつぶす）
  saveErrorToDb(translated, repositoryId, saveStackTrace).catch(err => {
    console.error("[ErrorTracker] Failed to save error to DB:", err);
  });

  return translated;
}

/**
 * GitHub APIエラーを追跡
 */
export async function trackGitHubError(
  error: Error | unknown,
  options: TrackErrorOptions = {}
): Promise<TranslatedError> {
  const translated = translateGitHubError(error, options.context);

  if (options.logToConsole !== false) {
    console.error(`[ErrorTracker:GitHub] ${translated.type}: ${translated.originalMessage}`, {
      code: translated.code,
      pattern: translated.patternName,
    });
  }

  saveErrorToDb(translated, options.repositoryId, options.saveStackTrace ?? true).catch(err => {
    console.error("[ErrorTracker] Failed to save GitHub error to DB:", err);
  });

  return translated;
}

/**
 * エラーをDBに保存
 */
async function saveErrorToDb(
  translated: TranslatedError,
  repositoryId?: string,
  saveStackTrace: boolean = true
): Promise<void> {
  try {
    await prisma.errorOccurrence.create({
      data: {
        repositoryId,
        errorType: translated.type,
        errorCode: translated.code,
        errorMessage: translated.originalMessage,
        friendlyMessage: translated.friendlyMessage,
        context: translated.context as object,
        stackTrace: saveStackTrace ? translated.stackTrace : undefined,
        resolved: false,
      },
    });
  } catch (error) {
    // DBエラーは握りつぶす（無限ループ防止）
    console.error("[ErrorTracker] DB save failed:", error);
  }
}

// ========================================
// 統計・分析関数
// ========================================

/**
 * エラー統計を取得
 */
export async function getErrorStats(repositoryId?: string): Promise<ErrorStats> {
  const now = new Date();
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const whereClause = repositoryId ? { repositoryId } : {};

  // タイプ別集計
  const byTypeRaw = await prisma.errorOccurrence.groupBy({
    by: ["errorType"],
    where: whereClause,
    _count: true,
  });

  const byType = Object.fromEntries(
    Object.values(ErrorType).map(type => [
      type,
      byTypeRaw.find(r => r.errorType === type)?._count ?? 0,
    ])
  ) as Record<ErrorType, number>;

  // コード別集計
  const byCodeRaw = await prisma.errorOccurrence.groupBy({
    by: ["errorCode"],
    where: {
      ...whereClause,
      errorCode: { not: null },
    },
    _count: true,
  });

  const byCode: Record<string, number> = {};
  for (const row of byCodeRaw) {
    if (row.errorCode) {
      byCode[row.errorCode] = row._count;
    }
  }

  // 直近24時間
  const count24h = await prisma.errorOccurrence.count({
    where: {
      ...whereClause,
      createdAt: { gte: last24Hours },
    },
  });

  // 直近7日間
  const count7d = await prisma.errorOccurrence.count({
    where: {
      ...whereClause,
      createdAt: { gte: last7Days },
    },
  });

  // 最も頻繁なエラー
  const mostFrequentRaw = await prisma.errorOccurrence.groupBy({
    by: ["errorType", "errorCode"],
    where: {
      ...whereClause,
      createdAt: { gte: last7Days },
    },
    _count: true,
    _max: {
      createdAt: true,
    },
    orderBy: {
      _count: {
        errorType: "desc",
      },
    },
    take: 10,
  });

  const mostFrequent = mostFrequentRaw.map(row => ({
    type: row.errorType,
    code: row.errorCode ?? undefined,
    count: row._count,
    lastOccurrence: row._max.createdAt!,
  }));

  return {
    byType,
    byCode,
    last24Hours: count24h,
    last7Days: count7d,
    mostFrequent,
  };
}

/**
 * 直近のエラーを取得
 */
export async function getRecentErrors(
  limit: number = 20,
  repositoryId?: string
): Promise<Array<{
  id: string;
  type: ErrorType;
  code?: string;
  message: string;
  friendlyMessage?: string;
  createdAt: Date;
  resolved: boolean;
}>> {
  const errors = await prisma.errorOccurrence.findMany({
    where: repositoryId ? { repositoryId } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      errorType: true,
      errorCode: true,
      errorMessage: true,
      friendlyMessage: true,
      createdAt: true,
      resolved: true,
    },
  });

  return errors.map(e => ({
    id: e.id,
    type: e.errorType,
    code: e.errorCode ?? undefined,
    message: e.errorMessage,
    friendlyMessage: e.friendlyMessage ?? undefined,
    createdAt: e.createdAt,
    resolved: e.resolved,
  }));
}

/**
 * エラーを解決済みにマーク
 */
export async function markErrorResolved(
  errorId: string,
  resolution?: string
): Promise<void> {
  await prisma.errorOccurrence.update({
    where: { id: errorId },
    data: {
      resolved: true,
      resolution,
    },
  });
}

/**
 * 古いエラーを削除（クリーンアップ）
 */
export async function cleanupOldErrors(olderThanDays: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.errorOccurrence.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      resolved: true,
    },
  });

  return result.count;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * エラーが頻発しているか判定
 */
export async function isErrorFrequent(
  errorType: ErrorType,
  thresholdPerHour: number = 10,
  repositoryId?: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const count = await prisma.errorOccurrence.count({
    where: {
      errorType,
      repositoryId,
      createdAt: { gte: oneHourAgo },
    },
  });

  return count >= thresholdPerHour;
}

/**
 * エラーレートを取得（エラー/時間）
 */
export async function getErrorRate(
  hours: number = 1,
  repositoryId?: string
): Promise<number> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const count = await prisma.errorOccurrence.count({
    where: {
      repositoryId,
      createdAt: { gte: since },
    },
  });

  return count / hours;
}
