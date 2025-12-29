/**
 * Phase 8: Analyze Performance Inngest Function
 *
 * PRの変更ファイルに対してパフォーマンス問題を分析し、
 * N+1クエリ、メモリリーク、React再レンダリングなどを検出
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit, getFileContent } from "@/lib/github/client";
import { parseDiff } from "@/lib/diff/parser";
import { filterReviewableFiles } from "@/lib/diff/filter";
import {
  analyzeFilePerformance,
  isPerformanceAnalysisEnabled,
  type DetectedPerformanceIssue,
  type PerformanceAnalysisOptions,
} from "@/lib/performance";
import type { PerformanceIssueType, PerformanceSeverity } from "@prisma/client";

// ========================================
// 型定義
// ========================================

interface PerformanceSummary {
  totalIssues: number;
  critical: number;
  warning: number;
  info: number;
  byType: Record<string, number>;
  topIssues: DetectedPerformanceIssue[];
}

// ========================================
// メインInngest関数
// ========================================

export const analyzePerformanceForPR = inngest.createFunction(
  {
    id: "analyze-performance-for-pr",
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/analyze-performance" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      headSha,
      installationId,
      reviewId,
      language = "ja",
      detectNPlusOne = true,
      detectMemoryLeaks = true,
      detectReactRerenders = true,
      detectInefficientLoops = true,
      detectLargeBundleImports = true,
    } = event.data;

    console.log("[Inngest] Starting performance analysis", {
      owner,
      repo,
      prNumber,
      headSha,
    });

    // パフォーマンス分析が無効な場合はスキップ
    if (!isPerformanceAnalysisEnabled()) {
      console.log("[Inngest] Performance analysis is disabled");
      return {
        success: true,
        skipped: true,
        reason: "Performance analysis is disabled",
      };
    }

    // Step 1: リポジトリ存在確認
    await step.run("verify-repository", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      });

      if (!repository) {
        throw new Error(`Repository not found: ${owner}/${repo}`);
      }
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

    // Step 3: 差分をパースしてパフォーマンス分析対象ファイルを特定
    const targetFiles = await step.run("identify-target-files", async () => {
      const parsed = parseDiff(diffData.diff);
      const reviewable = filterReviewableFiles(parsed.files);

      // 対象ファイル（追加/変更されたソースコード）
      const candidates = reviewable.filter(
        f =>
          (f.type === "add" || f.type === "modify") &&
          (f.newPath.endsWith(".ts") ||
            f.newPath.endsWith(".tsx") ||
            f.newPath.endsWith(".js") ||
            f.newPath.endsWith(".jsx")) &&
          !f.newPath.includes(".test.") &&
          !f.newPath.includes(".spec.") &&
          !f.newPath.includes("__tests__") &&
          !f.newPath.includes(".d.ts")
      );

      return candidates.map(f => ({
        path: f.newPath,
        type: f.type,
      }));
    });

    if (targetFiles.length === 0) {
      console.log("[Inngest] No target files for performance analysis");
      return {
        success: true,
        analyzed: 0,
        issues: 0,
      };
    }

    // Step 4: 各ファイルのパフォーマンス分析を実行
    const analysisResults = await step.run("analyze-performance", async () => {
      const allIssues: DetectedPerformanceIssue[] = [];

      const options: PerformanceAnalysisOptions = {
        detectNPlusOne,
        detectMemoryLeaks,
        detectReactRerenders,
        detectInefficientLoops,
        detectLargeBundleImports,
        maxIssues: 50,
        minSeverity: "INFO",
        excludePatterns: ["node_modules/**", "*.test.*", "*.spec.*", "__tests__/**"],
      };

      // 最大20ファイルまで分析
      for (const file of targetFiles.slice(0, 20)) {
        try {
          const content = await getFileContent(
            installationId,
            owner,
            repo,
            file.path,
            headSha
          );

          if (!content) continue;

          const issues = analyzeFilePerformance(content, file.path, options);
          allIssues.push(...issues);
        } catch (error) {
          console.warn(`[Inngest] Failed to analyze ${file.path}:`, error);
        }
      }

      return allIssues;
    });

    if (analysisResults.length === 0) {
      console.log("[Inngest] No performance issues found");
      return {
        success: true,
        analyzed: targetFiles.length,
        issues: 0,
      };
    }

    console.log(`[Inngest] Found ${analysisResults.length} performance issues`);

    // Step 5: パフォーマンス問題をDBに保存
    await step.run("save-performance-issues", async () => {
      for (const issue of analysisResults) {
        try {
          await prisma.performanceIssue.create({
            data: {
              reviewId,
              filePath: issue.filePath,
              lineNumber: issue.lineNumber,
              endLineNumber: issue.endLineNumber,
              issueType: issue.issueType as PerformanceIssueType,
              severity: issue.severity as PerformanceSeverity,
              description: issue.description,
              suggestion: issue.suggestion,
              codeSnippet: issue.codeSnippet,
              estimatedImpact: issue.estimatedImpact,
            },
          });
        } catch (error) {
          console.warn(
            `[Inngest] Failed to save performance issue at ${issue.filePath}:${issue.lineNumber}:`,
            error
          );
        }
      }

      console.log(`[Inngest] Saved ${analysisResults.length} performance issues`);
    });

    // Step 6: サマリーを生成してPRにコメント
    const summary = await step.run("post-summary", async () => {
      // 重要な問題（CRITICAL/WARNING）のみをハイライト
      const importantIssues = analysisResults.filter(
        i => i.severity === "CRITICAL" || i.severity === "WARNING"
      );

      if (importantIssues.length === 0) {
        // INFOのみの場合はコメントしない
        return { posted: false, reason: "Only INFO level issues" };
      }

      const octokit = await getInstallationOctokit(installationId);
      const summaryData = createSummary(analysisResults);
      const commentBody = formatSummaryMarkdown(summaryData, language);

      try {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: commentBody,
        });

        return { posted: true };
      } catch (error) {
        console.warn("[Inngest] Failed to post performance summary:", error);
        return { posted: false, error: (error as Error).message };
      }
    });

    console.log("[Inngest] Performance analysis completed", {
      prNumber,
      analyzed: targetFiles.length,
      issues: analysisResults.length,
    });

    return {
      success: true,
      analyzed: targetFiles.length,
      issues: analysisResults.length,
      summary,
    };
  }
);

// ========================================
// ヘルパー関数
// ========================================

/**
 * サマリーを作成
 */
