import { generateText } from "ai";
import { MODEL_CONFIG } from "./client";
import {
  ReviewResultSchema,
  type ReviewResult,
  filterByRelevanceScore,
} from "./schemas";
import { getMinRelevanceScore, MAX_INPUT_TOKENS, RESERVED_OUTPUT_TOKENS } from "./constants";
import {
  REVIEW_SYSTEM_PROMPT,
  buildReviewPrompt,
  buildSummaryComment,
  formatInlineComment,
} from "./prompts";
import type { ParsedFile } from "../diff/types";
import { countTokens, truncateToTokenLimit } from "../tokenizer";
import type { AdaptiveContext } from "./memory/types";
import {
  applyReflection,
  isReflectionEnabled,
  formatReflectionSummary,
  type ReflectionResult,
} from "./reflection";
import { parseAndValidateJson } from "./json-utils";
import {
  isChunkingEnabled,
  createChunks,
  processChunksInParallel,
  buildChunkContext,
  mergeChunkResults,
  formatChunkingSummary,
  type DiffChunk,
  type ChunkReviewResult,
} from "./chunking";
import {
  deduplicateComments,
  isDeduplicationEnabled,
  formatDeduplicationSummary,
  type DeduplicationResult,
} from "./deduplication";

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
    endLine: number; // コメント対象の終了行番号
    startLine?: number; // 複数行コメント用の開始行番号
    body: string;
    severity: string;
  }>;
  tokenCount: number;
  // 反省結果（反省が実行された場合）
  reflection?: ReflectionResult;
  reflectionApplied: boolean;
  // チャンキング統計（チャンク処理された場合）
  chunkStats?: {
    totalChunks: number;
    successfulChunks: number;
    duplicatesRemoved: number;
  };
  // 重複除去統計（Phase 6）
  deduplicationStats?: {
    originalCount: number;
    finalCount: number;
    duplicatesRemoved: number;
  };
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

// ========================================
// 単一チャンク処理
// ========================================

/**
 * 単一チャンクのレビューを生成（内部関数）
 */
async function generateChunkReview(params: {
  prTitle: string;
  prBody: string;
  files: ParsedFile[];
  diffContent: string;
  ragContext?: string;
  adaptiveContext?: AdaptiveContext;
  chunkContext?: string;
}): Promise<{ result: ReviewResult; tokenCount: number }> {
  const {
    prTitle,
    prBody,
    files,
    diffContent,
    ragContext,
    adaptiveContext,
    chunkContext,
  } = params;

  // プロンプト構築
  let prompt = buildReviewPrompt({
    prTitle,
    prBody,
    files,
    diffContent,
    ragContext,
    adaptiveContext,
  });

  // チャンクコンテキストを追加
  if (chunkContext) {
    prompt += `\n${chunkContext}`;
  }

  prompt += JSON_OUTPUT_INSTRUCTION;

  const totalTokens = countTokens(REVIEW_SYSTEM_PROMPT + prompt);
  console.log(`[AI Review] Chunk input tokens: ${totalTokens}`);

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
    console.log(`[AI Review] Chunk response received, length: ${text.length}`);
  } catch (apiError) {
    console.error("[AI Review] Chunk API call failed:", apiError);
    throw new Error(`AI API call failed: ${(apiError as Error).message}`);
  }

  // JSONをパース
  const parseResult = parseAndValidateJson(text, ReviewResultSchema);

  if (parseResult.success) {
    return { result: parseResult.data, tokenCount: totalTokens };
  }

  console.error(
    "[AI Review] Chunk failed to parse response:",
    parseResult.error
  );

  // フォールバック
  return {
    result: {
      summary: `チャンクレビュー生成中にパースエラーが発生しました。`,
      walkthrough: files.map((f) => ({
        path: f.newPath,
        summary: `${f.type} changes`,
        changeType: f.type,
      })),
      comments: [],
    },
    tokenCount: totalTokens,
  };
}

// ========================================
// チャンキング対応レビュー生成
// ========================================

