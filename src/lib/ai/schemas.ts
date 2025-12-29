import { z } from "zod";

// ========================================
// pr-agent方式: 柔軟なスキーマ定義
// - null/undefined/欠落を適切に処理
// - デフォルト値でグレースフルデグレード
// ========================================

// レビューコメントの深刻度
export const SeveritySchema = z.enum([
  "CRITICAL",
  "IMPORTANT",
  "INFO",
  "NITPICK",
]);
export type Severity = z.infer<typeof SeveritySchema>;

// 関連性カテゴリ
export const RelevanceCategorySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type RelevanceCategory = z.infer<typeof RelevanceCategorySchema>;

// ========================================
// pr-agent方式: 柔軟なフィールド定義ヘルパー
// ========================================

/**
 * 数値フィールド: null/undefined → null として処理
 */
const nullableNumber = z.preprocess(
  (val) => (val === null || val === undefined ? null : val),
  z.number().nullable()
);

/**
 * 文字列フィールド: null/undefined → 空文字列
 */
const stringWithEmptyDefault = z.preprocess(
  (val) => (val === null || val === undefined ? "" : val),
  z.string()
);

/**
 * 関連性スコア: null/undefined/範囲外 → デフォルト5
 */
const relevanceScoreSchema = z.preprocess((val) => {
  if (val === null || val === undefined) return 5;
  const num = typeof val === "number" ? val : parseInt(String(val), 10);
  if (isNaN(num)) return 5;
  // 範囲を1-10に制限
  return Math.max(1, Math.min(10, num));
}, z.number().min(1).max(10));

/**
 * 関連性カテゴリ: null/undefined → スコアから自動計算
 */
const relevanceCategorySchema = z.preprocess((val) => {
  if (val === "HIGH" || val === "MEDIUM" || val === "LOW") return val;
  return "LOW"; // デフォルト
}, RelevanceCategorySchema);

/**
 * 深刻度: null/undefined → INFO
 * テストのため
 */
const severityWithDefault = z.preprocess((val) => {
  if (
    val === "CRITICAL" ||
    val === "IMPORTANT" ||
    val === "INFO" ||
    val === "NITPICK"
  ) {
    return val;
  }
  return "INFO"; // デフォルト
}, SeveritySchema);

// インラインコメント（pr-agent方式: 柔軟な検証）
export const InlineCommentSchema = z.object({
  path: z.string().describe("ファイルパス"),
  endLine: z.number().describe("コメント対象の終了行番号"),
  startLine: nullableNumber.describe(
    "複数行コメントの開始行番号（単一行の場合はnull）"
  ),
  body: z.string().describe("コメント内容（Markdown形式）"),
  severity: severityWithDefault.describe("問題の深刻度"),
  suggestion: stringWithEmptyDefault.describe(
    "修正後のコード（行番号なし、純粋なコードのみ。提案がない場合は空文字列）"
  ),
  suggestionStartLine: nullableNumber.describe(
    "修正対象の開始行番号（suggestionが空の場合はnull）"
  ),
  suggestionEndLine: nullableNumber.describe(
    "修正対象の終了行番号（suggestionが空の場合はnull）"
  ),
  // 関連性スコアリング（Phase 4）- デフォルト値付き
  relevanceScore: relevanceScoreSchema.describe("提案の関連性スコア（1-10）"),
  relevanceCategory: relevanceCategorySchema.describe(
    "関連性カテゴリ（HIGH/MEDIUM/LOW）"
  ),
});
export type InlineComment = z.infer<typeof InlineCommentSchema>;

// ========================================
// 関連性スコアリング ユーティリティ
// ========================================

// スコアリング設定
export const RELEVANCE_CONFIG = {
  // フィルタリング閾値
  minScore: parseInt(process.env.AI_RELEVANCE_MIN_SCORE || "5", 10),
  // カテゴリ閾値
  highThreshold: 9, // 9-10 = HIGH
  mediumThreshold: 7, // 7-8 = MEDIUM
  // LOW = 1-6
} as const;

/**
 * スコアからカテゴリを導出
 */
export function getRelevanceCategory(score: number): RelevanceCategory {
  if (score >= RELEVANCE_CONFIG.highThreshold) return "HIGH";
  if (score >= RELEVANCE_CONFIG.mediumThreshold) return "MEDIUM";
  return "LOW";
}

/**
 * コメントをスコアでフィルタリング
 */
export function filterByRelevanceScore(
  comments: InlineComment[],
  minScore: number = RELEVANCE_CONFIG.minScore
): {
  accepted: InlineComment[];
  filtered: InlineComment[];
} {
  const accepted: InlineComment[] = [];
  const filtered: InlineComment[] = [];

  for (const comment of comments) {
    if (comment.relevanceScore >= minScore) {
      accepted.push(comment);
    } else {
      filtered.push(comment);
    }
  }

  return { accepted, filtered };
}

// ファイルサマリー
export const FileSummarySchema = z.object({
  path: z.string().describe("ファイルパス"),
  summary: z.string().describe("変更内容の要約"),
  changeType: z
    .enum(["add", "modify", "delete", "rename"])
    .describe("変更タイプ"),
});
export type FileSummary = z.infer<typeof FileSummarySchema>;

// レビュー結果全体
export const ReviewResultSchema = z.object({
  summary: z.string().describe("PRの変更内容の総合的なサマリー（1-3段落）"),
  walkthrough: z.array(FileSummarySchema).describe("各ファイルの変更概要"),
  comments: z.array(InlineCommentSchema).describe("インラインコメントのリスト"),
  diagram: z
    .string()
    .nullish()
    .describe("変更のアーキテクチャ図（Mermaid形式）"),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// 増分レビュー用
export const IncrementalReviewResultSchema = z.object({
  summary: z.string().describe("増分変更のサマリー"),
  comments: z.array(InlineCommentSchema).describe("新規コメントのリスト"),
  resolvedIssues: z
    .array(z.string())
    .optional()
    .describe("解決された問題のリスト"),
});
export type IncrementalReviewResult = z.infer<
  typeof IncrementalReviewResultSchema
>;

// チャット応答用
export const ChatResponseSchema = z.object({
  response: z.string().describe("ユーザーへの回答（Markdown形式）"),
  codeSnippets: z
    .array(
      z.object({
        language: z.string(),
        code: z.string(),
        explanation: z.string().optional(),
      })
    )
    .optional()
    .describe("コード例"),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
