/**
 * Phase 1: Comment Persistence Types
 *
 * インテリジェントコメント永続化システムの型定義
 */

import type { Severity, ResolutionType } from "@prisma/client";

// ========================================
// フィンガープリント関連
// ========================================

/** フィンガープリント生成の入力 */
export interface FingerprintInput {
  /** コメント本文 */
  body: string;
  /** カテゴリ（security, performance, style等） */
  category?: string;
  /** パターンタイプ（より細かい分類） */
  patternType?: string;
  /** 重要度 */
  severity?: Severity;
}

/** フィンガープリント生成の結果 */
export interface FingerprintResult {
  /** ハッシュ値 */
  hash: string;
  /** 正規化されたコンテンツ */
  normalizedContent: string;
  /** 抽出されたキーワード */
  keywords: string[];
  /** カテゴリ（自動検出含む） */
  category: string;
  /** パターンタイプ（自動検出含む） */
  patternType: string;
}

/** コメントの類似度情報 */
export interface SimilarityInfo {
  /** フィンガープリントID */
  fingerprintId: string;
  /** 類似度スコア (0.0 - 1.0) */
  score: number;
  /** 元のコメント本文（最初の発生時） */
  originalBody: string;
  /** 発生回数 */
  occurrenceCount: number;
  /** 最終発生日時 */
  lastSeenAt: Date;
  /** 解決済みかどうか */
  isResolved: boolean;
  /** ユーザーが認識済みかどうか */
  isAcknowledged: boolean;
}

// ========================================
// コメント発生関連
// ========================================

/** コメント発生の入力 */
export interface CommentOccurrenceInput {
  /** リポジトリID */
  repositoryId: string;
  /** レビューID */
  reviewId: string;
  /** PRのID */
  pullRequestId?: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber: number;
  /** コメント本文 */
  commentBody: string;
  /** 重要度 */
  severity?: Severity;
  /** カテゴリ */
  category?: string;
  /** パターンタイプ */
  patternType?: string;
}

/** 記録されたコメント発生 */
export interface RecordedOccurrence {
  /** 発生ID */
  occurrenceId: string;
  /** フィンガープリントID */
  fingerprintId: string;
  /** 新規フィンガープリントかどうか */
  isNewFingerprint: boolean;
  /** 以前の発生回数 */
  previousOccurrenceCount: number;
  /** 解決済みだった問題が再発したかどうか */
  wasReintroduced: boolean;
}

// ========================================
// 重複排除関連
// ========================================

/** 重複チェックの入力 */
export interface DeduplicationInput {
  /** リポジトリID */
  repositoryId: string;
  /** チェック対象のコメントリスト */
  comments: DeduplicationComment[];
  /** 類似度閾値 (0.0 - 1.0, デフォルト: 0.85) */
  similarityThreshold?: number;
  /** 解決済みコメントを含めるか */
  includeResolved?: boolean;
  /** 認識済みコメントを含めるか */
  includeAcknowledged?: boolean;
}

/** 重複チェック対象のコメント */
export interface DeduplicationComment {
  /** 一時的なID（重複排除後の識別用） */
  tempId: string;
  /** コメント本文 */
  body: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber: number;
  /** 重要度 */
  severity?: Severity;
  /** カテゴリ */
  category?: string;
}

/** 重複排除の結果 */
export interface DeduplicationResult {
  /** オリジナル（重複していない）コメント */
  originalComments: DeduplicationComment[];
  /** 重複として除外されたコメント */
  duplicates: DuplicateInfo[];
  /** 統計情報 */
  stats: DeduplicationStats;
}

/** 重複情報 */
export interface DuplicateInfo {
  /** 除外されたコメントのtempId */
  tempId: string;
  /** 重複元のフィンガープリントID */
  duplicateOfFingerprintId: string;
  /** 類似度スコア */
  similarityScore: number;
  /** 重複の理由 */
  reason: DuplicateReason;
}

/** 重複の理由 */
export type DuplicateReason =
  | "EXACT_MATCH"       // 完全一致
  | "HIGH_SIMILARITY"   // 高い類似度
  | "SAME_PATTERN"      // 同じパターン
  | "ACKNOWLEDGED"      // ユーザーが認識済み
  | "RECENTLY_REPORTED" // 最近報告された
  | "RESOLVED_ISSUE";   // 解決済みの問題

/** 重複排除の統計 */
export interface DeduplicationStats {
  /** 入力コメント数 */
  totalInput: number;
  /** オリジナルコメント数 */
  originalCount: number;
  /** 重複コメント数 */
  duplicateCount: number;
  /** 重複率 */
  duplicateRate: number;
  /** 理由別の内訳 */
  byReason: Record<DuplicateReason, number>;
}

// ========================================
// コメント解決関連
// ========================================

/** コメント解決の入力 */
export interface ResolutionInput {
  /** フィンガープリントID */
  fingerprintId: string;
  /** PRのID */
  pullRequestId: string;
  /** 解決タイプ */
  resolutionType: ResolutionType;
  /** 解決コミットのSHA */
  commitSha?: string;
}

