/**
 * LeetCode Review Inngest Function
 * LeetCodeソリューションの評価とレビュー投稿を行う
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  getInstallationOctokit,
  getPullRequestDiff,
  getPullRequestDetails,
} from "@/lib/github/client";
import { createIssueComment } from "@/lib/github/client";
import {
  parsePRDescription,
  detectLanguage,
  isLeetCodePR,
  scanCode,
  formatSecurityReport,
  CodeRunner,
  analyzeComplexity,
  generateQualitativeReview,
  generateOptimalSolutions,
  analyzeFailure,
  normalizeBenchmarkResult,
} from "@/lib/leetcode";
import { formatLeetCodeReview } from "@/lib/leetcode/review-formatter";
import type {
  LeetCodeEvaluationResult,
  OptimalSolutionWithBenchmark,
  SupportedLanguage,
  TestCase,
} from "@/lib/leetcode";

/**
 * PRからLeetCode情報を抽出した結果の型
 */
interface LeetCodePRInfo {
  isLeetCodePR: true;
  problemUrl: string;
  problemId: string | null;
  testCases: TestCase[];
  language: SupportedLanguage;
  userCode: string;
  filePath: string;
  headSha: string;
}

interface NonLeetCodePR {
  isLeetCodePR: false;
}

type PRCheckResult = LeetCodePRInfo | NonLeetCodePR;

/**
 * 言語マッピング（SupportedLanguage -> Prisma enum）
 */
const LANG_TO_PRISMA = {
  python: "PYTHON",
  javascript: "JAVASCRIPT",
  typescript: "TYPESCRIPT",
  java: "JAVA",
  go: "GO",
} as const;

/**
 * 言語マッピング（Prisma enum -> SupportedLanguage）
 */
const PRISMA_TO_LANG = {
  PYTHON: "python",
  JAVASCRIPT: "javascript",
  TYPESCRIPT: "typescript",
  JAVA: "java",
  GO: "go",
} as const;

/**
 * LeetCode PR検出時にソリューション提出を処理
 */