/**
 * 大規模PRをチャンク分割してレビュー
 */
async function generateChunkedReview(params: GenerateReviewParams): Promise<{
  result: ReviewResult;
  tokenCount: number;
  chunkStats?: {
    totalChunks: number;
    successfulChunks: number;
    duplicatesRemoved: number;
  };
}> {
  const { prTitle, prBody, files, diffContent, ragContext, adaptiveContext } =
    params;

  // チャンク分割
  const chunkingResult = createChunks(files, diffContent);
  console.log(`[AI Review] ${formatChunkingSummary(chunkingResult)}`);

  if (!chunkingResult.needsChunking) {
    // チャンキング不要の場合は通常処理
    const { result, tokenCount } = await generateChunkReview({
      prTitle,
      prBody,
      files,
      diffContent,
      ragContext,
      adaptiveContext,
    });

    return { result, tokenCount };
  }

  // 各チャンクを並列処理
  const chunkResults = await processChunksInParallel<ReviewResult>(
    chunkingResult.chunks,
    async (chunk: DiffChunk) => {
      const chunkContext = buildChunkContext(chunk, chunkingResult.chunks);

      const { result } = await generateChunkReview({
        prTitle,
        prBody: `${prBody}\n\n[This is chunk ${chunk.index + 1}/${
          chunk.totalChunks
        }]`,
        files: chunk.files,
        diffContent: chunk.diffContent,
        ragContext,
        adaptiveContext,
        chunkContext,
      });

      return result;
    }
  );

  // ChunkReviewResult形式に変換
  const formattedResults: ChunkReviewResult[] = chunkResults.map((r) => ({
    chunk: r.chunk,
    result: r.result,
    error: r.error,
  }));

  // 結果をマージ
  const merged = mergeChunkResults(formattedResults);

  // ReviewResult形式に変換
  const mergedResult: ReviewResult = {
    summary: merged.summary,
    walkthrough: merged.walkthrough,
    comments: merged.comments,
    diagram: merged.diagram,
  };

  // トークン数の合計を概算
  const totalTokens = chunkingResult.totalTokens;

  return {
    result: mergedResult,
    tokenCount: totalTokens,
    chunkStats: {
      totalChunks: merged.stats.totalChunks,
      successfulChunks: merged.stats.successfulChunks,
      duplicatesRemoved: merged.stats.duplicatesRemoved,
    },
  };
}

// ========================================
// メインレビュー関数
// ========================================

/**
 * AIレビューを生成
 */