/** ユーザーアクションの入力 */
export interface UserActionInput {
  /** 発生ID */
  occurrenceId: string;
  /** アクションタイプ */
  actionType: UserActionType;
  /** ユーザーの返信内容 */
  userResponse?: string;
}

/** ユーザーアクションの種類 */
export type UserActionType =
  | "ADDRESSED"    // 対処した
  | "IGNORED"      // 無視した
  | "ACKNOWLEDGED" // 認識した（後で対処）
  | "FEEDBACK";    // フィードバック送信

// ========================================
// 履歴クエリ関連
// ========================================

/** コメント履歴クエリのオプション */
export interface CommentHistoryQuery {
  /** リポジトリID */
  repositoryId: string;
  /** カテゴリでフィルタ */
  category?: string;
  /** パターンタイプでフィルタ */
  patternType?: string;
  /** 解決済みを含めるか */
  includeResolved?: boolean;
  /** 認識済みを含めるか */
  includeAcknowledged?: boolean;
  /** 無視されたものを含めるか */
  includeIgnored?: boolean;
  /** 期間フィルタ（開始） */
  since?: Date;
  /** 期間フィルタ（終了） */
  until?: Date;
  /** 最小発生回数 */
  minOccurrences?: number;
  /** 取得件数制限 */
  limit?: number;
  /** オフセット */
  offset?: number;
}

/** コメント履歴のエントリ */
export interface CommentHistoryEntry {
  /** フィンガープリントID */
  fingerprintId: string;
  /** フィンガープリントハッシュ */
  fingerprint: string;
  /** カテゴリ */
  category: string;
  /** パターンタイプ */
  patternType: string;
  /** 発生回数 */
  occurrenceCount: number;
  /** 初回発生日時 */
  firstSeenAt: Date;
  /** 最終発生日時 */
  lastSeenAt: Date;
  /** 解決済みかどうか */
  isResolved: boolean;
  /** 解決日時 */
  resolvedAt?: Date;
  /** 認識済みかどうか */
  isAcknowledged: boolean;
  /** 無視されたかどうか */
  isIgnored: boolean;
  /** 最新の発生場所 */
  latestOccurrences: {
    filePath: string;
    lineNumber: number;
    reviewId: string;
    commentBody: string;
    createdAt: Date;
  }[];
}

/** コメント履歴の統計 */
export interface CommentHistoryStats {
  /** 総フィンガープリント数 */
  totalFingerprints: number;
  /** 解決済み数 */
  resolvedCount: number;
  /** 未解決数 */
  unresolvedCount: number;
  /** 認識済み数 */
  acknowledgedCount: number;
  /** 無視された数 */
  ignoredCount: number;
  /** カテゴリ別の内訳 */
  byCategory: Record<string, number>;
  /** 最も頻繁に発生する問題トップ5 */
  topRecurringIssues: {
    fingerprintId: string;
    category: string;
    occurrenceCount: number;
  }[];
}

// ========================================
// 進行型重要度関連
// ========================================

/** 進行型重要度のレベル */
export type ProgressiveSeverityLevel =
  | "DETAILED"    // 初回：詳細な説明
  | "SUMMARY"     // 2回目以降：要約
  | "REFERENCE"   // 3回目以降：参照のみ
  | "SILENT";     // 多数回：表示しない

/** 進行型重要度の計算結果 */
export interface ProgressiveSeverity {
  /** 表示レベル */
  level: ProgressiveSeverityLevel;
  /** 発生回数 */
  occurrenceCount: number;
  /** 推奨されるコメント形式 */
  recommendedFormat: "full" | "brief" | "link" | "hidden";
  /** 追加コンテキスト */
  context?: string;
}

// ========================================
// 設定
// ========================================

/** コメント永続化の設定 */
export interface CommentPersistenceConfig {
  /** 類似度閾値 (0.0 - 1.0) */
  similarityThreshold: number;
  /** 進行型重要度を有効にするか */
  enableProgressiveSeverity: boolean;
  /** 詳細表示の最大回数 */
  maxDetailedOccurrences: number;
  /** 要約表示の最大回数 */
  maxSummaryOccurrences: number;
  /** 無視する最小発生回数 */
  minOccurrencesToIgnore: number;
  /** フィンガープリントの有効期限（日数） */
  fingerprintExpirationDays: number;
  /** Pinecone統合を有効にするか */
  enablePineconeIntegration: boolean;
}

/** デフォルト設定 */
export const DEFAULT_PERSISTENCE_CONFIG: CommentPersistenceConfig = {
  similarityThreshold: 0.85,
  enableProgressiveSeverity: true,
  maxDetailedOccurrences: 1,
  maxSummaryOccurrences: 3,
  minOccurrencesToIgnore: 10,
  fingerprintExpirationDays: 90,
  enablePineconeIntegration: false,
};
