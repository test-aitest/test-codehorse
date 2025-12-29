/**
 * Phase 5: Analyze Documentation Inngest Function
 *
 * PRの変更ファイルに対してドキュメントギャップを分析し、
 * AIを使用してドキュメント提案を自動生成
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit, getFileContent } from "@/lib/github/client";
import { parseDiff } from "@/lib/diff/parser";
import { filterReviewableFiles } from "@/lib/diff/filter";
import {
  detectPublicAPIs,
  type PublicAPI,
} from "@/lib/analysis/public-api-detector";
import {
  analyzeDocumentation,
  formatDocGapsForPR,
  type DocumentationGap,
} from "@/lib/ai/doc-analyzer";
import {
  generateDocumentation,
  formatGeneratedDocsForPR,
  type GeneratedDocResult,
  type DocGenerationOptions,
} from "@/lib/ai/doc-generator";
import {
  analyzeReadme,
  createMissingReadmeResult,
  formatReadmeAnalysisMarkdown,
  type ReadmeAnalysisResult,
} from "@/lib/analysis/readme-analyzer";
import { DocGapType, DocSeverity, DocType } from "@prisma/client";

// ========================================
// メインInngest関数
// ========================================

export const analyzeDocumentationForPR = inngest.createFunction(
  {
    id: "analyze-documentation-for-pr",
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/analyze-documentation" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      headSha,
      installationId,
      reviewId,
      useAI = true,
      language = "ja",
      analyzeReadme: shouldAnalyzeReadme = true,
    } = event.data;

    console.log("[Inngest] Starting documentation analysis", {
      owner,
      repo,
      prNumber,
      headSha,
    });

    // Step 1: リポジトリ情報を取得
    const repoInfo = await step.run("get-repository-info", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error(`Repository not found: ${owner}/${repo}`);
      }

      return {
        repositoryId: repository.id,
      };
    });

    // Step 2: PR差分を取得
    const diffData = await step.run("fetch-pr-diff", async () => {
      const octokit = await getInstallationOctokit(installationId);

      const { data: diff } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: "diff" },
      });

      return {
        diff: diff as unknown as string,
      };
    });

    // Step 3: 差分をパースしてドキュメント対象ファイルを特定
    const targetFiles = await step.run("identify-target-files", async () => {
      const parsed = parseDiff(diffData.diff);
      const reviewable = filterReviewableFiles(parsed.files);

      // TypeScript/JavaScriptファイルのみ対象
      const candidates = reviewable.filter(
        f =>
          (f.type === "add" || f.type === "modify") &&
          (f.newPath.endsWith(".ts") ||
            f.newPath.endsWith(".tsx") ||
            f.newPath.endsWith(".js") ||
            f.newPath.endsWith(".jsx")) &&
          !f.newPath.includes(".test.") &&
          !f.newPath.includes(".spec.") &&
          !f.newPath.includes("__tests__")
      );

      return candidates.map(f => ({
        path: f.newPath,
        type: f.type,
      }));
    });

    // Step 4: ファイルごとにドキュメントギャップを分析
    const analysisResults = await step.run("analyze-documentation-gaps", async () => {
      const allGaps: DocumentationGap[] = [];
      const allAPIs: Map<string, PublicAPI> = new Map();

      for (const file of targetFiles.slice(0, 15)) {
        try {
          // ファイルの完全な内容を取得
          const content = await getFileContent(installationId, owner, repo, file.path, headSha);
          if (!content) continue;

          // 公開APIを検出
          const apiResult = detectPublicAPIs(file.path, content);
          for (const api of apiResult.apis) {
            allAPIs.set(`${file.path}:${api.name}`, api);
          }

          // ドキュメントギャップを分析
          const docResult = analyzeDocumentation(file.path, content, {
            checkIncomplete: true,
          });

          allGaps.push(...docResult.gaps);
        } catch (error) {
          console.warn(`[Inngest] Failed to analyze ${file.path}:`, error);
        }
      }

      return {
        gaps: allGaps,
        apis: Array.from(allAPIs.entries()),
      };
    });

    // Step 5: README分析（オプション）
    let readmeAnalysis: ReadmeAnalysisResult | null = null;

    if (shouldAnalyzeReadme) {
      readmeAnalysis = await step.run("analyze-readme", async () => {
        try {
          const readmeContent = await getFileContent(
            installationId,
            owner,
            repo,
            "README.md",
            headSha
          );

          if (readmeContent) {
            return analyzeReadme(readmeContent, "README.md", {
              projectType: "application",
            });
          } else {
            return createMissingReadmeResult("README.md");
          }
        } catch (error) {
          console.warn("[Inngest] Failed to analyze README:", error);
          return null;
        }
      });
    }

    // 重要なギャップのみをフィルタ（CRITICAL/HIGH）
    const importantGaps = analysisResults.gaps.filter(
      g => g.severity === "CRITICAL" || g.severity === "HIGH"
    );

    if (importantGaps.length === 0 && (!readmeAnalysis || readmeAnalysis.qualityScore >= 70)) {
      console.log("[Inngest] No significant documentation gaps found");
      return {
        success: true,
        analyzed: targetFiles.length,
        gaps: 0,
        generated: 0,
      };
    }

    console.log(`[Inngest] Found ${importantGaps.length} important documentation gaps`);

    // Step 6: AIでドキュメントを生成（重要なものに限定）
    const generatedDocs = await step.run("generate-documentation", async () => {
      const results: GeneratedDocResult[] = [];
      const apisMap = new Map(analysisResults.apis);

      // 生成対象を上位5件に制限
      const gapsToGenerate = importantGaps.slice(0, 5);

      const options: DocGenerationOptions = {
        useAI,
        language,
        style: "concise",
        includeExamples: false,
      };

      for (const gap of gapsToGenerate) {
        try {
          const apiKey = `${gap.filePath}:${gap.symbolName}`;
          const api = apisMap.get(apiKey);

          const result = await generateDocumentation(gap, api, options);
          results.push(result);
        } catch (error) {
          console.warn(`[Inngest] Failed to generate doc for ${gap.symbolName}:`, error);
        }
      }

      return results;
    });

    // Step 7: ドキュメントギャップをDBに保存
    await step.run("save-documentation-gaps", async () => {
      for (const gap of importantGaps) {
        try {
          await prisma.documentationGap.upsert({
            where: {
              repositoryId_filePath_symbolName_gapType: {
                repositoryId: repoInfo.repositoryId,
                filePath: gap.filePath,
                symbolName: gap.symbolName,
                gapType: gap.gapType as DocGapType,
              },
            },
            update: {
              severity: gap.severity as DocSeverity,
              currentDoc: gap.currentDoc,
              lineNumber: gap.lineNumber,
              reviewId,
              updatedAt: new Date(),
            },
            create: {
              repositoryId: repoInfo.repositoryId,
              reviewId,
              filePath: gap.filePath,
              symbolName: gap.symbolName,
              symbolType: gap.symbolType,
              gapType: gap.gapType as DocGapType,
              severity: gap.severity as DocSeverity,
              lineNumber: gap.lineNumber,
              currentDoc: gap.currentDoc,
            },
          });
        } catch (error) {
          console.warn(`[Inngest] Failed to save gap for ${gap.symbolName}:`, error);
        }
      }

      console.log(`[Inngest] Saved ${importantGaps.length} documentation gaps`);
    });

    // Step 8: 生成されたドキュメントをDBに保存
    await step.run("save-generated-docs", async () => {
      for (const doc of generatedDocs) {
        try {
          await prisma.generatedDoc.create({
            data: {
              reviewId,
              filePath: doc.filePath,
              symbolName: doc.symbolName,
              docType: doc.docType as DocType,
              generatedDoc: doc.generatedDoc,
            },
          });
        } catch (error) {
          console.warn(`[Inngest] Failed to save doc for ${doc.symbolName}:`, error);
        }
      }

      console.log(`[Inngest] Saved ${generatedDocs.length} generated docs`);
    });

    // Step 9: PRにコメントとして投稿
    const summary = await step.run("post-summary", async () => {
      if (importantGaps.length === 0 && generatedDocs.length === 0) {
        return null;
      }

      const octokit = await getInstallationOctokit(installationId);

      // コメント本文を構築
      const sections: string[] = [];

      // ドキュメントギャップサマリー
      if (importantGaps.length > 0) {
        // formatDocGapsForPRはDocAnalysisResultを期待するのでラップする
        const docResult = {
          gaps: importantGaps,
          apiAnalysis: {
            apis: [],
            errors: [],
            stats: {
              totalApis: importantGaps.length,
              documentedApis: 0,
              undocumentedApis: importantGaps.length,
              documentationRate: 0,
            },
          },
          summary: {
            totalAPIs: importantGaps.length,
            documentedAPIs: 0,
            documentationRate: 0,
            gapsBySeverity: {
              critical: importantGaps.filter(g => g.severity === "CRITICAL").length,
              high: importantGaps.filter(g => g.severity === "HIGH").length,
              medium: importantGaps.filter(g => g.severity === "MEDIUM").length,
              low: importantGaps.filter(g => g.severity === "LOW").length,
            },
            gapsByType: {} as Record<string, number>,
          },
        };
        sections.push(formatDocGapsForPR(docResult));
      }

      // README分析結果（スコアが低い場合のみ）
      if (readmeAnalysis && readmeAnalysis.qualityScore < 70) {
        sections.push(formatReadmeAnalysisMarkdown(readmeAnalysis));
      }

      // 生成されたドキュメント
      if (generatedDocs.length > 0) {
        sections.push(formatGeneratedDocsForPR(generatedDocs));
      }

      if (sections.length === 0) {
        return null;
      }

      const commentBody = `## 📖 ドキュメント分析レポート

${sections.join("\n\n---\n\n")}

---

> 🤖 このレポートは自動生成されたものです。プロジェクトに合わせてドキュメントを追加することを検討してください。
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
        console.warn("[Inngest] Failed to post documentation summary:", error);
        return { posted: false, error: (error as Error).message };
      }
    });

    console.log("[Inngest] Documentation analysis completed", {
      prNumber,
      analyzed: targetFiles.length,
      gaps: importantGaps.length,
      generated: generatedDocs.length,
    });

    return {
      success: true,
      analyzed: targetFiles.length,
      gaps: importantGaps.length,
      generated: generatedDocs.length,
      readmeScore: readmeAnalysis?.qualityScore,
      summary,
    };
  }
);
