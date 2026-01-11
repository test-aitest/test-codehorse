import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  getInstallationOctokit,
  getPullRequestDiff,
  getPullRequestDetails,
} from "@/lib/github/client";
import { parseDiff, reconstructDiff } from "@/lib/diff/parser";
import { filterReviewableFiles, detectLanguage } from "@/lib/diff/filter";
import {
  extendDiffContext,
  createGitHubFileProvider,
  isContextExtensionEnabled,
  getContextOptionsFromEnv,
  clearContextCache,
} from "@/lib/diff/context-extender";
import { generateReview, formatForGitHubReview } from "@/lib/ai/review";
import {
  submitReviewWithFallback,
  type ReviewComment,
} from "@/lib/github/review-submitter";
import {
  generateQueriesFromDiff,
  searchWithMultipleQueries,
} from "@/lib/rag/search";
import { buildSimpleContext } from "@/lib/rag/context-builder";
import { getNamespaceStats } from "@/lib/pinecone/client";
import {
  buildAdaptiveContext,
  saveConversation,
  saveConversationBatch,
  deserializeAdaptiveContext,
} from "@/lib/ai/memory";
import {
  analyzeImpact,
  formatImpactAnalysis,
  type ImpactAnalysisResult,
} from "@/lib/analysis";
import { handleInngestError } from "@/lib/errors";
import { recordCommentOccurrence } from "@/lib/ai/persistence";
import { isLeetCodePR } from "@/lib/leetcode";

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

    // Step 0: LeetCode PRかどうかを確認（LeetCode PRは別の関数で処理）
    const isLeetCode = await step.run("check-leetcode-pr", async () => {
      const octokit = await getInstallationOctokit(installationId);
      const pr = await getPullRequestDetails(octokit, owner, repo, prNumber);
      return isLeetCodePR(pr.body || "");
    });

    if (isLeetCode) {
      console.log("[Inngest] LeetCode PR detected, skipping generic review");
      return { status: "skipped", reason: "LeetCode PR - handled by leetcode-solution-submitted" };
    }

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
      const parsedDiff = parseDiff(prData.rawDiff);
      const reviewableFiles = filterReviewableFiles(parsedDiff.files);

      // レビュー対象ファイルのDiffを再構築
      const filteredDiff = reviewableFiles.map(reconstructDiff).join("\n\n");

      console.log(
        `[Inngest] Parsed ${parsedDiff.files.length} files, ${reviewableFiles.length} reviewable`
      );

      return {
        parsedDiff, // コメント位置検証用に保持
        files: reviewableFiles,
        filteredDiff,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
      };
    });

    // Step 3.5: Diffコンテキストを拡張（有効な場合）
    const extendedDiffContent = await step.run(
      "extend-diff-context",
      async () => {
        if (!isContextExtensionEnabled()) {
          console.log(
            "[Inngest] Context extension disabled, using original diff"
          );
          return parsedData.filteredDiff;
        }

        if (parsedData.files.length === 0) {
          return parsedData.filteredDiff;
        }

        try {
          const octokit = await getInstallationOctokit(installationId);
          const fileProvider = createGitHubFileProvider(octokit, owner, repo);
          const options = getContextOptionsFromEnv();

          console.log(
            `[Inngest] Extending diff context with ${options.contextLines} lines`
          );

          const result = await extendDiffContext(
            parsedData.files,
            headSha,
            fileProvider,
            options
          );

          console.log(
            `[Inngest] Context extension: ${result.stats.filesProcessed} processed, ${result.stats.totalContextLinesAdded} lines added`
          );

          // キャッシュをクリア（メモリ解放）
          clearContextCache();

          return result.extendedDiff;
        } catch (error) {
          console.warn(
            "[Inngest] Context extension failed, using original diff:",
            error
          );
          return parsedData.filteredDiff;
        }
      }
    );

    // Step 3.6: 依存関係分析（変更の影響範囲を分析）
    const impactAnalysis = await step.run(
      "analyze-dependencies",
      async (): Promise<ImpactAnalysisResult | null> => {
        try {
          // レビュー対象のファイルがない場合はスキップ
          if (parsedData.files.length === 0) {
            console.log("[Inngest] No files to analyze for dependencies");
            return null;
          }

          console.log("[Inngest] Analyzing dependency impact...");
          const result = await analyzeImpact(
            dbSetup.repositoryId,
            parsedData.parsedDiff,
            {
              maxDepth: 5,
              includeTests: true,
              includeBreakingChanges: true,
              includeCircularDependencies: true,
            }
          );

          console.log("[Inngest] Impact analysis completed:", {
            changedFiles: result.changedFiles.length,
            directlyAffected: result.directlyAffected.length,
            transitivelyAffected: result.transitivelyAffected.length,
            breakingChanges: result.breakingChanges.length,
            circularDependencies: result.circularDependencies.length,
            impactScore: result.impactScore,
          });

          return result;
        } catch (error) {
          console.warn("[Inngest] Dependency analysis failed:", error);
          return null;
        }
      }
    );

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
          const primaryLanguage =
            parsedData.files.length > 0
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

          console.log(
            `[Inngest] Found ${searchResults.length} relevant code chunks`
          );

          // コンテキストを構築
          return buildSimpleContext(searchResults);
        } catch (error) {
          console.warn("[Inngest] RAG context fetch failed:", error);
          return null;
        }
      }
    );
    const ragContext = ragContextResult ?? undefined;

    // Step 5: 適応コンテキストを構築
    const adaptiveContext = await step.run(
      "build-adaptive-context",
      async () => {
        try {
          return await buildAdaptiveContext({
            pullRequestId: dbSetup.pullRequestId,
            repositoryId: dbSetup.repositoryId,
            maxConversationEntries: 20,
            includeLearningInsights: true,
          });
        } catch (error) {
          console.warn("[Inngest] Failed to build adaptive context:", error);
          return undefined;
        }
      }
    );

    // Step 6: AIレビューを生成
    const aiReview = await step.run("generate-review", async () => {
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No reviewable files, skipping AI review");
        return null;
      }

      const review = await generateReview({
        prTitle: prData.title,
        prBody: prData.body,
        files: parsedData.files,
        diffContent: extendedDiffContent, // 拡張されたDiffを使用
        ragContext,
        adaptiveContext: deserializeAdaptiveContext(adaptiveContext),
      });

      console.log(
        `[Inngest] Generated review with ${review.inlineComments.length} comments`
      );

      return review;
    });

    // Step 7: レビューをそのまま使用（クロスPR重複排除は無効化）
    const filteredReview = aiReview;

    // Step 8: レビュー結果をDBに保存
    await step.run("save-review", async () => {
      // filteredReviewはシリアライズ/デシリアライズされるため型チェック
      const review = filteredReview as typeof aiReview;
      if (!review || !review.result) {
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
          summary: review.result.summary,
          walkthrough: JSON.stringify(review.result.walkthrough),
          diagram: review.result.diagram,
          tokenCount: review.tokenCount,
        },
      });

      // コメントを保存
      if (review.inlineComments.length > 0) {
        await prisma.reviewComment.createMany({
          data: review.inlineComments.map((comment) => ({
            reviewId: dbSetup.reviewId,
            filePath: comment.path,
            lineNumber: comment.endLine,
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

    // Step 9: 会話履歴を保存
    await step.run("save-conversation-history", async () => {
      const review = filteredReview as typeof aiReview;
      if (!review || !review.result) return;

      try {
        // レビューサマリーを保存
        await saveConversation({
          pullRequestId: dbSetup.pullRequestId,
          type: "REVIEW",
          role: "AI",
          content: review.result.summary,
          metadata: {
            reviewId: dbSetup.reviewId,
          },
        });

        // インラインコメントを一括保存
        if (review.inlineComments.length > 0) {
          await saveConversationBatch(
            review.inlineComments.map((comment) => ({
              pullRequestId: dbSetup.pullRequestId,
              type: "REVIEW" as const,
              role: "AI" as const,
              content: comment.body,
              metadata: {
                filePath: comment.path,
                lineNumber: comment.endLine,
                endLine: comment.endLine,
                severity: comment.severity,
                reviewId: dbSetup.reviewId,
              },
            }))
          );
        }

        console.log(
          `[Inngest] Saved ${
            review.inlineComments.length + 1
          } conversation entries`
        );
      } catch (error) {
        console.warn("[Inngest] Failed to save conversation history:", error);
      }
    });

    // Step 10: GitHubにコメントを投稿（422エラーハンドリング付き）
    await step.run("post-review", async () => {
      const review = filteredReview as typeof aiReview;
      if (!review || !review.result) {
        console.log("[Inngest] No review to post");
        return;
      }

      const octokit = await getInstallationOctokit(installationId);
      const githubReview = formatForGitHubReview(review);

      // 影響分析レポートを追加（高影響または破壊的変更がある場合のみ）
      let reviewBody = githubReview.body;
      if (
        impactAnalysis &&
        (impactAnalysis.impactScore >= 40 ||
          impactAnalysis.breakingChanges.length > 0)
      ) {
        const impactReport = formatImpactAnalysis(impactAnalysis);
        reviewBody = `${githubReview.body}\n\n---\n\n${impactReport}`;
      }

      console.log("[Inngest] Posting review with comments:", {
        commentsCount: githubReview.comments.length,
        event: githubReview.event,
        includesImpactAnalysis:
          impactAnalysis !== null &&
          (impactAnalysis.impactScore >= 40 ||
            impactAnalysis.breakingChanges.length > 0),
      });

      // 新しいsubmitterを使用（422エラーハンドリング付き）
      const result = await submitReviewWithFallback(
        octokit,
        owner,
        repo,
        prNumber,
        headSha,
        {
          body: reviewBody,
          comments: githubReview.comments as ReviewComment[],
          event: githubReview.event,
        },
        parsedData.parsedDiff
      );

      console.log("[Inngest] Review submission result:", {
        success: result.success,
        postedComments: result.postedComments,
        failedComments: result.failedComments.length,
        fallback: result.fallbackToIssueComment,
      });

      if (!result.success) {
        // エラーを追跡
        await handleInngestError(
          new Error(`Failed to post review: ${result.error}`),
          {
            context: {
              operation: "post-review",
              repository: { owner, name: repo },
              pullRequest: { number: prNumber },
            },
            prInfo: {
              installationId,
              owner,
              repo,
              prNumber,
            },
          }
        );
        throw new Error(`Failed to post review: ${result.error}`);
      }
    });

    // Step 11: コメント発生を永続化（Phase 1）
    await step.run("record-comment-occurrences", async () => {
      const review = filteredReview as typeof aiReview;
      if (
        !review ||
        !review.inlineComments ||
        review.inlineComments.length === 0
      ) {
        return;
      }

      try {
        // 各コメントの発生を記録
        for (const comment of review.inlineComments) {
          await recordCommentOccurrence({
            repositoryId: dbSetup.repositoryId,
            reviewId: dbSetup.reviewId,
            pullRequestId: dbSetup.pullRequestId,
            filePath: comment.path,
            lineNumber: comment.endLine,
            commentBody: comment.body,
            severity: comment.severity as
              | "CRITICAL"
              | "IMPORTANT"
              | "INFO"
              | "NITPICK",
          });
        }

        console.log(
          `[Inngest] Recorded ${review.inlineComments.length} comment occurrences for future deduplication`
        );
      } catch (error) {
        console.warn("[Inngest] Failed to record comment occurrences:", error);
        // エラーは無視してレビューは成功とする
      }
    });

    // Step 12: テスト生成をトリガー（Phase 4）
    await step.run("trigger-test-generation", async () => {
      // 環境変数でテスト生成が有効かチェック
      if (process.env.TEST_GENERATION_ENABLED !== "true") {
        console.log("[Inngest] Test generation disabled");
        return { triggered: false };
      }

      // レビュー対象ファイルがない場合はスキップ
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files to generate tests for");
        return { triggered: false };
      }

      // テスト生成イベントを送信
      await inngest.send({
        name: "github/generate-tests",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha,
          reviewId: dbSetup.reviewId,
          useAI: process.env.TEST_GENERATION_USE_AI !== "false",
          maxFunctions: parseInt(
            process.env.TEST_GENERATION_MAX_FUNCTIONS || "5",
            10
          ),
        },
      });

      console.log("[Inngest] Test generation triggered");
      return { triggered: true };
    });

    // Step 13: ドキュメント分析をトリガー（Phase 5）
    await step.run("trigger-documentation-analysis", async () => {
      // 環境変数でドキュメント分析が有効かチェック
      if (process.env.DOC_GENERATION_ENABLED !== "true") {
        console.log("[Inngest] Documentation analysis disabled");
        return { triggered: false };
      }

      // レビュー対象ファイルがない場合はスキップ
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files for documentation analysis");
        return { triggered: false };
      }

      // ドキュメント分析イベントを送信
      await inngest.send({
        name: "github/analyze-documentation",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha,
          reviewId: dbSetup.reviewId,
          useAI: process.env.DOC_GENERATION_USE_AI !== "false",
          language:
            (process.env.DOC_GENERATION_LANGUAGE as "ja" | "en") || "ja",
          analyzeReadme: process.env.DOC_ANALYZE_README !== "false",
        },
      });

      console.log("[Inngest] Documentation analysis triggered");
      return { triggered: true };
    });

    // Step 14: パフォーマンス分析をトリガー（Phase 8）
    await step.run("trigger-performance-analysis", async () => {
      // 環境変数でパフォーマンス分析が有効かチェック
      if (process.env.PERFORMANCE_ANALYSIS_ENABLED !== "true") {
        console.log("[Inngest] Performance analysis disabled");
        return { triggered: false };
      }

      // レビュー対象ファイルがない場合はスキップ
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files for performance analysis");
        return { triggered: false };
      }

      // パフォーマンス分析イベントを送信
      await inngest.send({
        name: "github/analyze-performance",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha,
          reviewId: dbSetup.reviewId,
          language:
            (process.env.PERFORMANCE_ANALYSIS_LANGUAGE as "ja" | "en") || "ja",
          detectNPlusOne: process.env.PERFORMANCE_DETECT_NPLUSONE !== "false",
          detectMemoryLeaks:
            process.env.PERFORMANCE_DETECT_MEMORY_LEAKS !== "false",
          detectReactRerenders:
            process.env.PERFORMANCE_DETECT_REACT_RERENDERS !== "false",
          detectInefficientLoops:
            process.env.PERFORMANCE_DETECT_INEFFICIENT_LOOPS !== "false",
          detectLargeBundleImports:
            process.env.PERFORMANCE_DETECT_LARGE_BUNDLES !== "false",
        },
      });

      console.log("[Inngest] Performance analysis triggered");
      return { triggered: true };
    });

    // Step 15: セキュリティスキャンをトリガー（Phase 10）
    await step.run("trigger-security-scan", async () => {
      // 環境変数でセキュリティスキャンが有効かチェック
      if (process.env.SECURITY_SCAN_ENABLED !== "true") {
        console.log("[Inngest] Security scan disabled");
        return { triggered: false };
      }

      // レビュー対象ファイルがない場合はスキップ
      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files for security scan");
        return { triggered: false };
      }

      // セキュリティスキャンイベントを送信
      await inngest.send({
        name: "github/scan-security",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha,
          reviewId: dbSetup.reviewId,
          language: (process.env.SECURITY_SCAN_LANGUAGE as "ja" | "en") || "ja",
          detectSqlInjection:
            process.env.SECURITY_DETECT_SQL_INJECTION !== "false",
          detectXss: process.env.SECURITY_DETECT_XSS !== "false",
          detectSecrets: process.env.SECURITY_DETECT_SECRETS !== "false",
          detectAuthIssues: process.env.SECURITY_DETECT_AUTH_ISSUES !== "false",
          minSeverity:
            (process.env.SECURITY_MIN_SEVERITY as
              | "CRITICAL"
              | "HIGH"
              | "MEDIUM"
              | "LOW") || "MEDIUM",
          maxIssues: parseInt(process.env.SECURITY_MAX_ISSUES || "20", 10),
        },
      });

      console.log("[Inngest] Security scan triggered");
      return { triggered: true };
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
        repositoryId: pullRequest.repositoryId,
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
      const parsedDiff = parseDiff(prData.rawDiff);
      const reviewableFiles = filterReviewableFiles(parsedDiff.files);
      const filteredDiff = reviewableFiles.map(reconstructDiff).join("\n\n");

      return {
        parsedDiff,
        files: reviewableFiles,
        filteredDiff,
      };
    });

    // Step 4.5: Diffコンテキストを拡張（有効な場合）
    const extendedDiffContent = await step.run(
      "extend-diff-context",
      async () => {
        if (!isContextExtensionEnabled()) {
          return parsedData.filteredDiff;
        }

        if (parsedData.files.length === 0) {
          return parsedData.filteredDiff;
        }

        try {
          const octokit = await getInstallationOctokit(installationId);
          const fileProvider = createGitHubFileProvider(octokit, owner, repo);
          const options = getContextOptionsFromEnv();

          const result = await extendDiffContext(
            parsedData.files,
            afterSha,
            fileProvider,
            options
          );

          console.log(
            `[Inngest] Incremental context extension: ${result.stats.filesProcessed} processed`
          );

          clearContextCache();
          return result.extendedDiff;
        } catch (error) {
          console.warn("[Inngest] Context extension failed:", error);
          return parsedData.filteredDiff;
        }
      }
    );

    // Step 4.6: 依存関係分析（変更の影響範囲を分析）
    const impactAnalysis = await step.run(
      "analyze-dependencies",
      async (): Promise<ImpactAnalysisResult | null> => {
        try {
          if (parsedData.files.length === 0) {
            return null;
          }

          // リポジトリIDを取得
          const pr = await prisma.pullRequest.findUnique({
            where: { id: dbSetup.pullRequestId },
            select: { repositoryId: true },
          });

          if (!pr) return null;

          console.log("[Inngest] Analyzing dependency impact (incremental)...");
          const result = await analyzeImpact(
            pr.repositoryId,
            parsedData.parsedDiff,
            {
              maxDepth: 5,
              includeTests: true,
              includeBreakingChanges: true,
              includeCircularDependencies: true,
            }
          );

          console.log("[Inngest] Impact analysis completed (incremental):", {
            impactScore: result.impactScore,
            breakingChanges: result.breakingChanges.length,
          });

          return result;
        } catch (error) {
          console.warn("[Inngest] Dependency analysis failed:", error);
          return null;
        }
      }
    );

    // Step 5: 適応コンテキストを構築
    const adaptiveContext = await step.run(
      "build-adaptive-context",
      async () => {
        try {
          // リポジトリIDを取得
          const pr = await prisma.pullRequest.findUnique({
            where: { id: dbSetup.pullRequestId },
            select: { repositoryId: true },
          });

          if (!pr) return undefined;

          return await buildAdaptiveContext({
            pullRequestId: dbSetup.pullRequestId,
            repositoryId: pr.repositoryId,
            maxConversationEntries: 20,
            includeLearningInsights: true,
          });
        } catch (error) {
          console.warn("[Inngest] Failed to build adaptive context:", error);
          return undefined;
        }
      }
    );

    // Step 6: AIレビューを生成
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
        diffContent: extendedDiffContent, // 拡張されたDiffを使用
        adaptiveContext: deserializeAdaptiveContext(adaptiveContext),
      });

      return review;
    });

    // Step 7: レビューをそのまま使用（クロスPR重複排除は無効化）
    const filteredIncrementalReview = aiReview;

    // Step 8: 結果をDBに保存
    await step.run("save-review", async () => {
      const review = filteredIncrementalReview as typeof aiReview;
      if (!review || !review.result) {
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
          summary: review.result.summary,
          walkthrough: JSON.stringify(review.result.walkthrough),
          tokenCount: review.tokenCount,
        },
      });

      if (review.inlineComments.length > 0) {
        await prisma.reviewComment.createMany({
          data: review.inlineComments.map((comment) => ({
            reviewId: dbSetup.reviewId,
            filePath: comment.path,
            lineNumber: comment.endLine,
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

    // Step 9: 会話履歴を保存
    // テストしています
    await step.run("save-conversation-history", async () => {
      const review = filteredIncrementalReview as typeof aiReview;
      if (!review || !review.result) return;

      try {
        await saveConversation({
          pullRequestId: dbSetup.pullRequestId,
          type: "REVIEW",
          role: "AI",
          content: review.result.summary,
          metadata: {
            reviewId: dbSetup.reviewId,
          },
        });

        if (review.inlineComments.length > 0) {
          await saveConversationBatch(
            review.inlineComments.map((comment) => ({
              pullRequestId: dbSetup.pullRequestId,
              type: "REVIEW" as const,
              role: "AI" as const,
              content: comment.body,
              metadata: {
                filePath: comment.path,
                lineNumber: comment.endLine,
                endLine: comment.endLine,
                severity: comment.severity,
                reviewId: dbSetup.reviewId,
              },
            }))
          );
        }

        console.log(
          `[Inngest] Saved ${
            review.inlineComments.length + 1
          } conversation entries (incremental)`
        );
      } catch (error) {
        console.warn("[Inngest] Failed to save conversation history:", error);
      }
    });

    // Step 10: GitHubにコメントを投稿（422エラーハンドリング付き）
    await step.run("post-incremental-review", async () => {
      const review = filteredIncrementalReview as typeof aiReview;
      if (!review || !review.result) return;

      const octokit = await getInstallationOctokit(installationId);
      const githubReview = formatForGitHubReview(review);

      // 影響分析レポートを追加（高影響または破壊的変更がある場合のみ）
      let impactSection = "";
      if (
        impactAnalysis &&
        (impactAnalysis.impactScore >= 40 ||
          impactAnalysis.breakingChanges.length > 0)
      ) {
        impactSection = `\n\n---\n\n${formatImpactAnalysis(impactAnalysis)}`;
      }

      // 増分レビューであることを明記
      const incrementalBody = `## 🔄 Incremental Review

This review covers changes from \`${beforeSha.slice(
        0,
        7
      )}\` to \`${afterSha.slice(0, 7)}\`.

---

${githubReview.body}${impactSection}`;

      console.log("[Inngest] Posting incremental review with comments:", {
        commentsCount: githubReview.comments.length,
        event: githubReview.event,
        includesImpactAnalysis:
          impactAnalysis !== null &&
          (impactAnalysis.impactScore >= 40 ||
            impactAnalysis.breakingChanges.length > 0),
      });

      // 新しいsubmitterを使用（422エラーハンドリング付き）
      const result = await submitReviewWithFallback(
        octokit,
        owner,
        repo,
        prNumber,
        afterSha,
        {
          body: incrementalBody,
          comments: githubReview.comments as ReviewComment[],
          event: githubReview.event,
        },
        parsedData.parsedDiff
      );

      console.log("[Inngest] Incremental review submission result:", {
        success: result.success,
        postedComments: result.postedComments,
        failedComments: result.failedComments.length,
        fallback: result.fallbackToIssueComment,
      });

      if (!result.success) {
        // エラーを追跡
        await handleInngestError(
          new Error(`Failed to post incremental review: ${result.error}`),
          {
            context: {
              operation: "post-incremental-review",
              repository: { owner, name: repo },
              pullRequest: { number: prNumber },
            },
            prInfo: {
              installationId,
              owner,
              repo,
              prNumber,
            },
          }
        );
        throw new Error(`Failed to post incremental review: ${result.error}`);
      }
    });

    // Step 11: コメント発生を永続化（Phase 1）
    await step.run("record-comment-occurrences", async () => {
      const review = filteredIncrementalReview as typeof aiReview;
      if (
        !review ||
        !review.inlineComments ||
        review.inlineComments.length === 0
      ) {
        return;
      }

      try {
        for (const comment of review.inlineComments) {
          await recordCommentOccurrence({
            repositoryId: dbSetup.repositoryId,
            reviewId: dbSetup.reviewId,
            pullRequestId: dbSetup.pullRequestId,
            filePath: comment.path,
            lineNumber: comment.endLine,
            commentBody: comment.body,
            severity: comment.severity as
              | "CRITICAL"
              | "IMPORTANT"
              | "INFO"
              | "NITPICK",
          });
        }

        console.log(
          `[Inngest] Recorded ${review.inlineComments.length} comment occurrences (incremental)`
        );
      } catch (error) {
        console.warn("[Inngest] Failed to record comment occurrences:", error);
      }
    });

    // Step 12: テスト生成をトリガー（Phase 4）
    await step.run("trigger-test-generation", async () => {
      if (process.env.TEST_GENERATION_ENABLED !== "true") {
        console.log("[Inngest] Test generation disabled (incremental)");
        return { triggered: false };
      }

      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files to generate tests for (incremental)");
        return { triggered: false };
      }

      await inngest.send({
        name: "github/generate-tests",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha: afterSha,
          reviewId: dbSetup.reviewId,
          useAI: process.env.TEST_GENERATION_USE_AI !== "false",
          maxFunctions: parseInt(
            process.env.TEST_GENERATION_MAX_FUNCTIONS || "5",
            10
          ),
        },
      });

      console.log("[Inngest] Test generation triggered (incremental)");
      return { triggered: true };
    });

    // Step 13: ドキュメント分析をトリガー（Phase 5）
    await step.run("trigger-documentation-analysis", async () => {
      if (process.env.DOC_GENERATION_ENABLED !== "true") {
        console.log("[Inngest] Documentation analysis disabled (incremental)");
        return { triggered: false };
      }

      if (parsedData.files.length === 0) {
        console.log(
          "[Inngest] No files for documentation analysis (incremental)"
        );
        return { triggered: false };
      }

      await inngest.send({
        name: "github/analyze-documentation",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha: afterSha,
          reviewId: dbSetup.reviewId,
          useAI: process.env.DOC_GENERATION_USE_AI !== "false",
          language:
            (process.env.DOC_GENERATION_LANGUAGE as "ja" | "en") || "ja",
          analyzeReadme: process.env.DOC_ANALYZE_README !== "false",
        },
      });

      console.log("[Inngest] Documentation analysis triggered (incremental)");
      return { triggered: true };
    });

    // Step 14: パフォーマンス分析をトリガー（Phase 8）
    await step.run("trigger-performance-analysis", async () => {
      if (process.env.PERFORMANCE_ANALYSIS_ENABLED !== "true") {
        console.log("[Inngest] Performance analysis disabled (incremental)");
        return { triggered: false };
      }

      if (parsedData.files.length === 0) {
        console.log(
          "[Inngest] No files for performance analysis (incremental)"
        );
        return { triggered: false };
      }

      await inngest.send({
        name: "github/analyze-performance",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha: afterSha,
          reviewId: dbSetup.reviewId,
          language:
            (process.env.PERFORMANCE_ANALYSIS_LANGUAGE as "ja" | "en") || "ja",
          detectNPlusOne: process.env.PERFORMANCE_DETECT_NPLUSONE !== "false",
          detectMemoryLeaks:
            process.env.PERFORMANCE_DETECT_MEMORY_LEAKS !== "false",
          detectReactRerenders:
            process.env.PERFORMANCE_DETECT_REACT_RERENDERS !== "false",
          detectInefficientLoops:
            process.env.PERFORMANCE_DETECT_INEFFICIENT_LOOPS !== "false",
          detectLargeBundleImports:
            process.env.PERFORMANCE_DETECT_LARGE_BUNDLES !== "false",
        },
      });

      console.log("[Inngest] Performance analysis triggered (incremental)");
      return { triggered: true };
    });

    // Step 15: セキュリティスキャンをトリガー（Phase 10）
    await step.run("trigger-security-scan", async () => {
      if (process.env.SECURITY_SCAN_ENABLED !== "true") {
        console.log("[Inngest] Security scan disabled (incremental)");
        return { triggered: false };
      }

      if (parsedData.files.length === 0) {
        console.log("[Inngest] No files for security scan (incremental)");
        return { triggered: false };
      }

      await inngest.send({
        name: "github/scan-security",
        data: {
          installationId,
          owner,
          repo,
          prNumber,
          headSha: afterSha,
          reviewId: dbSetup.reviewId,
          language: (process.env.SECURITY_SCAN_LANGUAGE as "ja" | "en") || "ja",
          detectSqlInjection:
            process.env.SECURITY_DETECT_SQL_INJECTION !== "false",
          detectXss: process.env.SECURITY_DETECT_XSS !== "false",
          detectSecrets: process.env.SECURITY_DETECT_SECRETS !== "false",
          detectAuthIssues: process.env.SECURITY_DETECT_AUTH_ISSUES !== "false",
          minSeverity:
            (process.env.SECURITY_MIN_SEVERITY as
              | "CRITICAL"
              | "HIGH"
              | "MEDIUM"
              | "LOW") || "MEDIUM",
          maxIssues: parseInt(process.env.SECURITY_MAX_ISSUES || "20", 10),
        },
      });

      console.log("[Inngest] Security scan triggered (incremental)");
      return { triggered: true };
    });

    console.log("[Inngest] Incremental PR review completed", { prNumber });

    return {
      success: true,
      prNumber,
      reviewId: dbSetup.reviewId,
      incremental: true,
    };
  }
);