function createSummary(issues: DetectedPerformanceIssue[]): PerformanceSummary {
  const byType: Record<string, number> = {};
  let critical = 0;
  let warning = 0;
  let info = 0;

  for (const issue of issues) {
    // 種類別カウント
    byType[issue.issueType] = (byType[issue.issueType] || 0) + 1;

    // 重要度別カウント
    switch (issue.severity) {
      case "CRITICAL":
        critical++;
        break;
      case "WARNING":
        warning++;
        break;
      case "INFO":
        info++;
        break;
    }
  }

  // 重要な問題のトップ5
  const topIssues = issues
    .filter(i => i.severity === "CRITICAL" || i.severity === "WARNING")
    .slice(0, 5);

  return {
    totalIssues: issues.length,
    critical,
    warning,
    info,
    byType,
    topIssues,
  };
}

/**
 * サマリーをMarkdown形式にフォーマット
 */
function formatSummaryMarkdown(
  summary: PerformanceSummary,
  language: "ja" | "en"
): string {
  const isJa = language === "ja";

  const sections: string[] = [];

  // ヘッダー
  sections.push(isJa ? "## ⚡ パフォーマンス分析レポート" : "## ⚡ Performance Analysis Report");
  sections.push("");

  // 概要
  const summaryHeader = isJa ? "### 📊 概要" : "### 📊 Summary";
  sections.push(summaryHeader);
  sections.push("");

  if (summary.critical > 0) {
    sections.push(
      isJa
        ? `- 🔴 **重大な問題**: ${summary.critical}件`
        : `- 🔴 **Critical Issues**: ${summary.critical}`
    );
  }
  if (summary.warning > 0) {
    sections.push(
      isJa
        ? `- 🟡 **警告**: ${summary.warning}件`
        : `- 🟡 **Warnings**: ${summary.warning}`
    );
  }
  if (summary.info > 0) {
    sections.push(
      isJa
        ? `- 🔵 **情報**: ${summary.info}件`
        : `- 🔵 **Info**: ${summary.info}`
    );
  }
  sections.push("");

  // 種類別内訳
  const typeHeader = isJa ? "### 📂 問題の種類" : "### 📂 Issue Types";
  sections.push(typeHeader);
  sections.push("");

  const typeLabels: Record<string, { ja: string; en: string }> = {
    N_PLUS_ONE_QUERY: { ja: "N+1クエリ", en: "N+1 Query" },
    MEMORY_LEAK: { ja: "メモリリーク", en: "Memory Leak" },
    UNNECESSARY_RERENDER: { ja: "不要な再レンダリング", en: "Unnecessary Rerender" },
    INEFFICIENT_LOOP: { ja: "非効率なループ", en: "Inefficient Loop" },
    LARGE_BUNDLE_IMPORT: { ja: "大きなバンドルインポート", en: "Large Bundle Import" },
    BLOCKING_OPERATION: { ja: "ブロッキング操作", en: "Blocking Operation" },
    MISSING_MEMOIZATION: { ja: "メモ化の欠如", en: "Missing Memoization" },
    EXCESSIVE_DOM_ACCESS: { ja: "過度なDOMアクセス", en: "Excessive DOM Access" },
    MISSING_LAZY_LOAD: { ja: "遅延ロードの欠如", en: "Missing Lazy Load" },
  };

  for (const [type, count] of Object.entries(summary.byType)) {
    const label = typeLabels[type]?.[isJa ? "ja" : "en"] || type;
    sections.push(`- **${label}**: ${count}`);
  }
  sections.push("");

  // 重要な問題の詳細
  if (summary.topIssues.length > 0) {
    const detailsHeader = isJa
      ? "### 🔍 主要な問題"
      : "### 🔍 Top Issues";
    sections.push(detailsHeader);
    sections.push("");

    for (const issue of summary.topIssues) {
      const severityIcon = issue.severity === "CRITICAL" ? "🔴" : "🟡";
      sections.push(`#### ${severityIcon} ${issue.filePath}:${issue.lineNumber}`);
      sections.push("");
      sections.push(`**${issue.description}**`);
      sections.push("");

      if (issue.codeSnippet) {
        sections.push("```");
        sections.push(issue.codeSnippet);
        sections.push("```");
        sections.push("");
      }

      if (issue.suggestion) {
        sections.push(
          isJa
            ? `💡 **改善提案**: ${issue.suggestion.split("\n")[0]}`
            : `💡 **Suggestion**: ${issue.suggestion.split("\n")[0]}`
        );
        sections.push("");
      }
    }
  }

  // フッター
  sections.push("---");
  sections.push("");
  sections.push(
    isJa
      ? "> 🤖 このレポートは自動生成されたものです。パフォーマンス改善の参考にしてください。"
      : "> 🤖 This report was automatically generated. Use it as a reference for performance improvements."
  );

  return sections.join("\n");
}
