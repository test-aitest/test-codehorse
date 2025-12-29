/**
 * Phase 6: Error Registry
 *
 * 既知のエラーパターンとその解決策を管理
 */

import { ErrorType } from "@prisma/client";

// ========================================
// 型定義
// ========================================

export interface ErrorPattern {
  /** パターン名 */
  name: string;
  /** エラータイプ */
  type: ErrorType;
  /** エラーコード（オプション） */
  code?: string;
  /** エラーメッセージのパターン（正規表現） */
  messagePattern: RegExp;
  /** ユーザーフレンドリーなメッセージ */
  friendlyMessage: string;
  /** 解決策の説明 */
  resolution: string;
  /** 関連ドキュメントURL */
  docUrl?: string;
  /** 自動リトライ可能か */
  retryable: boolean;
  /** リトライ待機時間（ms） */
  retryAfterMs?: number;
}

export interface ErrorMatch {
  /** マッチしたパターン */
  pattern: ErrorPattern;
  /** 抽出された変数 */
  variables: Record<string, string>;
}

// ========================================
// GitHub API エラーパターン
// ========================================

const GITHUB_API_PATTERNS: ErrorPattern[] = [
  {
    name: "rate_limit_exceeded",
    type: "RATE_LIMIT",
    code: "403",
    messagePattern: /API rate limit exceeded/i,
    friendlyMessage: "GitHub APIのレート制限に達しました",
    resolution:
      "しばらく待ってから再試行してください。レート制限は通常1時間後にリセットされます。",
    docUrl: "https://docs.github.com/en/rest/rate-limit",
    retryable: true,
    retryAfterMs: 60000, // 1分後
  },
  {
    name: "secondary_rate_limit",
    type: "RATE_LIMIT",
    code: "403",
    messagePattern: /secondary rate limit/i,
    friendlyMessage: "GitHub APIの二次レート制限に達しました",
    resolution:
      "短時間に多くのリクエストを送信しました。数分待ってから再試行してください。",
    docUrl: "https://docs.github.com/en/rest/guides/best-practices-for-integrators",
    retryable: true,
    retryAfterMs: 120000, // 2分後
  },
  {
    name: "not_found",
    type: "GITHUB_API",
    code: "404",
    messagePattern: /Not Found/i,
    friendlyMessage: "リソースが見つかりません",
    resolution:
      "リポジトリ、PR、またはファイルが存在するか確認してください。権限が不足している可能性もあります。",
    retryable: false,
  },
  {
    name: "unprocessable_entity",
    type: "GITHUB_API",
    code: "422",
    messagePattern: /Validation Failed|Unprocessable Entity/i,
    friendlyMessage: "リクエストの検証に失敗しました",
    resolution:
      "送信したデータが正しいか確認してください。コメント位置がdiff範囲外の可能性があります。",
    retryable: false,
  },
  {
    name: "pull_request_review_thread_position",
    type: "GITHUB_API",
    code: "422",
    messagePattern: /pull_request_review_thread\.diff_hunk.*path.*position/i,
    friendlyMessage: "コメントの位置が無効です",
    resolution:
      "コメントの位置がdiffの範囲外です。ファイルが更新された可能性があります。",
    retryable: false,
  },
  {
    name: "bad_credentials",
    type: "AUTHENTICATION",
    code: "401",
    messagePattern: /Bad credentials/i,
    friendlyMessage: "認証に失敗しました",
    resolution:
      "GitHub Appの認証情報が無効または期限切れです。アプリを再インストールしてください。",
    retryable: false,
  },
  {
    name: "installation_suspended",
    type: "AUTHENTICATION",
    code: "403",
    messagePattern: /This installation has been suspended/i,
    friendlyMessage: "GitHub Appのインストールが一時停止されています",
    resolution:
      "リポジトリ設定でGitHub Appを再有効化してください。",
    retryable: false,
  },
  {
    name: "resource_not_accessible",
    type: "PERMISSION",
    code: "403",
    messagePattern: /Resource not accessible by integration/i,
    friendlyMessage: "このリソースへのアクセス権限がありません",
    resolution:
      "GitHub Appに必要な権限が付与されているか確認してください。リポジトリ設定からアプリの権限を確認できます。",
    retryable: false,
  },
  {
    name: "server_error",
    type: "GITHUB_API",
    code: "500",
    messagePattern: /Server Error|Internal Server Error/i,
    friendlyMessage: "GitHubサーバーでエラーが発生しました",
    resolution:
      "GitHub側の一時的な問題です。しばらく待ってから再試行してください。",
    docUrl: "https://www.githubstatus.com/",
    retryable: true,
    retryAfterMs: 30000,
  },
  {
    name: "service_unavailable",
    type: "GITHUB_API",
    code: "503",
    messagePattern: /Service Unavailable/i,
    friendlyMessage: "GitHubサービスが一時的に利用できません",
    resolution:
      "GitHubのメンテナンスまたは障害中の可能性があります。ステータスページを確認してください。",
    docUrl: "https://www.githubstatus.com/",
    retryable: true,
    retryAfterMs: 60000,
  },
];

