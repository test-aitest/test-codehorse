import { generateText } from "ai";
import { MODEL_CONFIG } from "./client";
import { ReviewResultSchema, type ReviewResult } from "./schemas";
import { REVIEW_SYSTEM_PROMPT, buildReviewPrompt, buildSummaryComment, formatInlineComment } from "./prompts";
import type { ParsedFile } from "../diff/types";
import { countTokens, truncateToTokenLimit } from "../tokenizer";
import type { AdaptiveContext } from "./memory/types";

// レビュー生成の最大入力トークン数
const MAX_INPUT_TOKENS = 100000;

export interface GenerateReviewParams {
  prTitle: string;
  prBody: string;
  files: ParsedFile[];
  diffContent: string;
  ragContext?: string;
  adaptiveContext?: AdaptiveContext;
}

export interface GeneratedReview {
  result: ReviewResult;
  summaryComment: string;
  inlineComments: Array<{
    path: string;
    endLine: number;     // コメント対象の終了行番号
    startLine?: number;  // 複数行コメント用の開始行番号
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
      "endLine": 終了行番号,
      "startLine": 開始行番号（複数行の場合のみ、省略可）,
      "body": "コメント内容（Markdown形式）",
      "severity": "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
      "suggestion": "修正後のコード（行番号なし、純粋なコードのみ）",
      "suggestionStartLine": 修正開始行,
      "suggestionEndLine": 修正終了行
    }
  ],
  "diagram": "Mermaidダイアグラム（任意）"
}
\`\`\`

### 修正提案について
- suggestionフィールドには、置き換えるコードを記述してください
- suggestionStartLine/suggestionEndLineで修正対象の行範囲を指定してください
- 複数行の修正は改行で区切って記述してください
- 行番号は含めず、コードのみを記述してください`;

/**
 * AIレビューを生成
 */
export async function generateReview(params: GenerateReviewParams): Promise<GeneratedReview> {
  const { prTitle, prBody, files, diffContent, ragContext, adaptiveContext } = params;

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
    adaptiveContext,
  }) + JSON_OUTPUT_INSTRUCTION;

  const totalTokens = countTokens(REVIEW_SYSTEM_PROMPT + prompt);
  console.log(`[AI Review] Input tokens: ${totalTokens}`);

  // AI生成
  let text: string;
  try {
    const response = await generateText({
      model: MODEL_CONFIG.review.model,
      system: REVIEW_SYSTEM_PROMPT,
      prompt,
      temperature: MODEL_CONFIG.review.temperature,
    });
    text = response.text;
    console.log(`[AI Review] Response received, length: ${text.length}`);
  } catch (apiError) {
    console.error("[AI Review] API call failed:", apiError);
    throw new Error(`AI API call failed: ${(apiError as Error).message}`);
  }

  // JSONをパース
  let result: ReviewResult;
  try {
    // JSONブロックを抽出（マークダウンコードブロックから）
    let jsonStr = text;

    // ```json ... ``` または ``` ... ``` からJSON抽出
    const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonStr = codeBlockMatch[1].trim();
      console.log("[AI Review] Extracted JSON from code block");
    } else {
      // 生のJSONオブジェクトを検索
      const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonStr = jsonObjectMatch[0];
        console.log("[AI Review] Extracted raw JSON object");
      }
    }

    const parsed = JSON.parse(jsonStr);
    result = ReviewResultSchema.parse(parsed);
  } catch (error) {
    console.error("[AI Review] Failed to parse response");
    console.error("[AI Review] Response text (first 500 chars):", text.slice(0, 500));
    console.error("[AI Review] Response text (last 500 chars):", text.slice(-500));
    console.error("[AI Review] Parse error:", (error as Error).message);
    // フォールバック: 最小限のレビュー結果を返す
    result = {
      summary: `レビュー生成中にエラーが発生しました: ${(error as Error).message}`,
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
    endLine: comment.endLine,
    startLine: comment.startLine,
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

// GitHub API用コメント型
export interface GitHubReviewComment {
  path: string;
  line: number;
  start_line?: number;
  side: "RIGHT";
  start_side?: "RIGHT";
  body: string;
}

/**
 * レビュー結果をGitHub API用にフォーマット
 * すべてのコメントをインラインコメントとして投稿
 * 複数行コメントはstart_line/start_sideを使用
 */
export function formatForGitHubReview(review: GeneratedReview): {
  body: string;
  comments: GitHubReviewComment[];
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
} {
  const hasCritical = review.inlineComments.some((c) => c.severity === "CRITICAL");

  // イベントタイプを決定（CRITICALがある場合は変更要求）
  const event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = hasCritical
    ? "REQUEST_CHANGES"
    : "COMMENT";

  // すべてのコメントをインラインコメントとして投稿
  // GitHub APIは`line`を期待するため、内部の`endLine`を`line`に変換
  const comments: GitHubReviewComment[] = review.inlineComments.map((c) => {
    const comment: GitHubReviewComment = {
      path: c.path,
      line: c.endLine,  // endLineをGitHub APIのlineにマッピング
      side: "RIGHT",
      body: c.body,
    };

    // 複数行コメントの場合はstart_lineとstart_sideを追加
    if (c.startLine && c.startLine !== c.endLine) {
      comment.start_line = c.startLine;
      comment.start_side = "RIGHT";
    }

    return comment;
  });

  return {
    body: review.summaryComment,
    comments,
    event,
  };
}
