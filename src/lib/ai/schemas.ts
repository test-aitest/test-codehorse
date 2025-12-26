import { z } from "zod";

// レビューコメントの深刻度
export const SeveritySchema = z.enum(["CRITICAL", "IMPORTANT", "INFO", "NITPICK"]);
export type Severity = z.infer<typeof SeveritySchema>;

// インラインコメント
export const InlineCommentSchema = z.object({
  path: z.string().describe("ファイルパス"),
  line: z.number().describe("コメント対象の行番号"),
  body: z.string().describe("コメント内容（Markdown形式）"),
  severity: SeveritySchema.describe("問題の深刻度"),
  suggestion: z.string().optional().describe("修正提案（コードブロック形式）"),
});
export type InlineComment = z.infer<typeof InlineCommentSchema>;

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
  diagram: z.string().optional().describe("変更のアーキテクチャ図（Mermaid形式）"),
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