// ========================================
// AI生成エラーパターン
// ========================================

const AI_GENERATION_PATTERNS: ErrorPattern[] = [
  {
    name: "ai_rate_limit",
    type: "AI_GENERATION",
    messagePattern: /rate limit|quota exceeded|too many requests/i,
    friendlyMessage: "AI APIのレート制限に達しました",
    resolution:
      "AI APIの利用制限に達しました。しばらく待ってから再試行してください。",
    retryable: true,
    retryAfterMs: 60000,
  },
  {
    name: "ai_context_length",
    type: "AI_GENERATION",
    messagePattern: /context length|token limit|maximum.*tokens/i,
    friendlyMessage: "入力が長すぎます",
    resolution:
      "レビュー対象のコードが大きすぎます。PRを小さく分割することを検討してください。",
    retryable: false,
  },
  {
    name: "ai_content_filter",
    type: "AI_GENERATION",
    messagePattern: /content filter|safety|blocked/i,
    friendlyMessage: "コンテンツフィルターによりブロックされました",
    resolution:
      "コードに安全でないコンテンツが含まれている可能性があります。",
    retryable: false,
  },
  {
    name: "ai_timeout",
    type: "AI_GENERATION",
    messagePattern: /timeout|timed out/i,
    friendlyMessage: "AI処理がタイムアウトしました",
    resolution:
      "処理に時間がかかりすぎました。PRを小さく分割することを検討してください。",
    retryable: true,
    retryAfterMs: 10000,
  },
  {
    name: "ai_invalid_response",
    type: "AI_GENERATION",
    messagePattern: /invalid.*response|parse.*error|JSON.*invalid/i,
    friendlyMessage: "AIからの応答を解析できませんでした",
    resolution:
      "AIからの応答が予期しない形式でした。再試行してください。",
    retryable: true,
    retryAfterMs: 5000,
  },
];

// ========================================
// データベースエラーパターン
// ========================================

const DATABASE_PATTERNS: ErrorPattern[] = [
  {
    name: "unique_constraint",
    type: "DATABASE",
    messagePattern: /Unique constraint|duplicate key/i,
    friendlyMessage: "データの重複エラー",
    resolution:
      "同じデータが既に存在します。これは通常、重複処理を防ぐための正常な動作です。",
    retryable: false,
  },
  {
    name: "connection_error",
    type: "DATABASE",
    messagePattern: /connection.*refused|ECONNREFUSED|Can't reach database/i,
    friendlyMessage: "データベースに接続できません",
    resolution:
      "データベースサーバーが一時的に利用できません。しばらく待ってから再試行してください。",
    retryable: true,
    retryAfterMs: 10000,
  },
  {
    name: "timeout",
    type: "DATABASE",
    messagePattern: /query.*timeout|connection.*timeout/i,
    friendlyMessage: "データベースクエリがタイムアウトしました",
    resolution:
      "処理に時間がかかりすぎました。再試行してください。",
    retryable: true,
    retryAfterMs: 5000,
  },
  {
    name: "foreign_key",
    type: "DATABASE",
    messagePattern: /foreign key constraint/i,
    friendlyMessage: "データの整合性エラー",
    resolution:
      "関連するデータが見つかりません。データが削除された可能性があります。",
    retryable: false,
  },
];

// ========================================
// ネットワークエラーパターン
// ========================================

const NETWORK_PATTERNS: ErrorPattern[] = [
  {
    name: "connection_reset",
    type: "NETWORK",
    messagePattern: /ECONNRESET|connection reset/i,
    friendlyMessage: "接続がリセットされました",
    resolution:
      "ネットワーク接続が中断されました。再試行してください。",
    retryable: true,
    retryAfterMs: 5000,
  },
  {
    name: "dns_error",
    type: "NETWORK",
    messagePattern: /ENOTFOUND|getaddrinfo|DNS/i,
    friendlyMessage: "DNS解決に失敗しました",
    resolution:
      "サーバーのアドレスを解決できませんでした。ネットワーク設定を確認してください。",
    retryable: true,
    retryAfterMs: 10000,
  },
  {
    name: "ssl_error",
    type: "NETWORK",
    messagePattern: /SSL|certificate|CERT/i,
    friendlyMessage: "SSL/TLS接続エラー",
    resolution:
      "安全な接続を確立できませんでした。証明書の問題がある可能性があります。",
    retryable: false,
  },
  {
    name: "timeout",
    type: "NETWORK",
    messagePattern: /ETIMEDOUT|socket.*timeout/i,
    friendlyMessage: "ネットワークタイムアウト",
    resolution:
      "サーバーからの応答がありませんでした。ネットワーク接続を確認してください。",
    retryable: true,
    retryAfterMs: 10000,
  },
];

