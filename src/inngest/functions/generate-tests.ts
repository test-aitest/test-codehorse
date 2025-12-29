/**
 * Phase 4: Generate Tests Inngest Function
 *
 * PRの新しい関数に対してテストを自動生成
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit, getFileContent } from "@/lib/github/client";
import { parseDiff } from "@/lib/diff/parser";
import { filterReviewableFiles } from "@/lib/diff/filter";
import {
  analyzeFunctions,
  extractNewFunctions,
  isTestableFunction,
  calculateComplexity,
  type FunctionInfo,
} from "@/lib/analysis/function-analyzer";
import { detectEdgeCases, type EdgeCaseAnalysis } from "@/lib/analysis/edge-case-detector";
import {
  generateTests,
  detectTestFramework,
  formatTestSummaryMarkdown,
  type GeneratedTestResult,
} from "@/lib/ai/test-generator";
import { TestFramework } from "@prisma/client";

// ========================================
// メインInngest関数
// ========================================

export const generateTestsForPR = inngest.createFunction(
  {
    id: "generate-tests-for-pr",
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/generate-tests" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      headSha,
      installationId,
      reviewId,
      useAI = true,
      maxFunctions = 5,
    } = event.data;

    console.log("[Inngest] Starting test generation", {
      owner,
      repo,
      prNumber,
      headSha,
    });

    // Step 1: PR差分を取得
    const diffData = await step.run("fetch-pr-diff", async () => {
      const octokit = await getInstallationOctokit(installationId);

      const { data: prDetails } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const { data: diff } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      });

      return {
        diff: diff as unknown as string,
        baseSha: prDetails.base.sha,
      };
    });

    // Step 2: 差分をパースしてテスト対象ファイルを特定
    const targetFiles = await step.run("identify-target-files", async () => {
      const parsed = parseDiff(diffData.diff);
      const reviewable = filterReviewableFiles(parsed.files);

      // テストファイル自体は除外、新しい/変更されたファイルのみ
      const candidates = reviewable.filter(
        f => !f.newPath.includes(".test.") &&
            !f.newPath.includes(".spec.") &&
            (f.type === "add" || f.type === "modify") &&
            (f.newPath.endsWith(".ts") || f.newPath.endsWith(".tsx") ||
             f.newPath.endsWith(".js") || f.newPath.endsWith(".jsx"))
      );

      return candidates.map(f => ({
        path: f.newPath,
        type: f.type,
        diff: f.hunks.map(h => h.changes.map(c => c.content).join("\n")).join("\n"),
      }));
    });

    if (targetFiles.length === 0) {
      console.log("[Inngest] No target files for test generation");
      return { success: true, generated: 0 };
    }

    // Step 3: ファイルごとに関数を抽出
    const functionsToTest = await step.run("extract-functions", async () => {
      const allFunctions: Array<{
        func: FunctionInfo;
        analysis: EdgeCaseAnalysis;
        filePath: string;
        fileContent: string;
      }> = [];

      for (const file of targetFiles.slice(0, 10)) {
        try {
          // ファイルの完全な内容を取得
          const content = await getFileContent(installationId, owner, repo, file.path, headSha);
          if (!content) continue;

          // 新しく追加された関数を抽出
          let functions: FunctionInfo[];

          if (file.type === "add") {
            // 新規ファイルの場合は全関数を対象
            const analysis = analyzeFunctions(file.path, content);
            functions = analysis.functions;
          } else {
            // 変更ファイルの場合は差分内の関数のみ
            functions = extractNewFunctions(file.path, file.diff, content);
          }

          // テスト可能で複雑度が一定以上の関数をフィルタ
          const testable = functions
            .filter(f => isTestableFunction(f))
            .filter(f => calculateComplexity(f) >= 2) // 最低限の複雑度
            .slice(0, 3); // ファイルあたり最大3関数

          // エッジケースを検出
          for (const func of testable) {
            const analysis = detectEdgeCases(func);
            allFunctions.push({
              func,
              analysis,
              filePath: file.path,
              fileContent: content,
            });
          }
        } catch (error) {
          console.warn(`[Inngest] Failed to process ${file.path}:`, error);
        }
      }

      // 複雑度でソートして上位を返す
      return allFunctions
        .sort((a, b) => calculateComplexity(b.func) - calculateComplexity(a.func))
        .slice(0, maxFunctions);
    });

    if (functionsToTest.length === 0) {
      console.log("[Inngest] No testable functions found");
      return { success: true, generated: 0 };
    }

    console.log(`[Inngest] Found ${functionsToTest.length} functions to test`);

    // Step 4: テストフレームワークを検出
    const framework = await step.run("detect-framework", async () => {
      try {
        const packageJson = await getFileContent(installationId, owner, repo, "package.json", headSha);
        if (packageJson) {
          const pkg = JSON.parse(packageJson);
          return detectTestFramework(pkg);
        }
      } catch (error) {
        console.warn("[Inngest] Failed to detect test framework:", error);
      }

      return "VITEST" as TestFramework;
    });

    // Step 5: テストを生成
    const generatedTests = await step.run("generate-tests", async () => {
      const results: GeneratedTestResult[] = [];

      for (const { func, analysis } of functionsToTest) {
        try {
          const result = await generateTests(func, analysis, {
            framework,
            useAI,
            useMocks: func.usedAPIs.length > 0,
            maxTests: analysis.recommendedTestCount,
          });
          results.push(result);
        } catch (error) {
          console.warn(`[Inngest] Failed to generate tests for ${func.name}:`, error);
        }
      }

      return results;
    });

    // Step 6: 生成結果をDBに保存
    await step.run("save-generated-tests", async () => {
      for (const test of generatedTests) {
        await prisma.generatedTest.create({
          data: {
            reviewId,
            filePath: test.filePath,
            functionName: test.functionName,
            testCode: test.testCode,
            testFramework: test.framework,
            edgeCases: test.edgeCases,
          },
        });
      }

      console.log(`[Inngest] Saved ${generatedTests.length} generated tests`);
    });

    // Step 7: PRにコメントとして投稿（オプション）
    const summary = await step.run("post-summary", async () => {
      if (generatedTests.length === 0) {
        return null;
      }

      const summaryMarkdown = formatTestSummaryMarkdown(generatedTests);

      // PRコメントとして投稿
      const octokit = await getInstallationOctokit(installationId);

      const commentBody = `## 🧪 テスト生成提案

${summaryMarkdown}

---

<details>
<summary>📝 生成されたテストコードを見る</summary>

${generatedTests.map(t => `
### \`${t.functionName}\`

\`\`\`typescript
${t.testCode}
\`\`\`
`).join("\n")}

</details>

> 💡 これらのテストは自動生成されたものです。プロジェクトに合わせて調整してください。
`;

      try {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: commentBody,
        });

        return { posted: true };
      } catch (error) {
        console.warn("[Inngest] Failed to post test generation summary:", error);
        return { posted: false, error: (error as Error).message };
      }
    });

    console.log("[Inngest] Test generation completed", {
      prNumber,
      generated: generatedTests.length,
    });

    return {
      success: true,
      generated: generatedTests.length,
      functions: generatedTests.map(t => t.functionName),
      summary,
    };
  }
);

