import { App, Octokit } from "octokit";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";

// =====================================================
// GitHub App 設定
// =====================================================

// GitHub Appは環境変数が設定されている場合のみ初期化
let app: App | null = null;

function getApp(): App {
  if (!app) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_PRIVATE_KEY;

    if (!appId || !privateKey) {
      throw new Error(
        "GitHub App credentials not configured. Set GITHUB_APP_ID and GITHUB_PRIVATE_KEY environment variables."
      );
    }

    app = new App({
      appId,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    });
  }
  return app;
}

// =====================================================
// レート制限とリトライ設定
// =====================================================

// 並行実行数制限（Abuse Detection回避）
const limit = pLimit(5);

// リトライ設定
const RETRY_OPTIONS = {
  retries: 5,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 30000,
  onFailedAttempt: (context: { attemptNumber: number; error: Error }) => {
    console.warn(
      `[GitHub API] Retry attempt ${context.attemptNumber}:`,
      context.error.message
    );
  },
};

// =====================================================
// クライアント取得
// =====================================================

/**
 * インストールIDからOctokitクライアントを取得
 */
export async function getInstallationOctokit(
  installationId: number
): Promise<Octokit> {
  return getApp().getInstallationOctokit(installationId);
}

// =====================================================
// レート制限付きAPIコール
// =====================================================

/**
 * レート制限とリトライ付きAPIコール
 */
export async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  return limit(() =>
    pRetry(async () => {
      try {
        return await fn();
      } catch (error: any) {
        // 403 Abuse Detection または 429 Rate Limit
        if (error.status === 403 || error.status === 429) {
          const retryAfter = error.response?.headers?.["retry-after"];
          if (retryAfter) {
            const waitMs = parseInt(retryAfter, 10) * 1000;
            console.log(`[GitHub API] Rate limited, waiting ${waitMs}ms`);
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
          throw error; // p-retryに再試行させる
        }

        // 5xx エラーも再試行
        if (error.status >= 500) {
          throw error;
        }

        // その他は即座に失敗（4xxエラー等）
        throw new AbortError(error);
      }
    }, RETRY_OPTIONS)
  );
}

// =====================================================
// GitHub API ラッパー関数
// =====================================================

/**
 * PRのDiffを取得（Unified Diff形式）- installationId版
 */
export async function getPullRequestDiffById(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return response.data as unknown as string;
  });
}

/**
 * PRのDiffを取得（Unified Diff形式）- Octokit版
 */
export async function getPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return response.data as unknown as string;
  });
}

/**
 * PRの変更ファイル一覧を取得
 */
export async function getPullRequestFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    return response.data;
  });
}

/**
 * PR情報を取得
 */
export async function getPullRequest(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return response.data;
  });
}

/**
 * ファイルコンテンツを取得
 */
export async function getFileContent(
  installationId: number,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ("content" in response.data && response.data.type === "file") {
        return Buffer.from(response.data.content, "base64").toString("utf-8");
      }
      return null;
    } catch (error: any) {
      if (error.status === 404) return null;
      throw error;
    }
  });
}

/**
 * リポジトリのファイルツリーを取得
 */
export async function getRepositoryTree(
  installationId: number,
  owner: string,
  repo: string,
  branch: string
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "true",
    });
    return response.data.tree;
  });
}

/**
 * 2つのコミット間のDiffを取得
 */
export async function getCommitDiff(
  installationId: number,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string
): Promise<string> {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: baseSha,
      head: headSha,
      mediaType: { format: "diff" },
    });
    return response.data as unknown as string;
  });
}

/**
 * PRにレビューコメントを投稿（installationId版）
 */
export async function createPullRequestReviewById(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  body: string,
  comments: Array<{
    path: string;
    position?: number;
    line?: number;
    body: string;
  }>
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    return octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      body,
      event: "COMMENT",
      comments,
    });
  });
}

/**
 * PRにレビューコメントを投稿（Octokit版、イベントタイプ指定可）
 */
export async function createPullRequestReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitId: string,
  options: {
    body: string;
    comments: Array<{
      path: string;
      position?: number;
      line?: number;
      body: string;
    }>;
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
  }
) {
  return rateLimitedRequest(async () => {
    return octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      body: options.body,
      event: options.event,
      comments: options.comments,
    });
  });
}

/**
 * PR詳細を取得（Octokit版）
 */
export async function getPullRequestDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) {
  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    return response.data;
  });
}

/**
 * PRにシンプルなコメントを投稿
 */
export async function createIssueComment(
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    return octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  });
}

/**
 * レビューコメントスレッドを取得
 */
export async function getReviewCommentThread(
  installationId: number,
  owner: string,
  repo: string,
  commentId: number
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    const response = await octokit.rest.pulls.getReviewComment({
      owner,
      repo,
      comment_id: commentId,
    });
    return response.data;
  });
}

/**
 * レビューコメントに返信
 */
export async function createReviewCommentReply(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  commentId: number,
  body: string
) {
  const octokit = await getInstallationOctokit(installationId);

  return rateLimitedRequest(async () => {
    return octokit.rest.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: prNumber,
      comment_id: commentId,
      body,
    });
  });
}
