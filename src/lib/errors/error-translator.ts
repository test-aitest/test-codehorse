/**
 * Phase 6: Error Translator
 *
 * エラーを開発者フレンドリーなメッセージに変換
 */

import { ErrorType } from "@prisma/client";
import {
  matchErrorPattern,
  getDefaultFriendlyMessage,
  getDefaultResolution,
} from "./error-registry";

// ========================================
// 型定義
// ========================================

export interface TranslatedError {
  /** エラータイプ */
  type: ErrorType;
  /** エラーコード */
  code?: string;
  /** 元のエラーメッセージ */
  originalMessage: string;
  /** フレンドリーなメッセージ */
  friendlyMessage: string;
  /** 解決策 */
  resolution: string;
  /** 関連ドキュメントURL */
  docUrl?: string;
  /** リトライ可能か */
  retryable: boolean;
  /** リトライ待機時間（ms） */
  retryAfterMs?: number;
  /** マッチしたパターン名 */
  patternName?: string;
  /** スタックトレース */
  stackTrace?: string;
  /** コンテキスト情報 */
  context?: Record<string, unknown>;
}

export interface ErrorContext {
  /** リポジトリ情報 */
  repository?: {
    owner: string;
    name: string;
  };
  /** PR情報 */
  pullRequest?: {
    number: number;
  };
  /** ファイルパス */
  filePath?: string;
  /** 操作名 */
  operation?: string;
  /** その他のコンテキスト */
  [key: string]: unknown;
}

// ========================================
// メイン関数
// ========================================

/**
 * エラーを翻訳
 */
export function translateError(
  error: Error | unknown,
  context?: ErrorContext
): TranslatedError {
  const errorObj = normalizeError(error);
  const errorMessage = errorObj.message;
  const errorCode = extractErrorCode(errorObj);

  // パターンマッチングを試行
  const match = matchErrorPattern(errorMessage, errorCode);

  if (match) {
    return {
      type: match.pattern.type,
      code: errorCode,
      originalMessage: errorMessage,
      friendlyMessage: interpolateMessage(
        match.pattern.friendlyMessage,
        context
      ),
      resolution: interpolateMessage(match.pattern.resolution, context),
      docUrl: match.pattern.docUrl,
      retryable: match.pattern.retryable,
      retryAfterMs: match.pattern.retryAfterMs,
      patternName: match.pattern.name,
      stackTrace: errorObj.stack,
      context: context as Record<string, unknown>,
    };
  }

  // パターンにマッチしない場合はエラータイプを推測
  const inferredType = inferErrorType(errorObj);

  return {
    type: inferredType,
    code: errorCode,
    originalMessage: errorMessage,
    friendlyMessage: getDefaultFriendlyMessage(inferredType),
    resolution: getDefaultResolution(inferredType),
    retryable: isRetryable(inferredType),
    stackTrace: errorObj.stack,
    context: context as Record<string, unknown>,
  };
}

/**
 * GitHub APIエラーを翻訳
 */
export function translateGitHubError(
  error: unknown,
  context?: ErrorContext
): TranslatedError {
  const errorObj = normalizeError(error);
  const statusCode = extractStatusCode(errorObj);

  // GitHub固有のエラー情報を抽出
  const githubContext = {
    ...context,
    statusCode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: (errorObj as any).response?.data,
  };

  const translated = translateError(error, githubContext);

  // GitHub APIエラーの場合はタイプを上書き
  if (translated.type === "UNKNOWN") {
    translated.type = statusCode ? "GITHUB_API" : translated.type;
  }

  return translated;
}

/**
 * AIエラーを翻訳
 */
export function translateAIError(
  error: unknown,
  context?: ErrorContext
): TranslatedError {
  const translated = translateError(error, context);

  // AI関連エラーの場合はタイプを上書き
  if (translated.type === "UNKNOWN") {
    translated.type = "AI_GENERATION";
  }

  return translated;
}

// ========================================
// ヘルパー関数
// ========================================

/**
 * エラーを正規化
 */
function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  if (typeof error === "object" && error !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = error as any;
    const message = obj.message || obj.error || JSON.stringify(error);
    const err = new Error(message);
    if (obj.stack) err.stack = obj.stack;
    return err;
  }

  return new Error(String(error));
}

/**
 * エラーコードを抽出
 */
function extractErrorCode(error: Error): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;

  // Octokitエラー
  if (anyError.status) {
    return String(anyError.status);
  }

  // HTTPエラー
  if (anyError.response?.status) {
    return String(anyError.response.status);
  }

  // Node.jsエラー
  if (anyError.code) {
    return anyError.code;
  }

  return undefined;
}

/**
 * ステータスコードを抽出
 */
function extractStatusCode(error: Error): number | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;

  if (anyError.status && typeof anyError.status === "number") {
    return anyError.status;
  }

  if (
    anyError.response?.status &&
    typeof anyError.response.status === "number"
  ) {
    return anyError.response.status;
  }

  return undefined;
}

/**
 * エラータイプを推測
 */
