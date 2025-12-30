/**
 * AI Review Constants
 * 定数定義の一元化
 */

// ========================================
// 深刻度 (Severity) 定義
// ========================================

/** 深刻度の値 */
export const SEVERITIES = ["CRITICAL", "IMPORTANT", "INFO", "NITPICK"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** 深刻度の優先度順序（高い方が優先） */
export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  IMPORTANT: 3,
  INFO: 2,
  NITPICK: 1,
};

/** 深刻度に対応する絵文字 */
export const SEVERITY_EMOJI: Record<Severity, string> = {
  CRITICAL: "🔴",
  IMPORTANT: "🟠",
  INFO: "🔵",
  NITPICK: "⚪",
};

/** デフォルトの深刻度 */
export const DEFAULT_SEVERITY: Severity = "INFO";

// ========================================
// 関連性カテゴリ (Relevance) 定義
// ========================================

/** 関連性カテゴリの値 */
export const RELEVANCE_CATEGORIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type RelevanceCategory = (typeof RELEVANCE_CATEGORIES)[number];

/** 関連性カテゴリに対応する絵文字 */
export const RELEVANCE_EMOJI: Record<RelevanceCategory, string> = {
  HIGH: "⬆️",
  MEDIUM: "➡️",
  LOW: "⬇️",
};

/** 関連性スコアの閾値 */
export const RELEVANCE_THRESHOLDS = {
  HIGH: 9, // 9-10 = HIGH
  MEDIUM: 7, // 7-8 = MEDIUM
  // LOW = 1-6
} as const;

/** デフォルトの関連性スコア */
export const DEFAULT_RELEVANCE_SCORE = 5;

/** 最小関連性スコア（環境変数で上書き可能） */
export const getMinRelevanceScore = (): number =>
  parseInt(process.env.AI_RELEVANCE_MIN_SCORE || "5", 10);

// ========================================
// レビュー設定
// ========================================

/** 最大入力トークン数 */
export const MAX_INPUT_TOKENS = 100000;

/** 予約トークン数（出力用） */
export const RESERVED_OUTPUT_TOKENS = 1000;

/** 反省プロセスのデフォルト閾値 */
export const DEFAULT_REFLECTION_THRESHOLD = 7;

/** 反省プロセスの閾値を取得（環境変数で上書き可能） */
export const getReflectionThreshold = (): number =>
  parseInt(process.env.AI_REFLECTION_THRESHOLD || String(DEFAULT_REFLECTION_THRESHOLD), 10);

/** 重複排除の類似度閾値 */
export const getDuplicateSimilarityThreshold = (): number =>
  parseFloat(process.env.AI_DEDUP_SIMILARITY_THRESHOLD || "0.8");

/** JSON修復の最大試行回数 */
export const JSON_REPAIR_MAX_ITERATIONS = 10;

/** コメント位置調整の許容範囲（行数） */
export const COMMENT_ADJUSTMENT_TOLERANCE = 10;

/** キーワード抽出の最大数 */
export const MAX_KEYWORDS = 20;