export async function generateReview(
  params: GenerateReviewParams
): Promise<GeneratedReview> {
  const { prTitle, prBody, files, diffContent, ragContext, adaptiveContext } =
    params;

  let result: ReviewResult;
  let totalTokens: number;
  let chunkStats:
    | {
        totalChunks: number;
        successfulChunks: number;
        duplicatesRemoved: number;
      }
    | undefined;

  // チャンキングが有効な場合
  if (isChunkingEnabled()) {
    console.log("[AI Review] Chunking enabled, checking if needed...");
    const chunkedResult = await generateChunkedReview(params);
    result = chunkedResult.result;
    totalTokens = chunkedResult.tokenCount;
    chunkStats = chunkedResult.chunkStats;

    if (chunkStats && chunkStats.totalChunks > 1) {
      console.log(
        `[AI Review] Chunked processing complete: ${chunkStats.successfulChunks}/${chunkStats.totalChunks} chunks, ` +
          `${chunkStats.duplicatesRemoved} duplicates removed`
      );
    }
  } else {
    // 従来の処理（チャンキング無効時）
    let truncatedDiff = diffContent;
    const baseTokens =
      countTokens(REVIEW_SYSTEM_PROMPT) +
      countTokens(prTitle) +
      countTokens(prBody || "");
    const ragTokens = ragContext ? countTokens(ragContext) : 0;
    const availableTokens = MAX_INPUT_TOKENS - baseTokens - ragTokens - RESERVED_OUTPUT_TOKENS;

    if (countTokens(diffContent) > availableTokens) {
      console.warn(
        `[AI Review] Diff truncated from ${countTokens(
          diffContent
        )} to ${availableTokens} tokens`
      );
      truncatedDiff = truncateToTokenLimit(diffContent, availableTokens);
    }

    const chunkResult = await generateChunkReview({
      prTitle,
      prBody,
      files,
      diffContent: truncatedDiff,
      ragContext,
      adaptiveContext,
    });

    result = chunkResult.result;
    totalTokens = chunkResult.tokenCount;
  }

  // 反省プロセスを適用（有効な場合）
  let filteredComments = result.comments;
  let reflectionResult: ReflectionResult | undefined;
  let reflectionApplied = false;

  if (isReflectionEnabled() && result.comments.length > 0) {
    console.log("[AI Review] Applying self-reflection...");
    try {
      const reflectionDiff = truncateToTokenLimit(
        diffContent,
        MAX_INPUT_TOKENS - 10000
      );
      const reflectionOutput = await applyReflection({
        prTitle,
        prBody,
        diffContent: reflectionDiff,
        comments: result.comments,
      });

      if (reflectionOutput.filtered) {
        filteredComments = reflectionOutput.comments;
        reflectionResult = reflectionOutput.reflection;
        reflectionApplied = true;
        console.log(
          `[AI Review] Reflection filtered ${
            result.comments.length - filteredComments.length
          } comments`
        );
      }
    } catch (reflectionError) {
      console.warn(
        "[AI Review] Reflection failed, using original comments:",
        reflectionError
      );
    }
  }

  // 関連性スコアでフィルタリング（Phase 4）
  if (filteredComments.length > 0) {
    const minScore = getMinRelevanceScore();
    const scoreFilter = filterByRelevanceScore(filteredComments, minScore);
    const filteredByScore =
      filteredComments.length - scoreFilter.accepted.length;

    if (filteredByScore > 0) {
      console.log(
        `[AI Review] Relevance score filtered ${filteredByScore} comments (minScore: ${minScore})`
      );
    }

    filteredComments = scoreFilter.accepted;
  }

  // 重複除去（Phase 6）
  let deduplicationResult: DeduplicationResult | undefined;
  if (isDeduplicationEnabled() && filteredComments.length > 1) {
    console.log("[AI Review] Applying deduplication...");
    deduplicationResult = deduplicateComments(filteredComments);

    if (deduplicationResult.stats.duplicatesRemoved > 0) {
      console.log(
        `[AI Review] Deduplication: ${formatDeduplicationSummary(
          deduplicationResult
        )}`
      );
    }
    // 常にdeduplicationResult.commentsを使用（ソート済み・正規化済み）
    // テストするためのコメント
    filteredComments = deduplicationResult.comments;
  }

  // サマリーコメント生成
  const criticalCount = filteredComments.filter(
    (c) => c.severity === "CRITICAL"
  ).length;
  const importantCount = filteredComments.filter(
    (c) => c.severity === "IMPORTANT"
  ).length;

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
    startLine: comment.startLine ?? undefined,
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
    chunkStats,
    deduplicationStats: deduplicationResult
      ? {
          originalCount: deduplicationResult.stats.originalCount,
          finalCount: deduplicationResult.stats.finalCount,
          duplicatesRemoved: deduplicationResult.stats.duplicatesRemoved,
        }
      : undefined,
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
  const hasCritical = review.inlineComments.some(
    (c) => c.severity === "CRITICAL"
  );

  // イベントタイプを決定（CRITICALがある場合は変更要求）
  const event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = hasCritical
    ? "REQUEST_CHANGES"
    : "COMMENT";

  // すべてのコメントをインラインコメントとして投稿
  // GitHub APIは`line`を期待するため、内部の`endLine`を`line`に変換
  const comments: GitHubReviewComment[] = review.inlineComments.map((c) => {
    const comment: GitHubReviewComment = {
      path: c.path,
      line: c.endLine, // endLineをGitHub APIのlineにマッピング
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
