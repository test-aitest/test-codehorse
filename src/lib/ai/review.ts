import { generateText } from "ai";
import { MODEL_CONFIG } from "./client";
import {
  ReviewResultSchema,
  type ReviewResult,
  filterByRelevanceScore,
  RELEVANCE_CONFIG,
} from "./schemas";
import { REVIEW_SYSTEM_PROMPT, buildReviewPrompt, buildSummaryComment, formatInlineComment } from "./prompts";
import type { ParsedFile } from "../diff/types";
import { countTokens, truncateToTokenLimit } from "../tokenizer";
import type { AdaptiveContext } from "./memory/types";
import {
  applyReflection,
  isReflectionEnabled,
  formatReflectionSummary,
  type ReflectionResult,
} from "./reflection";
import { repairAndParseJSON, formatRepairSummary } from "./parser";

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
  // 反省結果（反省が実行された場合）
  reflection?: ReflectionResult;
  reflectionApplied: boolean;
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
      "relevanceScore": 関連性スコア（1-10の数値、必須）,
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
- 行番号は含めず、コードのみを記述してください

### 関連性スコア（relevanceScore）について
- 各コメントに1-10のスコアを必ず付けてください
- 9-10: 必須の修正（セキュリティ、バグ）
- 7-8: 推奨の修正（パフォーマンス、設計）
- 5-6: 参考程度（可読性、軽微な改善）
- 1-4: 非常に軽微または関係ない指摘`;

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

  // JSONをパース（多段階修復付き）
  let result: ReviewResult;
  const repairResult = repairAndParseJSON(text, ReviewResultSchema);

  if (repairResult.success && repairResult.data) {
    result = repairResult.data;
    if (repairResult.repairStrategy) {
      console.log(`[AI Review] JSON repaired using strategy: ${repairResult.repairStrategy}`);
    }
  } else {
    console.error("[AI Review] Failed to parse response after all repair attempts");
    console.error("[AI Review] Response text (first 500 chars):", text.slice(0, 500));
    console.error("[AI Review] Response text (last 500 chars):", text.slice(-500));
    console.error("[AI Review] Repair summary:\n", formatRepairSummary(repairResult));

    // フォールバック: 最小限のレビュー結果を返す
    result = {
      summary: `レビュー生成中にパースエラーが発生しました。${repairResult.attempts.length}回の修復を試みましたが失敗しました。`,
      walkthrough: files.map(f => ({
        path: f.newPath,
        summary: `${f.type} changes`,
        changeType: f.type,
      })),
      comments: [],
    };
  }

  // 反省プロセスを適用（有効な場合）
  let filteredComments = result.comments;
  let reflectionResult: ReflectionResult | undefined;
  let reflectionApplied = false;

  if (isReflectionEnabled() && result.comments.length > 0) {
    console.log("[AI Review] Applying self-reflection...");
    try {
      const reflectionOutput = await applyReflection({
        prTitle,
        prBody,
        diffContent: truncatedDiff,
        comments: result.comments,
      });

      if (reflectionOutput.filtered) {
        filteredComments = reflectionOutput.comments;
        reflectionResult = reflectionOutput.reflection;
        reflectionApplied = true;
        console.log(`[AI Review] Reflection filtered ${result.comments.length - filteredComments.length} comments`);
      }
    } catch (reflectionError) {
      console.warn("[AI Review] Reflection failed, using original comments:", reflectionError);
    }
  }

  // 関連性スコアでフィルタリング（Phase 4）
  if (filteredComments.length > 0) {
    const scoreFilter = filterByRelevanceScore(filteredComments, RELEVANCE_CONFIG.minScore);
    const filteredByScore = filteredComments.length - scoreFilter.accepted.length;

    if (filteredByScore > 0) {
      console.log(`[AI Review] Relevance score filtered ${filteredByScore} comments (minScore: ${RELEVANCE_CONFIG.minScore})`);
    }

    filteredComments = scoreFilter.accepted;
  }

  // サマリーコメント生成
  const criticalCount = filteredComments.filter((c) => c.severity === "CRITICAL").length;
  const importantCount = filteredComments.filter((c) => c.severity === "IMPORTANT").length;

  let summaryContent = result.summary;
  // 反省結果がある場合はサマリーに追加
  if (reflectionResult && reflectionApplied) {
    summaryContent += `\n\n${formatReflectionSummary(reflectionResult)}`;
  }

  const summaryComment = buildSummaryComment({
    summary: summaryContent,
    walkthrough: result.walkthrough,
    diagram: result.diagram,
    commentsCount: filteredComments.length,
    criticalCount,
    importantCount,
  });

  // インラインコメントをフォーマット
  const inlineComments = filteredComments.map((comment) => ({
    path: comment.path,
    endLine: comment.endLine,
    startLine: comment.startLine,
    body: formatInlineComment({
      body: comment.body,
      severity: comment.severity,
      suggestion: comment.suggestion,
      relevanceScore: comment.relevanceScore,
      relevanceCategory: comment.relevanceCategory,
    }),
    severity: comment.severity,
  }));

  return {
    result: {
      ...result,
      comments: filteredComments, // フィルタリング後のコメントを反映
    },
    summaryComment,
    inlineComments,
    tokenCount: totalTokens,
    reflection: reflectionResult,
    reflectionApplied,
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