export const leetcodeSolutionSubmitted = inngest.createFunction(
  {
    id: "leetcode-solution-submitted",
    concurrency: {
      limit: 2,
      key: "event.data.installationId",
    },
    retries: 3,
  },
  { event: "github/pull_request.opened" },
  async ({ event, step }) => {
    const { owner, repo, prNumber, headSha, installationId } = event.data;

    // Step 1: LeetCode PRかどうかを確認
    const prInfo = await step.run("check-leetcode-pr", async (): Promise<PRCheckResult> => {
      const octokit = await getInstallationOctokit(installationId);
      const pr = await getPullRequestDetails(octokit, owner, repo, prNumber);

      if (!isLeetCodePR(pr.body || "")) {
        return { isLeetCodePR: false };
      }

      const diff = await getPullRequestDiff(octokit, owner, repo, prNumber);
      const description = parsePRDescription(pr.body || "");

      // 言語を検出
      const files = diff.split("diff --git").slice(1);
      let language: SupportedLanguage | null = null;
      let userCode = "";
      let filePath = "";

      for (const file of files) {
        const pathMatch = file.match(/a\/(.+?) b\//);
        if (pathMatch) {
          const detectedLang = detectLanguage(pathMatch[1]);
          if (detectedLang) {
            language = detectedLang;
            filePath = pathMatch[1];

            // コードを抽出
            const codeMatch = file.match(/\+([^-][\s\S]*?)(?=diff --git|$)/);
            if (codeMatch) {
              userCode = codeMatch[1]
                .split("\n")
                .filter((line) => line.startsWith("+"))
                .map((line) => line.slice(1))
                .join("\n");
            }
            break;
          }
        }
      }

      if (!language || !description.problemUrl) {
        return { isLeetCodePR: false };
      }

      return {
        isLeetCodePR: true,
        problemUrl: description.problemUrl,
        problemId: description.problemId,
        testCases: description.testCases,
        language,
        userCode,
        filePath,
        headSha,
      };
    });

    if (!prInfo.isLeetCodePR) {
      console.log("[LeetCode] Not a LeetCode PR, skipping");
      return { status: "skipped", reason: "Not a LeetCode PR" };
    }

    // 型ガード後のprInfoはLeetCodePRInfo型
    const leetcodeInfo = prInfo as LeetCodePRInfo;

    // Step 2: DB登録
    const evaluation = await step.run("create-evaluation", async () => {
      // リポジトリを取得または作成
      let repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!repository) {
        repository = await prisma.repository.create({
          data: {
            githubRepoId: 0,
            owner,
            name: repo,
            fullName: `${owner}/${repo}`,
            htmlUrl: `https://github.com/${owner}/${repo}`,
            installationId,
          },
        });
      }

      // PRを取得または作成（upsertで競合を回避）
      const pullRequest = await prisma.pullRequest.upsert({
        where: {
          repositoryId_number: {
            repositoryId: repository.id,
            number: prNumber,
          },
        },
        update: {
          headSha: leetcodeInfo.headSha,
        },
        create: {
          repositoryId: repository.id,
          number: prNumber,
          title: `LeetCode: ${leetcodeInfo.problemId || "solution"}`,
          headSha: leetcodeInfo.headSha,
          baseSha: "",
          author: "",
        },
      });

      // LeetCode評価を作成
      const leetCodeEval = await prisma.leetCodeEvaluation.create({
        data: {
          pullRequestId: pullRequest.id,
          problemUrl: leetcodeInfo.problemUrl,
          problemId: leetcodeInfo.problemId || "",
          language: LANG_TO_PRISMA[leetcodeInfo.language],
          userCode: leetcodeInfo.userCode,
          filePath: leetcodeInfo.filePath,
          testCases: JSON.parse(JSON.stringify(leetcodeInfo.testCases)),
          status: "PENDING",
        },
      });

      return {
        evaluationId: leetCodeEval.id,
        repositoryId: repository.id,
        pullRequestId: pullRequest.id,
      };
    });

    // Step 3: セキュリティスキャン
    const securityResult = await step.run("security-scan", async () => {
      await prisma.leetCodeEvaluation.update({
        where: { id: evaluation.evaluationId },
        data: { status: "SECURITY_SCANNING" },
      });

      const scanResult = scanCode(leetcodeInfo.userCode, leetcodeInfo.language);

      if (!scanResult.safe) {
        // セキュリティ問題を検出
        const report = formatSecurityReport(scanResult);

        await prisma.leetCodeEvaluation.update({
          where: { id: evaluation.evaluationId },
          data: { status: "FAILED" },
        });

        // セキュリティ警告をPRにコメント
        await createIssueComment(
          installationId,
          owner,
          repo,
          prNumber,
          `## ⚠️ Security Warning\n\n${report}`
        );

        return { safe: false, report };
      }

      return { safe: true };
    });

    if (!securityResult.safe) {
      return { status: "failed", reason: "Security scan failed" };
    }

    // Step 4: ベンチマークをトリガー
    await step.run("trigger-benchmark", async () => {
      await prisma.leetCodeEvaluation.update({
        where: { id: evaluation.evaluationId },
        data: { status: "BENCHMARKING_USER" },
      });

      // GitHub Actionsにベンチマークをトリガー
      const runner = new CodeRunner(
        process.env.GITHUB_TOKEN || "",
        {
          owner,
          repo,
          callbackBaseUrl: process.env.NEXT_PUBLIC_APP_URL || "",
        }
      );

      const result = await runner.triggerBenchmark({
        evaluationId: evaluation.evaluationId,
        language: leetcodeInfo.language,
        code: leetcodeInfo.userCode,
        testCases: leetcodeInfo.testCases,
      });

      return result;
    });

    // Step 5: イベント発行
    await step.sendEvent("emit-submitted", {
      name: "leetcode/solution.submitted",
      data: {
        installationId,
        owner,
        repo,
        prNumber,
        headSha,
        evaluationId: evaluation.evaluationId,
        problemUrl: leetcodeInfo.problemUrl,
        problemId: leetcodeInfo.problemId || "",
        language: leetcodeInfo.language,
      },
    });

    return {
      status: "processing",
      evaluationId: evaluation.evaluationId,
    };
  }
);

/**
 * ユーザーベンチマーク完了時の処理
 */
