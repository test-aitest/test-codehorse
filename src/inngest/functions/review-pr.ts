import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  getInstallationOctokit,
  getPullRequestDiff,
  getPullRequestDetails,
  createPullRequestReview,
} from "@/lib/github/client";
import { parseDiff } from "@/lib/diff/parser";
import { filterReviewableFiles, detectLanguage } from "@/lib/diff/filter";
import { generateReview, formatForGitHubReview } from "@/lib/ai/review";
import { reconstructDiff } from "@/lib/diff/parser";
import { generateQueriesFromDiff, searchWithMultipleQueries } from "@/lib/rag/search";
import { buildSimpleContext } from "@/lib/rag/context-builder";
import { getNamespaceStats } from "@/lib/pinecone/client";

/**
 * PR Opened イベントを処理してフルレビューを実行
 */
export const reviewPR = inngest.createFunction(
  {
    id: "review-pr",
    // インストールID単位で同時実行を1に制限
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 3,
  },
  { event: "github/pull_request.opened" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, headSha, baseSha, installationId } =
      event.data;

    console.log("[Inngest] Starting PR review", {
      owner,
      repo,
      prNumber,
      headSha,
    });

    // Step 1: リポジトリとPRの情報を取得/作成
    const dbSetup = await step.run("setup-db", async () => {
      // リポジトリを取得または作成
      let repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        // 新規リポジトリの場合は作成
        repository = await prisma.repository.create({
          data: {
            githubRepoId: 0, // Webhookからは取得できないのでプレースホルダー
            owner,
            name: repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
            installationId,
          },
        });
      }

      // PRを取得または作成
      let pullRequest = await prisma.pullRequest.findFirst({
        where: {
          repositoryId: repository.id,
          number: prNumber,
        },
      });

      if (!pullRequest) {
        pullRequest = await prisma.pullRequest.create({
          data: {
            repositoryId: repository.id,
            number: prNumber,
            title: "", // 後で更新
            author: "unknown", // 後で更新
            baseSha,
            headSha,
          },
        });
      } else {
        // 既存PRの場合はSHAを更新
        pullRequest = await prisma.pullRequest.update({
          where: { id: pullRequest.id },
          data: { headSha, baseSha },
        });
      }

      // レビューレコードを作成
      const review = await prisma.review.create({
        data: {
          pullRequestId: pullRequest.id,
          commitSha: headSha,
          status: "PROCESSING",
        },
      });

      return {
        repositoryId: repository.id,
        pullRequestId: pullRequest.id,
        reviewId: review.id,
      };
    });

    // Step 2: PR詳細とDiffを取得
    const prData = await step.run("fetch-pr-data", async () => {
      const octokit = await getInstallationOctokit(installationId);

      // PR詳細を取得
      const prDetails = await getPullRequestDetails(
        octokit,
        owner,
        repo,
        prNumber
      );

      // Diffを取得
      const rawDiff = await getPullRequestDiff(octokit, owner, repo, prNumber);

      // PRタイトルとauthorを更新
      await prisma.pullRequest.update({
        where: { id: dbSetup.pullRequestId },
        data: {
          title: prDetails.title,
          author: prDetails.user?.login || "unknown",
        },
      });

      return {
        title: prDetails.title,
        body: prDetails.body || "",
        rawDiff,
      };
    });

    // Step 3: Diffをパースしてフィルタリング
    const parsedData = await step.run("parse-diff", async () => {
      const parsed = parseDiff(prData.rawDiff);
      const reviewableFiles = filterReviewableFiles(parsed.files);

      // レビュー対象ファイルのDiffを再構築
      const filteredDiff = reviewableFiles.map(reconstructDiff).join("\n\n");

      console.log(
        `[Inngest] Parsed ${parsed.files.length} files, ${reviewableFiles.length} reviewable`
      );

      return {
        files: reviewableFiles,
        filteredDiff,
        totalAdditions: parsed.totalAdditions,
        totalDeletions: parsed.totalDeletions,
      };
    });

    // Step 4: RAGコンテキストを取得
    const ragContextResult = await step.run(
      "fetch-rag-context",
      async (): Promise<string | null> => {
        try {
          // インデックスが存在するか確認
          const stats = await getNamespaceStats(owner, repo);
          if (stats.vectorCount === 0) {
            console.log("[Inngest] No index found, skipping RAG context");
            return null;
          }

          // Diffからクエリを生成
          const queries = generateQueriesFromDiff(parsedData.files);
          if (queries.length === 0) {
            console.log("[Inngest] No queries generated from diff");
            return null;
          }

          console.log(`[Inngest] Generated ${queries.length} RAG queries`);

          // 主要言語を検出
          const primaryLanguage = parsedData.files.length > 0
            ? detectLanguage(parsedData.files[0].newPath)
            : undefined;

          // 検索実行
          const searchResults = await searchWithMultipleQueries(
            owner,
            repo,
            queries,
            primaryLanguage
          );

          if (searchResults.length === 0) {
            console.log("[Inngest] No relevant code found");
            return null;
          }

          console.log(`[Inngest] Found ${searchResults.length} relevant code chunks`);

          // コンテキストを構築
          return buildSimpleContext(searchResults);
        } catch (error) {
          console.warn("[Inngest] RAG context fetch failed:", error);
          return null;
        }
      }
    );
    const ragContext = ragContextResult ?? undefined;

    // Step 5: AIレビューを生成
    const aiReview = await step.run("generate-review", async () => {
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No reviewable files, skipping AI review");
        return null;
      }

      const review = await generateReview({
        prTitle: prData.title,
        prBody: prData.body,
        files: parsedData.files,
        diffContent: parsedData.filteredDiff,
        ragContext,
      });

      console.log(
        `[Inngest] Generated review with ${review.inlineComments.length} comments`
      );

      return review;
    });

    // Step 6: レビュー結果をDBに保存
    await step.run("save-review", async () => {
      if (!aiReview) {
        await prisma.review.update({
          where: { id: dbSetup.reviewId },
          data: {
            status: "COMPLETED",
            summary: "No reviewable files found.",
            tokenCount: 0,
          },
        });
        return;
      }

      // レビューを更新
      await prisma.review.update({
        where: { id: dbSetup.reviewId },
        data: {
          status: "COMPLETED",
          summary: aiReview.result.summary,
          walkthrough: JSON.stringify(aiReview.result.walkthrough),
          diagram: aiReview.result.diagram,
          tokenCount: aiReview.tokenCount,
        },
      });

      // コメントを保存
      if (aiReview.inlineComments.length > 0) {
        await prisma.reviewComment.createMany({
          data: aiReview.inlineComments.map((comment) => ({
            reviewId: dbSetup.reviewId,
            filePath: comment.path,
            lineNumber: comment.line,
            body: comment.body,
            severity: comment.severity as
              | "CRITICAL"
              | "IMPORTANT"
              | "INFO"
              | "NITPICK",
          })),
        });
      }
    });

    // Step 7: GitHubにコメントを投稿
    await step.run("post-review", async () => {
      if (!aiReview) {
        console.log("[Inngest] No review to post");
        return;
      }

      const octokit = await getInstallationOctokit(installationId);
      const githubReview = formatForGitHubReview(aiReview);

      console.log("[Inngest] Posting review with comments:", {
        commentsCount: githubReview.comments.length,
        comments: githubReview.comments.map(c => ({ path: c.path, line: c.line, side: c.side })),
        event: githubReview.event,
      });

      try {
        await createPullRequestReview(octokit, owner, repo, prNumber, headSha, {
          body: githubReview.body,
          comments: githubReview.comments,
          event: githubReview.event,
        });
        console.log("[Inngest] Posted review to GitHub successfully");
      } catch (error: any) {
        console.error("[Inngest] Failed to post review:", {
          message: error.message,
          status: error.status,
          response: error.response?.data,
        });
        throw error;
      }
    });

    console.log("[Inngest] PR review completed", { prNumber });

    return { success: true, prNumber, reviewId: dbSetup.reviewId };
  }
);

