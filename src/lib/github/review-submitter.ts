/**
 * Review Submitter
 * 422エラーハンドリングとフォールバック処理を含むレビュー投稿
 * pr-agentのpublish_code_suggestions()を参考
 */

import { Octokit } from "octokit";
import {
  createPullRequestReview,
  getInstallationOctokit,
  type ReviewCommentInput,
} from "./client";
import { validateCommentPosition } from "../diff/validation";
import type { ParsedDiff } from "../diff/types";

// レビューコメント型
export interface ReviewComment {
  path: string;
  line: number;
  start_line?: number;
  side: "RIGHT";
  start_side?: "RIGHT";
  body: string;
}

// 投稿結果
export interface SubmitReviewResult {
  success: boolean;
  postedComments: number;
  failedComments: ReviewComment[];
  fallbackToIssueComment: boolean;
  error?: string;
}

/**
 * レビューを投稿（422エラーハンドリング付き）
 */
export async function submitReviewWithFallback(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  options: {
    body: string;
    comments: ReviewComment[];
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  },
  parsedDiff: ParsedDiff
): Promise<SubmitReviewResult> {
  const { body, comments, event } = options;

  // Step 1: コメント位置を検証・調整
  console.log(`[Review] Validating ${comments.length} comments`);
  const validatedComments = validateAndAdjustComments(comments, parsedDiff);
  const validComments = validatedComments.valid;
  const invalidComments = validatedComments.invalid;
  console.log(
    `[Review] Valid: ${validComments.length}, Invalid: ${invalidComments.length}`
  );

  // 無効なコメントがあればサマリーに追加
  // テストです
  // さらにテスト
  let updatedBody = body;
  if (invalidComments.length > 0) {
    console.warn(
      `[Review] ${invalidComments.length} comments have invalid positions`
    );
    updatedBody = appendInvalidCommentsToSummary(body, invalidComments);
  }

  // コメントがない場合はサマリーのみ投稿
  if (validComments.length === 0) {
    try {
      await createPullRequestReview(octokit, owner, repo, prNumber, commitId, {
        body: updatedBody,
        comments: [],
        event,
      });
      return {
        success: true,
        postedComments: 0,
        failedComments: invalidComments,
        fallbackToIssueComment: false,
      };
    } catch (error) {
      console.error("[Review] Failed to post summary:", error);
      return {
        success: false,
        postedComments: 0,
        failedComments: comments,
        fallbackToIssueComment: false,
        error: (error as Error).message,
      };
    }
  }

  // Step 2: レビュー投稿を試行
  try {
    await createPullRequestReview(octokit, owner, repo, prNumber, commitId, {
      body: updatedBody,
      comments: validComments as ReviewCommentInput[],
      event,
    });

    return {
      success: true,
      postedComments: validComments.length,
      failedComments: invalidComments,
      fallbackToIssueComment: false,
    };
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };

    // Step 3: 422エラーの場合、フォールバック戦略を実行
    if (err.status === 422) {
      console.warn("[Review] 422 error, attempting fallback strategies");
      return await handle422Error(
        octokit,
        owner,
        repo,
        prNumber,
        commitId,
        body,
        validComments,
        event
      );
    }

    throw error;
  }
}

/**
 * コメント位置を検証・調整
 */
function validateAndAdjustComments(
  comments: ReviewComment[],
  parsedDiff: ParsedDiff
): {
  valid: ReviewComment[];
  invalid: ReviewComment[];
} {
  const valid: ReviewComment[] = [];
  const invalid: ReviewComment[] = [];

  for (const comment of comments) {
    const validation = validateCommentPosition(
      comment.path,
      comment.line,
      comment.start_line,
      parsedDiff
    );

    if (!validation.valid) {
      console.warn(
        `[Review] Invalid comment: ${comment.path}:${comment.line} - ${validation.reason}`
      );
      invalid.push(comment);
      continue;
    }

    // 調整が必要な場合
    const adjustedComment = { ...comment };
    if (validation.adjustedLine) {
      adjustedComment.line = validation.adjustedLine;
    }
    if (validation.adjustedStartLine) {
      adjustedComment.start_line = validation.adjustedStartLine;
    }

    valid.push(adjustedComment);
  }

  return { valid, invalid };
}

/**
 * 422エラーのフォールバック処理
 */
