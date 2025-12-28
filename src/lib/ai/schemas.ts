import { z } from "zod";

// レビューコメントの深刻度
export const SeveritySchema = z.enum(["CRITICAL", "IMPORTANT", "INFO", "NITPICK"]);
export type Severity = z.infer<typeof SeveritySchema>;

// 関連性カテゴリ
export const RelevanceCategorySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type RelevanceCategory = z.infer<typeof RelevanceCategorySchema>;

// インラインコメント
export const InlineCommentSchema = z.object({
  path: z.string().describe("ファイルパス"),
  endLine: z.number().describe("コメント対象の終了行番号"),
  startLine: z.number().optional().describe("複数行コメントの開始行番号（省略時はendLineと同じ）"),
  body: z.string().describe("コメント内容（Markdown形式）"),
  severity: SeveritySchema.describe("問題の深刻度"),
  suggestion: z.string().optional().describe("修正後のコード（行番号なし、純粋なコードのみ）"),
  suggestionStartLine: z.number().optional().describe("修正対象の開始行番号"),
  suggestionEndLine: z.number().optional().describe("修正対象の終了行番号"),
  // 関連性スコアリング（Phase 4）
  relevanceScore: z.number().min(1).max(10).optional().describe("提案の関連性スコア（1-10）"),
  relevanceCategory: RelevanceCategorySchema.optional().describe("関連性カテゴリ（HIGH/MEDIUM/LOW）"),
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
  highThreshold: 9,   // 9-10 = HIGH
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
 * コメントにカテゴリを付与（スコアが存在する場合）
 */
export function enrichCommentWithCategory(comment: InlineComment): InlineComment {
  if (comment.relevanceScore !== undefined && comment.relevanceCategory === undefined) {
    return {
      ...comment,
      relevanceCategory: getRelevanceCategory(comment.relevanceScore),
    };
  }
  return comment;
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
    // スコアが無い場合は採用（後方互換性）
    if (comment.relevanceScore === undefined) {
      accepted.push(enrichCommentWithCategory(comment));
      continue;
    }

    if (comment.relevanceScore >= minScore) {
      accepted.push(enrichCommentWithCategory(comment));
    } else {
      filtered.push(enrichCommentWithCategory(comment));
    }
  }

  return { accepted, filtered };
}

// ファイルサマリー
export const FileSummarySchema = z.object({
  path: z.string().describe("ファイルパス"),
  summary: z.string().describe("変更内容の要約"),
  changeType: z.enum(["add", "modify", "delete", "rename"]).describe("変更タイプ"),
});
export type FileSummary = z.infer<typeof FileSummarySchema>;

// レビュー結果全体
export const ReviewResultSchema = z.object({
  summary: z.string().describe("PRの変更内容の総合的なサマリー（1-3段落）"),
  walkthrough: z.array(FileSummarySchema).describe("各ファイルの変更概要"),
  comments: z.array(InlineCommentSchema).describe("インラインコメントのリスト"),
  diagram: z.string().nullish().describe("変更のアーキテクチャ図（Mermaid形式）"),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// 増分レビュー用
export const IncrementalReviewResultSchema = z.object({
  summary: z.string().describe("増分変更のサマリー"),
  comments: z.array(InlineCommentSchema).describe("新規コメントのリスト"),
  resolvedIssues: z.array(z.string()).optional().describe("解決された問題のリスト"),
});
export type IncrementalReviewResult = z.infer<typeof IncrementalReviewResultSchema>;

// チャット応答用
export const ChatResponseSchema = z.object({
  response: z.string().describe("ユーザーへの回答（Markdown形式）"),
  codeSnippets: z.array(z.object({
    language: z.string(),
    code: z.string(),
    explanation: z.string().optional(),
  })).optional().describe("コード例"),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