// ========================================
// Webhookエラーパターン
// ========================================

const WEBHOOK_PATTERNS: ErrorPattern[] = [
  {
    name: "invalid_signature",
    type: "GITHUB_WEBHOOK",
    messagePattern: /signature.*invalid|verification failed/i,
    friendlyMessage: "Webhook署名が無効です",
    resolution:
      "Webhook署名の検証に失敗しました。WEBHOOK_SECRETが正しく設定されているか確認してください。",
    retryable: false,
  },
  {
    name: "missing_payload",
    type: "GITHUB_WEBHOOK",
    messagePattern: /missing.*payload|empty.*body/i,
    friendlyMessage: "Webhookペイロードが不正です",
    resolution:
      "Webhookリクエストのペイロードが空または不正です。",
    retryable: false,
  },
  {
    name: "unsupported_event",
    type: "GITHUB_WEBHOOK",
    messagePattern: /unsupported.*event|unknown.*event/i,
    friendlyMessage: "サポートされていないイベントです",
    resolution:
      "このWebhookイベントは現在サポートされていません。",
    retryable: false,
  },
];

// ========================================
// 全パターンを統合
// ========================================

const ALL_PATTERNS: ErrorPattern[] = [
  ...GITHUB_API_PATTERNS,
  ...AI_GENERATION_PATTERNS,
  ...DATABASE_PATTERNS,
  ...NETWORK_PATTERNS,
  ...WEBHOOK_PATTERNS,
];

// ========================================
// エクスポート関数
// ========================================

/**
 * エラーメッセージからパターンをマッチング
 */
export function matchErrorPattern(
  errorMessage: string,
  errorCode?: string
): ErrorMatch | null {
  for (const pattern of ALL_PATTERNS) {
    // エラーコードが指定されている場合は先にチェック
    if (pattern.code && errorCode && pattern.code !== errorCode) {
      continue;
    }

    const match = errorMessage.match(pattern.messagePattern);
    if (match) {
      // マッチした変数を抽出
      const variables: Record<string, string> = {};
      if (match.groups) {
        Object.assign(variables, match.groups);
      }

      return { pattern, variables };
    }
  }

  return null;
}

/**
 * エラータイプからパターン一覧を取得
 */
export function getPatternsByType(type: ErrorType): ErrorPattern[] {
  return ALL_PATTERNS.filter(p => p.type === type);
}

/**
 * エラーコードからパターンを取得
 */
export function getPatternByCode(code: string): ErrorPattern | null {
  return ALL_PATTERNS.find(p => p.code === code) || null;
}

/**
 * パターン名からパターンを取得
 */
export function getPatternByName(name: string): ErrorPattern | null {
  return ALL_PATTERNS.find(p => p.name === name) || null;
}

/**
 * 全パターンを取得
 */
export function getAllPatterns(): ErrorPattern[] {
  return [...ALL_PATTERNS];
}

/**
 * デフォルトのフレンドリーメッセージを生成
 */
export function getDefaultFriendlyMessage(type: ErrorType): string {
  const messages: Record<ErrorType, string> = {
    GITHUB_API: "GitHub APIでエラーが発生しました",
    GITHUB_WEBHOOK: "Webhook処理でエラーが発生しました",
    AI_GENERATION: "AIによるレビュー生成でエラーが発生しました",
    DATABASE: "データベースでエラーが発生しました",
    RATE_LIMIT: "APIのレート制限に達しました",
    AUTHENTICATION: "認証に失敗しました",
    PERMISSION: "権限が不足しています",
    VALIDATION: "入力データの検証に失敗しました",
    NETWORK: "ネットワークエラーが発生しました",
    INTERNAL: "内部エラーが発生しました",
    UNKNOWN: "予期しないエラーが発生しました",
  };

  return messages[type];
}

/**
 * デフォルトの解決策を生成
 */
export function getDefaultResolution(type: ErrorType): string {
  const resolutions: Record<ErrorType, string> = {
    GITHUB_API: "しばらく待ってから再試行してください。問題が続く場合はGitHubのステータスを確認してください。",
    GITHUB_WEBHOOK: "Webhookの設定を確認してください。",
    AI_GENERATION: "しばらく待ってから再試行してください。",
    DATABASE: "しばらく待ってから再試行してください。問題が続く場合はサポートにお問い合わせください。",
    RATE_LIMIT: "しばらく待ってから再試行してください。",
    AUTHENTICATION: "認証情報を確認し、必要に応じてアプリを再インストールしてください。",
    PERMISSION: "必要な権限が付与されているか確認してください。",
    VALIDATION: "入力データを確認して再試行してください。",
    NETWORK: "ネットワーク接続を確認して再試行してください。",
    INTERNAL: "しばらく待ってから再試行してください。問題が続く場合はサポートにお問い合わせください。",
    UNKNOWN: "しばらく待ってから再試行してください。問題が続く場合はサポートにお問い合わせください。",
  };

  return resolutions[type];
}