async function handle422Error(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  body: string,
  comments: ReviewComment[],
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES"
): Promise<SubmitReviewResult> {
  const successComments: ReviewComment[] = [];
  const failedComments: ReviewComment[] = [];

  // Strategy 1: 1つずつ投稿して問題のコメントを特定
  console.log("[Review] Attempting to post comments individually");

  for (const comment of comments) {
    try {
      await createPullRequestReview(octokit, owner, repo, prNumber, commitId, {
        body: "",
        comments: [comment as ReviewCommentInput],
        event: "COMMENT",
      });
      successComments.push(comment);
    } catch (testError: unknown) {
      const testErr = testError as { status?: number };

      if (testErr.status === 422) {
        // Strategy 2: 複数行→単一行へダウングレード
        if (comment.start_line) {
          const singleLineComment: ReviewComment = {
            path: comment.path,
            line: comment.line,
            side: "RIGHT",
            body: comment.body,
          };

          try {
            await createPullRequestReview(
              octokit,
              owner,
              repo,
              prNumber,
              commitId,
              {
                body: "",
                comments: [singleLineComment as ReviewCommentInput],
                event: "COMMENT",
              }
            );
            successComments.push(singleLineComment);
            console.log(
              `[Review] Downgraded to single-line: ${comment.path}:${comment.line}`
            );
            continue;
          } catch {
            // ダウングレードも失敗
          }
        }

        failedComments.push(comment);
        console.warn(
          `[Review] Comment failed: ${comment.path}:${comment.line}`
        );
      } else {
        throw testError;
      }
    }
  }

  // Strategy 3: 全て失敗した場合、issueコメントにフォールバック
  if (successComments.length === 0 && comments.length > 0) {
    console.warn(
      "[Review] All inline comments failed, falling back to issue comment"
    );

    const fallbackBody = buildFallbackComment(body, comments);

    try {
      // issueコメントとして投稿
      // 注: createIssueCommentはinstallationIdを使用するので、直接octokitを使用
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: fallbackBody,
      });

      return {
        success: true,
        postedComments: 0,
        failedComments: comments,
        fallbackToIssueComment: true,
      };
    } catch (fallbackError) {
      console.error(
        "[Review] Fallback to issue comment also failed:",
        fallbackError
      );
      return {
        success: false,
        postedComments: 0,
        failedComments: comments,
        fallbackToIssueComment: false,
        error: (fallbackError as Error).message,
      };
    }
  }

  // 部分的に成功した場合、サマリーを投稿
  if (successComments.length > 0) {
    try {
      // サマリーのみ（コメントなし）で投稿
      await createPullRequestReview(octokit, owner, repo, prNumber, commitId, {
        body: appendFailedCommentsNote(body, failedComments),
        comments: [],
        event,
      });
    } catch {
      console.warn("[Review] Failed to post summary after individual comments");
    }
  }

  return {
    success: successComments.length > 0,
    postedComments: successComments.length,
    failedComments,
    fallbackToIssueComment: false,
  };
}

/**
 * フォールバック用コメントを構築
 */
function buildFallbackComment(
  summaryBody: string,
  failedComments: ReviewComment[]
): string {
  let fallback = summaryBody;

  if (failedComments.length > 0) {
    fallback += "\n\n---\n\n### 📝 インラインコメント\n\n";
    fallback += "*以下のコメントはインラインで投稿できませんでした:*\n\n";

    for (const comment of failedComments) {
      const lineInfo = comment.start_line
        ? `行 ${comment.start_line}-${comment.line}`
        : `行 ${comment.line}`;

      fallback += `<details>\n`;
      fallback += `<summary><code>${comment.path}</code> (${lineInfo})</summary>\n\n`;
      fallback += comment.body;
      fallback += `\n</details>\n\n`;
    }
  }

  return fallback;
}

/**
 * 失敗したコメントの注記をサマリーに追加
 */
function appendFailedCommentsNote(
  body: string,
  failedComments: ReviewComment[]
): string {
  if (failedComments.length === 0) return body;

  const failedPaths = failedComments
    .map((c) => `\`${c.path}:${c.line}\``)
    .join(", ");

  return `${body}\n\n---\n\n⚠️ ${failedComments.length}件のコメントはインラインで投稿できませんでした: ${failedPaths}`;
}

/**
 * 無効な位置のコメントをサマリーに追加
 * diffの範囲外のコメントも表示する
 */
function appendInvalidCommentsToSummary(
  body: string,
  invalidComments: ReviewComment[]
): string {
  if (invalidComments.length === 0) return body;

  let result = body;
  result += "\n\n---\n\n### 📌 追加のコメント\n\n";
  result += "*以下のコメントはdiffの範囲外のため、ここに記載します:*\n\n";

  for (const comment of invalidComments) {
    const lineInfo = comment.start_line
      ? `行 ${comment.start_line}-${comment.line}`
      : `行 ${comment.line}`;

    result += `<details>\n`;
    result += `<summary><code>${comment.path}</code> (${lineInfo})</summary>\n\n`;
    result += comment.body;
    result += `\n</details>\n\n`;
  }

  return result;
}

/**
 * installationIdを使用してレビューを投稿
 */
export async function submitReviewWithInstallation(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  options: {
    body: string;
    comments: ReviewComment[];
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  },
  parsedDiff: ParsedDiff
): Promise<SubmitReviewResult> {
  const octokit = await getInstallationOctokit(installationId);
  return submitReviewWithFallback(
    octokit,
    owner,
    repo,
    prNumber,
    commitId,
    options,
    parsedDiff
  );
}