function inferErrorType(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyError = error as any;

  // ステータスコードベースの判定
  const status = extractStatusCode(error);
  if (status) {
    if (status === 401) return "AUTHENTICATION";
    if (status === 403) return "PERMISSION";
    if (status === 404) return "GITHUB_API";
    if (status === 422) return "VALIDATION";
    if (status === 429) return "RATE_LIMIT";
    if (status >= 500) return "GITHUB_API";
  }

  // メッセージベースの判定
  if (message.includes("rate limit") || message.includes("quota")) {
    return "RATE_LIMIT";
  }

  if (
    message.includes("auth") ||
    message.includes("credential") ||
    message.includes("token")
  ) {
    return "AUTHENTICATION";
  }

  if (
    message.includes("permission") ||
    message.includes("forbidden") ||
    message.includes("access denied")
  ) {
    return "PERMISSION";
  }

  if (
    message.includes("database") ||
    message.includes("prisma") ||
    message.includes("sql")
  ) {
    return "DATABASE";
  }

  if (
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("socket")
  ) {
    return "NETWORK";
  }

  if (
    message.includes("ai") ||
    message.includes("openai") ||
    message.includes("gemini") ||
    message.includes("anthropic")
  ) {
    return "AI_GENERATION";
  }

  if (message.includes("webhook") || message.includes("signature")) {
    return "GITHUB_WEBHOOK";
  }

  if (message.includes("validation") || message.includes("invalid")) {
    return "VALIDATION";
  }

  // エラーコードベースの判定
  if (anyError.code) {
    const code = anyError.code;
    if (
      code.startsWith("E") &&
      (code.includes("CONN") || code.includes("NET"))
    ) {
      return "NETWORK";
    }
  }

  return "UNKNOWN";
}

/**
 * リトライ可能か判定
 */
function isRetryable(type: ErrorType): boolean {
  const retryableTypes: ErrorType[] = [
    "RATE_LIMIT",
    "NETWORK",
    "AI_GENERATION",
  ];

  return retryableTypes.includes(type);
}

/**
 * メッセージにコンテキストを埋め込み
 */
function interpolateMessage(message: string, context?: ErrorContext): string {
  if (!context) return message;

  let result = message;

  if (context.repository) {
    result = result.replace(
      /\{repository\}/g,
      `${context.repository.owner}/${context.repository.name}`
    );
  }

  if (context.pullRequest) {
    result = result.replace(/\{pr\}/g, `#${context.pullRequest.number}`);
  }

  if (context.filePath) {
    result = result.replace(/\{file\}/g, context.filePath);
  }

  if (context.operation) {
    result = result.replace(/\{operation\}/g, context.operation);
  }

  return result;
}

// ========================================
// フォーマット関数
// ========================================

/**
 * エラーをユーザー向けメッセージにフォーマット
 */
export function formatErrorForUser(translated: TranslatedError): string {
  const lines: string[] = [];

  lines.push(`**${translated.friendlyMessage}**`);
  lines.push("");
  lines.push(`**解決策**: ${translated.resolution}`);

  if (translated.docUrl) {
    lines.push("");
    lines.push(`**参考**: [ドキュメント](${translated.docUrl})`);
  }

  if (translated.retryable) {
    const waitTime = translated.retryAfterMs
      ? Math.ceil(translated.retryAfterMs / 1000)
      : 30;
    lines.push("");
    lines.push(`> 💡 このエラーは自動的にリトライされます（${waitTime}秒後）`);
  }

  return lines.join("\n");
}

/**
 * エラーをログ用にフォーマット
 */
export function formatErrorForLog(translated: TranslatedError): string {
  const parts: string[] = [
    `[${translated.type}]`,
    translated.code ? `(${translated.code})` : "",
    translated.patternName ? `[${translated.patternName}]` : "",
    translated.originalMessage,
  ];

  return parts.filter(Boolean).join(" ");
}

/**
 * エラーをPRコメント用にフォーマット
 */
export function formatErrorForPR(translated: TranslatedError): string {
  const lines: string[] = [];

  lines.push("## ⚠️ レビュー処理中にエラーが発生しました");
  lines.push("");
  lines.push(`### ${translated.friendlyMessage}`);
  lines.push("");
  lines.push(translated.resolution);

  if (translated.docUrl) {
    lines.push("");
    lines.push(`📚 [関連ドキュメント](${translated.docUrl})`);
  }

  if (translated.retryable) {
    lines.push("");
    lines.push(
      "> このエラーは一時的なものです。しばらく経ってから再度PRを更新すると、レビューが実行されます。"
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("<details>");
  lines.push("<summary>技術的な詳細</summary>");
  lines.push("");
  lines.push("```");
  lines.push(`Type: ${translated.type}`);
  if (translated.code) lines.push(`Code: ${translated.code}`);
  if (translated.patternName) lines.push(`Pattern: ${translated.patternName}`);
  lines.push(`Message: ${translated.originalMessage}`);
  lines.push("```");
  lines.push("");
  lines.push("</details>");

  return lines.join("\n");
}