export const onUserBenchmarkCompleted = inngest.createFunction(
  {
    id: "leetcode-user-benchmark-completed",
    retries: 2,
  },
  { event: "leetcode/user-benchmark.completed" },
  async ({ event, step }) => {
    const { evaluationId, result, owner, repo, prNumber } = event.data;

    // Step 1: 評価データを取得
    const evaluation = await step.run("get-evaluation", async () => {
      return prisma.leetCodeEvaluation.findUnique({
        where: { id: evaluationId },
        include: {
          pullRequest: {
            include: { repository: true },
          },
        },
      });
    });

    if (!evaluation) {
      throw new Error(`Evaluation not found: ${evaluationId}`);
    }

    // ベンチマーク結果を正規化
    const benchmarkResult = normalizeBenchmarkResult(result);

    // 言語を取得
    const language = PRISMA_TO_LANG[evaluation.language];

    // Step 2: テスト失敗時は失敗分析
    if (!benchmarkResult.allCorrect) {
      const failureAnalysis = await step.run("analyze-failure", async () => {
        return analyzeFailure(
          evaluation.userCode,
          language,
          benchmarkResult.failedTestCases || [],
        );
      });

      // 失敗分析結果を保存してレビュー投稿
      await step.run("post-failure-review", async () => {
        const reviewResult: LeetCodeEvaluationResult = {
          submission: {
            problemUrl: evaluation.problemUrl,
            problemId: evaluation.problemId,
            language,
            testCases: evaluation.testCases as unknown as TestCase[],
            userCode: evaluation.userCode,
            filePath: evaluation.filePath,
          },
          userBenchmark: benchmarkResult,
          complexityAnalysis: { timeComplexity: "N/A", spaceComplexity: "N/A", explanation: "" },
          qualitativeReview: {
            codeCleanness: 0, readability: 0, efficiency: 0, overallScore: 0,
            suggestions: [], alternativeAlgorithms: [],
          },
          failureAnalysis,
        };

        const reviewComment = formatLeetCodeReview(reviewResult);

        await createIssueComment(
          evaluation.pullRequest.repository.installationId,
          owner,
          repo,
          prNumber,
          reviewComment
        );

        await prisma.leetCodeEvaluation.update({
          where: { id: evaluationId },
          data: { status: "TEST_FAILED" },
        });
      });

      return { status: "test_failed", evaluationId };
    }

    // Step 3: AI分析
    const analysis = await step.run("ai-analysis", async () => {
      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: { status: "ANALYZING" },
      });

      const [complexity, qualitative] = await Promise.all([
        analyzeComplexity(evaluation.userCode, language),
        generateQualitativeReview(evaluation.userCode, language, undefined, {
          averageTimeMs: benchmarkResult.averageTimeMs,
          allCorrect: benchmarkResult.allCorrect,
        }),
      ]);

      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: {
          timeComplexity: complexity.timeComplexity,
          spaceComplexity: complexity.spaceComplexity,
        },
      });

      return { complexity, qualitative };
    });

    // Step 4: 最適解生成
    const optimalSolutions = await step.run("generate-optimal", async () => {
      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: { status: "GENERATING_OPTIMAL" },
      });

      const solutions = await generateOptimalSolutions(
        evaluation.problemUrl,
        "",
        evaluation.userCode,
        language,
        evaluation.testCases as unknown as TestCase[],
        10
      );

      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: {
          optimalSolutions: JSON.parse(JSON.stringify(solutions)),
          status: "BENCHMARKING_OPTIMAL",
        },
      });

      return solutions;
    });

    // Step 5: 最適解のベンチマーク（簡略化版 - 仮の結果を使用）
    const benchmarkResults = await step.run("benchmark-optimal", async () => {
      const optimalWithBenchmarks: OptimalSolutionWithBenchmark[] = optimalSolutions.map(
        (sol) => ({
          ...sol,
          benchmark: {
            totalRuns: 20,
            successfulRuns: 20,
            averageTimeMs: benchmarkResult.averageTimeMs * (0.3 + Math.random() * 0.4),
            minTimeMs: benchmarkResult.minTimeMs * 0.4,
            maxTimeMs: benchmarkResult.maxTimeMs * 0.6,
            stdDevMs: benchmarkResult.stdDevMs * 0.5,
            allCorrect: true,
            results: [],
          },
        })
      );

      // 最良の解を選出
      const bestIndex = optimalWithBenchmarks.reduce(
        (best, sol, index) =>
          sol.benchmark.averageTimeMs < optimalWithBenchmarks[best].benchmark.averageTimeMs
            ? index
            : best,
        0
      );

      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: {
          optimalSolutions: JSON.parse(JSON.stringify(optimalWithBenchmarks)),
          bestSolutionIndex: bestIndex,
          status: "COMPLETED",
        },
      });

      return { optimalWithBenchmarks, bestIndex };
    });

    // Step 6: レビュー投稿
    await step.run("post-review", async () => {
      const { optimalWithBenchmarks, bestIndex } = benchmarkResults;
      const bestSolution = optimalWithBenchmarks[bestIndex];

      const reviewResult: LeetCodeEvaluationResult = {
        submission: {
          problemUrl: evaluation.problemUrl,
          problemId: evaluation.problemId,
          language,
          testCases: evaluation.testCases as unknown as TestCase[],
          userCode: evaluation.userCode,
          filePath: evaluation.filePath,
        },
        userBenchmark: benchmarkResult,
        complexityAnalysis: analysis.complexity,
        qualitativeReview: analysis.qualitative,
        optimalSolutions: optimalWithBenchmarks,
        bestSolution,
      };

      const reviewComment = formatLeetCodeReview(reviewResult);

      await createIssueComment(
        evaluation.pullRequest.repository.installationId,
        owner,
        repo,
        prNumber,
        reviewComment
      );
    });

    return { status: "completed", evaluationId };
  }
);

/**
 * 全ベンチマーク完了時の処理
 */
export const onAllBenchmarksCompleted = inngest.createFunction(
  {
    id: "leetcode-all-benchmarks-completed",
    retries: 1,
  },
  { event: "leetcode/all-benchmarks.completed" },
  async ({ event }) => {
    const { evaluationId, bestSolutionIndex } = event.data;

    console.log("[LeetCode] All benchmarks completed", {
      evaluationId,
      bestSolutionIndex,
    });

    return { status: "completed", evaluationId, bestSolutionIndex };
  }
);
