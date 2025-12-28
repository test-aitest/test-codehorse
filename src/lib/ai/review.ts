import { generateText, Output } from "ai";
import { MODEL_CONFIG } from "./client";
import { ReviewResultSchema, type ReviewResult } from "./schemas";
import {
  REVIEW_SYSTEM_PROMPT,
  buildReviewPrompt,
  buildSummaryComment,
  formatInlineComment,
} from "./prompts";
import type { ParsedFile } from "../diff/types";
import { countTokens, truncateToTokenLimit } from "../tokenizer";

// レビュー生成の最大入力トークン数
const MAX_INPUT_TOKENS = 100000;

export interface GenerateReviewParams {
  prTitle: string;
  prBody: string;
  files: ParsedFile[];
  diffContent: string;
  ragContext?: string;
}

export interface GeneratedReview {
  result: ReviewResult;
  summaryComment: string;
  inlineComments: Array<{
    path: string;
    line: number;
    body: string;
    severity: string;
  }>;
  tokenCount: number;
}

// JSON出力を要求するプロンプト拡張
const JSON_OUTPUT_INSTRUCTION = `

---
【必須】以下のJSON形式のみで出力してください。説明文やMarkdownは禁止です。
---

{
  "summary": "PRの変更内容の総合的なサマリー（日本語）",
  "walkthrough": [
    { "path": "ファイルパス", "summary": "変更内容の要約", "changeType": "add" }
  ],
  "comments": [
    { "path": "ファイルパス", "line": 10, "body": "コメント内容", "severity": "INFO" }
  ]
}

- changeType: "add" | "modify" | "delete" | "rename"
- severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK"
- suggestion: 修正コードがある場合のみ追加（省略可）
- diagram: Mermaid図がある場合のみ追加（省略可）
- nullは使用禁止、不要なフィールドは省略`;

/**
 * AIレビューを生成
 */
export async function generateReview(
  params: GenerateReviewParams
): Promise<GeneratedReview> {
  const { prTitle, prBody, files, diffContent, ragContext } = params;

  // トークン数を計算し、必要に応じて切り詰め
  let truncatedDiff = diffContent;
  const baseTokens =
    countTokens(REVIEW_SYSTEM_PROMPT) +
    countTokens(prTitle) +
    countTokens(prBody || "");
  const ragTokens = ragContext ? countTokens(ragContext) : 0;
  const availableTokens = MAX_INPUT_TOKENS - baseTokens - ragTokens - 1000; // 余裕を持たせる

  if (countTokens(diffContent) > availableTokens) {
    console.warn(
      `[AI Review] Diff truncated from ${countTokens(
        diffContent
      )} to ${availableTokens} tokens`
    );
    truncatedDiff = truncateToTokenLimit(diffContent, availableTokens);
  }

  // プロンプト構築
  const prompt =
    buildReviewPrompt({
      prTitle,
      prBody,
      files,
      diffContent: truncatedDiff,
      ragContext,
    }) + JSON_OUTPUT_INSTRUCTION;

  const totalTokens = countTokens(REVIEW_SYSTEM_PROMPT + prompt);
  console.log(`[AI Review] Input tokens: ${totalTokens}`);

  // AI生成（構造化出力を使用）
  let result: ReviewResult;
  try {
    const response = await generateText({
      model: MODEL_CONFIG.review.model,
      system: REVIEW_SYSTEM_PROMPT,
      prompt,
      temperature: MODEL_CONFIG.review.temperature,
      output: Output.object({
        schema: ReviewResultSchema,
      }),
    });

    const output = response.output;
    if (!output) {
      throw new Error("No structured output received from AI");
    }

    result = output;
    console.log(
      `[AI Review] Generated review with ${result.comments.length} comments`
    );
  } catch (apiError) {
    console.error("[AI Review] API call failed:", apiError);
    // フォールバック: 最小限のレビュー結果を返す
    result = {
      summary: `レビュー生成中にエラーが発生しました: ${
        (apiError as Error).message
      }`,
      walkthrough: files.map((f) => ({
        path: f.newPath,
        summary: `${f.type} changes`,
        changeType: f.type,
      })),
      comments: [],
    };
  }

  // サマリーコメント生成
  const criticalCount = result.comments.filter(
    (c) => c.severity === "CRITICAL"
  ).length;
  const importantCount = result.comments.filter(
    (c) => c.severity === "IMPORTANT"
  ).length;

  const summaryComment = buildSummaryComment({
    summary: result.summary,
    walkthrough: result.walkthrough,
    diagram: result.diagram,
    commentsCount: result.comments.length,
    criticalCount,
    importantCount,
  });

  // インラインコメントをフォーマット
  const inlineComments = result.comments.map((comment) => ({
    path: comment.path,
    line: comment.line,
    body: formatInlineComment({
      body: comment.body,
      severity: comment.severity,
      suggestion: comment.suggestion,
    }),
    severity: comment.severity,
  }));

  return {
    result,
    summaryComment,
    inlineComments,
    tokenCount: totalTokens,
  };
}

/**
 * レビュー結果をGitHub API用にフォーマット
 * すべてのコメントをインラインコメントとして投稿
 */
export function formatForGitHubReview(review: GeneratedReview): {
  body: string;
  comments: Array<{ path: string; line: number; side: "RIGHT"; body: string }>;
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
} {
  const hasCritical = review.inlineComments.some(
    (c) => c.severity === "CRITICAL"
  );

  // イベントタイプを決定（CRITICALがある場合は変更要求）
  const event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = hasCritical
    ? "REQUEST_CHANGES"
    : "COMMENT";

  // すべてのコメントをインラインコメントとして投稿
  const comments = review.inlineComments.map((c) => ({
    path: c.path,
    line: c.line,
    side: "RIGHT" as const,
    body: c.body,
  }));

  return {
    body: review.summaryComment,
    comments,
    event,
  };
}
