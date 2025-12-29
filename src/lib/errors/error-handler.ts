/**
 * Phase 6: Error Handler
 *
 * Webhook/API用の中央エラーハンドリング
 */

import { NextResponse } from "next/server";
import { ErrorType } from "@prisma/client";
import { trackError, trackGitHubError } from "./error-tracker";
import {
  formatErrorForPR,
  formatErrorForLog,
  type TranslatedError,
  type ErrorContext,
} from "./error-translator";
import { getInstallationOctokit } from "@/lib/github/client";

// ========================================
// 型定義
// ========================================

export interface ErrorHandlerOptions {
  /** リポジトリID */
  repositoryId?: string;
  /** コンテキスト情報 */
  context?: ErrorContext;
  /** PRにエラーを通知するか */
  notifyPR?: boolean;
  /** PRへの通知情報 */
  prInfo?: {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
  };
  /** リトライするか */
  shouldRetry?: boolean;
  /** カスタムレスポンスを返すか */
  returnResponse?: boolean;
}

export interface ErrorHandlerResult {
  /** 翻訳されたエラー */
  error: TranslatedError;
  /** HTTPレスポンス（returnResponseがtrueの場合） */
  response?: NextResponse;
  /** PRに通知したか */
  notifiedPR: boolean;
  /** リトライすべきか */
  shouldRetry: boolean;
  /** リトライ待機時間（ms） */
  retryAfterMs?: number;
}

// ========================================
// メイン関数
// ========================================

/**
 * エラーを処理
 */
export async function handleError(
  error: Error | unknown,
  options: ErrorHandlerOptions = {}
): Promise<ErrorHandlerResult> {
  const {
    repositoryId,
    context,
    notifyPR = false,
    prInfo,
    shouldRetry = true,
    returnResponse = false,
  } = options;

  // エラーを追跡
  const translated = await trackError(error, {
    repositoryId,
    context,
    logToConsole: true,
  });

  // ログ出力
  console.error(`[ErrorHandler] ${formatErrorForLog(translated)}`);

  // PRへの通知
  let notifiedPR = false;
  if (notifyPR && prInfo) {
    notifiedPR = await notifyPRAboutError(translated, prInfo);
  }

  // リトライ判定
  const canRetry = shouldRetry && translated.retryable;

  // レスポンス生成
  let response: NextResponse | undefined;
  if (returnResponse) {
    response = createErrorResponse(translated);
  }

  return {
    error: translated,
    response,
    notifiedPR,
    shouldRetry: canRetry,
    retryAfterMs: canRetry ? translated.retryAfterMs : undefined,
  };
}

/**
 * GitHub APIエラーを処理
 */
export async function handleGitHubError(
  error: Error | unknown,
  options: ErrorHandlerOptions = {}
): Promise<ErrorHandlerResult> {
  const translated = await trackGitHubError(error, {
    repositoryId: options.repositoryId,
    context: options.context,
    logToConsole: true,
  });

  console.error(`[ErrorHandler:GitHub] ${formatErrorForLog(translated)}`);

  let notifiedPR = false;
  if (options.notifyPR && options.prInfo) {
    notifiedPR = await notifyPRAboutError(translated, options.prInfo);
  }

  const canRetry = options.shouldRetry !== false && translated.retryable;

  return {
    error: translated,
    response: options.returnResponse
      ? createErrorResponse(translated)
      : undefined,
    notifiedPR,
    shouldRetry: canRetry,
    retryAfterMs: canRetry ? translated.retryAfterMs : undefined,
  };
}

/**
 * Webhookエラーを処理
 */
export async function handleWebhookError(
  error: Error | unknown,
  context?: ErrorContext
): Promise<NextResponse> {
  const translated = await trackError(error, {
    context: { ...context, operation: "webhook" },
    logToConsole: true,
  });

  console.error(`[ErrorHandler:Webhook] ${formatErrorForLog(translated)}`);

  return createErrorResponse(translated);
}

/**
 * Inngestエラーを処理（リトライ判定付き）
 */
