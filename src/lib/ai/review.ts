import { generateText } from "ai";
import { MODEL_CONFIG } from "./client";
import { ReviewResultSchema, type ReviewResult } from "./schemas";
import { REVIEW_SYSTEM_PROMPT, buildReviewPrompt, buildSummaryComment, formatInlineComment } from "./prompts";
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

## 出力形式

必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは含めないでください。

\`\`\`json
{
  "summary": "PRの変更内容の総合的なサマリー（1-3段落）",
  "walkthrough": [
    {
      "path": "ファイルパス",
      "summary": "変更内容の要約",
      "changeType": "add" | "modify" | "delete" | "rename"
    }
  ],
  "comments": [
    {
      "path": "ファイルパス",
      "line": 行番号,
      "body": "コメント内容（Markdown形式）",
      "severity": "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
      "suggestion": "修正提案（任意）"
    }
  ],
  "diagram": "Mermaidダイアグラム（任意）"
}
\`\`\``;

/**
 * AIレビューを生成
 */
export async function generateReview(params: GenerateReviewParams): Promise<GeneratedReview> {
  const { prTitle, prBody, files, diffContent, ragContext } = params;

  // トークン数を計算し、必要に応じて切り詰め
  let truncatedDiff = diffContent;
  const baseTokens = countTokens(REVIEW_SYSTEM_PROMPT) + countTokens(prTitle) + countTokens(prBody || "");
  const ragTokens = ragContext ? countTokens(ragContext) : 0;
  const availableTokens = MAX_INPUT_TOKENS - baseTokens - ragTokens - 1000; // 余裕を持たせる

  if (countTokens(diffContent) > availableTokens) {
    console.warn(`[AI Review] Diff truncated from ${countTokens(diffContent)} to ${availableTokens} tokens`);
    truncatedDiff = truncateToTokenLimit(diffContent, availableTokens);
  }

  // プロンプト構築
  const prompt = buildReviewPrompt({
    prTitle,
    prBody,
    files,
    diffContent: truncatedDiff,
    ragContext,
  }) + JSON_OUTPUT_INSTRUCTION;

  const totalTokens = countTokens(REVIEW_SYSTEM_PROMPT + prompt);
  console.log(`[AI Review] Input tokens: ${totalTokens}`);

  // AI生成
  const { text } = await generateText({
    model: MODEL_CONFIG.review.model,
    system: REVIEW_SYSTEM_PROMPT,
    prompt,
    temperature: MODEL_CONFIG.review.temperature,
  });

  // JSONをパース
  let result: ReviewResult;
  try {
    // JSONブロックを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    const parsed = JSON.parse(jsonStr);
    result = ReviewResultSchema.parse(parsed);
  } catch (error) {
    console.error("[AI Review] Failed to parse response:", text);
    // フォールバック: 最小限のレビュー結果を返す
    result = {
      summary: "レビュー生成中にエラーが発生しました。再試行してください。",
      walkthrough: files.map(f => ({
        path: f.newPath,
        summary: `${f.type} changes`,
        changeType: f.type,
      })),
      comments: [],
    };
  }

  // サマリーコメント生成
  const criticalCount = result.comments.filter((c) => c.severity === "CRITICAL").length;
  const importantCount = result.comments.filter((c) => c.severity === "IMPORTANT").length;

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
 */
export function formatForGitHubReview(review: GeneratedReview): {
  body: string;
  comments: Array<{ path: string; position?: number; line?: number; body: string }>;
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
} {
  const hasCritical = review.inlineComments.some((c) => c.severity === "CRITICAL");

  // イベントタイプを決定（CRITICALがある場合は変更要求）
  const event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = hasCritical
    ? "REQUEST_CHANGES"
    : "COMMENT";

  // コメントをGitHub形式に変換
  const comments = review.inlineComments.map((c) => ({
    path: c.path,
    line: c.line,
    body: c.body,
  }));

  return {
    body: review.summaryComment,
    comments,
    event,
  };
}