/**
 * PR Synchronize イベントを処理して増分レビューを実行
 */
export const reviewPRIncremental = inngest.createFunction(
  {
    id: "review-pr-incremental",
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 3,
  },
  { event: "github/pull_request.synchronize" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, beforeSha, afterSha, installationId } =
      event.data;

    console.log("[Inngest] Starting incremental PR review", {
      owner,
      repo,
      prNumber,
      beforeSha,
      afterSha,
    });

    // Step 1: 重複チェック
    const existingReview = await step.run("check-duplicate", async () => {
      const pullRequest = await prisma.pullRequest.findFirst({
        where: {
          repository: { owner, name: repo },
          number: prNumber,
        },
        include: {
          reviews: {
            where: { commitSha: afterSha },
          },
        },
      });

      if (pullRequest?.reviews.length) {
        console.log("[Inngest] Already reviewed this commit");
        return pullRequest.reviews[0];
      }

      return null;
    });

    if (existingReview) {
      return { skipped: true, reason: "Already reviewed this commit" };
    }

    // Step 2: DBセットアップ
    const dbSetup = await step.run("setup-db", async () => {
      const pullRequest = await prisma.pullRequest.findFirst({
        where: {
          repository: { owner, name: repo },
          number: prNumber,
        },
      });

      if (!pullRequest) {
        throw new Error(`Pull request not found: ${owner}/${repo}#${prNumber}`);
      }

      // SHAを更新
      await prisma.pullRequest.update({
        where: { id: pullRequest.id },
        data: { headSha: afterSha },
      });

      // 新しいレビューレコードを作成
      const review = await prisma.review.create({
        data: {
          pullRequestId: pullRequest.id,
          commitSha: afterSha,
          status: "PROCESSING",
        },
      });

      return {
        pullRequestId: pullRequest.id,
        reviewId: review.id,
      };
    });

    // Step 3: 増分Diffを取得
    const prData = await step.run("fetch-incremental-diff", async () => {
      const octokit = await getInstallationOctokit(installationId);

      // PR詳細を取得
      const prDetails = await getPullRequestDetails(
        octokit,
        owner,
        repo,
        prNumber
      );

      // 増分Diffを取得（beforeSha...afterSha）
      const { data: comparison } = await octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: beforeSha,
        head: afterSha,
        mediaType: { format: "diff" },
      });

      return {
        title: prDetails.title,
        body: prDetails.body || "",
        rawDiff: comparison as unknown as string,
      };
    });

    // Step 4: Diffをパース
    const parsedData = await step.run("parse-diff", async () => {
      const parsed = parseDiff(prData.rawDiff);
      const reviewableFiles = filterReviewableFiles(parsed.files);
      const filteredDiff = reviewableFiles.map(reconstructDiff).join("\n\n");

      return {
        files: reviewableFiles,
        filteredDiff,
      };
    });

    // Step 5: AIレビューを生成
    const aiReview = await step.run("generate-incremental-review", async () => {
      if (parsedData.files.length === 0) {
        return null;
      }

      // 増分レビュー用のプロンプトを調整
      const review = await generateReview({
        prTitle: `[増分更新] ${prData.title}`,
        prBody: `この変更は前のコミット (${beforeSha.slice(
          0,
          7
        )}) からの増分更新です。\n\n${prData.body}`,
        files: parsedData.files,
        diffContent: parsedData.filteredDiff,
      });

      return review;
    });

    // Step 6: 結果をDBに保存
    await step.run("save-review", async () => {
      if (!aiReview) {
        await prisma.review.update({
          where: { id: dbSetup.reviewId },
          data: {
            status: "COMPLETED",
            summary: "No reviewable changes in this update.",
            tokenCount: 0,
          },
        });
        return;
      }

      await prisma.review.update({
        where: { id: dbSetup.reviewId },
        data: {
          status: "COMPLETED",
          summary: aiReview.result.summary,
          walkthrough: JSON.stringify(aiReview.result.walkthrough),
          tokenCount: aiReview.tokenCount,
        },
      });

      if (aiReview.inlineComments.length > 0) {
        await prisma.reviewComment.createMany({
          data: aiReview.inlineComments.map((comment) => ({
            reviewId: dbSetup.reviewId,
            filePath: comment.path,
            lineNumber: comment.line,
            body: comment.body,
            severity: comment.severity as
              | "CRITICAL"
              | "IMPORTANT"
              | "INFO"
              | "NITPICK",
          })),
        });
      }
    });

    // Step 7: GitHubにコメントを投稿
    await step.run("post-incremental-review", async () => {
      if (!aiReview) return;

      const octokit = await getInstallationOctokit(installationId);
      const githubReview = formatForGitHubReview(aiReview);

      // 増分レビューであることを明記
      const incrementalBody = `## 🔄 Incremental Review

This review covers changes from \`${beforeSha.slice(
        0,
        7
      )}\` to \`${afterSha.slice(0, 7)}\`.

---

${githubReview.body}`;

      console.log("[Inngest] Posting incremental review with comments:", {
        commentsCount: githubReview.comments.length,
        comments: githubReview.comments.map(c => ({ path: c.path, line: c.line, side: c.side })),
        event: githubReview.event,
      });

      try {
        await createPullRequestReview(octokit, owner, repo, prNumber, afterSha, {
          body: incrementalBody,
          comments: githubReview.comments,
          event: githubReview.event,
        });
        console.log("[Inngest] Posted incremental review to GitHub successfully");
      } catch (error: any) {
        console.error("[Inngest] Failed to post incremental review:", {
          message: error.message,
          status: error.status,
          response: error.response?.data,
        });
        throw error;
      }
    });

    return {
      success: true,
      prNumber,
      reviewId: dbSetup.reviewId,
      incremental: true,
    };
  }
);