export async function handleInngestError(
  error: Error | unknown,
  options: ErrorHandlerOptions = {}
): Promise<{
  translated: TranslatedError;
  shouldRetry: boolean;
  retryAfterMs?: number;
}> {
  const translated = await trackError(error, {
    repositoryId: options.repositoryId,
    context: options.context,
    logToConsole: true,
  });

  console.error(`[ErrorHandler:Inngest] ${formatErrorForLog(translated)}`);

  // PRへの通知（致命的なエラーのみ）
  if (options.prInfo && !translated.retryable) {
    await notifyPRAboutError(translated, options.prInfo);
  }

  return {
    translated,
    shouldRetry: translated.retryable,
    retryAfterMs: translated.retryAfterMs,
  };
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * PRにエラーを通知
 */
async function notifyPRAboutError(
  translated: TranslatedError,
  prInfo: {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
  }
): Promise<boolean> {
  try {
    const octokit = await getInstallationOctokit(prInfo.installationId);

    const body = formatErrorForPR(translated);

    await octokit.rest.issues.createComment({
      owner: prInfo.owner,
      repo: prInfo.repo,
      issue_number: prInfo.prNumber,
      body,
    });

    console.log(`[ErrorHandler] Notified PR #${prInfo.prNumber} about error`);
    return true;
  } catch (notifyError) {
    console.error("[ErrorHandler] Failed to notify PR:", notifyError);
    return false;
  }
}

/**
 * エラーレスポンスを生成
 */
function createErrorResponse(translated: TranslatedError): NextResponse {
  const statusCode = getHttpStatusCode(translated);

  return NextResponse.json(
    {
      error: {
        type: translated.type,
        code: translated.code,
        message: translated.friendlyMessage,
        resolution: translated.resolution,
        retryable: translated.retryable,
        retryAfterMs: translated.retryAfterMs,
      },
    },
    {
      status: statusCode,
      headers: translated.retryAfterMs
        ? { "Retry-After": String(Math.ceil(translated.retryAfterMs / 1000)) }
        : undefined,
    }
  );
}

/**
 * HTTPステータスコードを取得
 */
function getHttpStatusCode(translated: TranslatedError): number {
  // エラーコードがHTTPステータスの場合はそれを使用
  if (translated.code) {
    const numCode = parseInt(translated.code, 10);
    if (numCode >= 400 && numCode < 600) {
      return numCode;
    }
  }

  // エラータイプからステータスを決定
  const statusMap: Partial<Record<ErrorType, number>> = {
    AUTHENTICATION: 401,
    PERMISSION: 403,
    VALIDATION: 422,
    RATE_LIMIT: 429,
    GITHUB_API: 502,
    AI_GENERATION: 503,
    NETWORK: 503,
    DATABASE: 503,
    INTERNAL: 500,
    UNKNOWN: 500,
  };

  return statusMap[translated.type] ?? 500;
}

// ========================================
// ラッパー関数
// ========================================

/**
 * 非同期関数をエラーハンドリングでラップ
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: Omit<ErrorHandlerOptions, "returnResponse"> = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      await handleError(error, options);
      throw error; // 元のエラーを再スロー
    }
  };
}

/**
 * APIルートをエラーハンドリングでラップ
 */
export function withApiErrorHandling<T>(
  handler: (request: Request) => Promise<NextResponse<T>>
): (request: Request) => Promise<NextResponse<T | { error: unknown }>> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      const result = await handleError(error, {
        returnResponse: true,
        context: {
          operation: "api",
          url: request.url,
          method: request.method,
        },
      });

      return result.response as NextResponse<T | { error: unknown }>;
    }
  };
}

// ========================================
// エクスポート
// ========================================

export {
  translateError,
  formatErrorForPR,
  formatErrorForLog,
  type TranslatedError,
  type ErrorContext,
} from "./error-translator";

export {
  trackError,
  trackGitHubError,
  getErrorStats,
  getRecentErrors,
  markErrorResolved,
  cleanupOldErrors,
} from "./error-tracker";

export {
  matchErrorPattern,
  getPatternsByType,
  getAllPatterns,
  type ErrorPattern,
} from "./error-registry";
