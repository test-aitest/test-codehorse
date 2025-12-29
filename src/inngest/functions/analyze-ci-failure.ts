/**
 * Phase 9: Analyze CI Failure Inngest Function
 *
 * CIの失敗を分析し、原因特定と修正提案を生成
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit } from "@/lib/github/client";
import {
  fetchAndAnalyzeCILogs,
  isCIAnalysisEnabled,
  type CIProviderType,
  type CIFailureAnalysisResult,
} from "@/lib/ci";
import type { CIProvider, CIFailureType } from "@prisma/client";

// ========================================
// メインInngest関数
// ========================================

export const analyzeCIFailure = inngest.createFunction(
  {
    id: "analyze-ci-failure",
    concurrency: {
      limit: 2,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/analyze-ci-failure" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      pullRequestId,
      checkRunId,
      installationId,
      provider = "GITHUB_ACTIONS",
      language = "ja",
      enableSimilaritySearch = true,
    } = event.data;

    console.log("[Inngest] Starting CI failure analysis", {
      owner,
      repo,
      prNumber,
      checkRunId,
    });

    // CI分析が無効な場合はスキップ
    if (!isCIAnalysisEnabled()) {
      console.log("[Inngest] CI analysis is disabled");
      return {
        success: true,
        skipped: true,
        reason: "CI analysis is disabled",
      };
    }

    // Step 1: CIログを取得して分析
    const analysisResult = await step.run("analyze-ci-logs", async () => {
      try {
        const result = await fetchAndAnalyzeCILogs({
          provider: provider as CIProviderType,
          owner,
          repo,
          checkRunId,
          installationId,
          options: {
            language: language as "ja" | "en",
            enableSimilaritySearch,
            maxSuggestions: 5,
          },
        });

        return result;
      } catch (error) {
        console.error("[Inngest] Failed to analyze CI logs:", error);
        throw error;
      }
    });

    console.log("[Inngest] CI analysis completed", {
      failureType: analysisResult.failureType,
      confidence: analysisResult.confidence,
      suggestionsCount: analysisResult.suggestions.length,
    });

    // Step 2: 分析結果をDBに保存
    const savedAnalysis = await step.run("save-analysis", async () => {
      try {
        const analysis = await prisma.cIFailureAnalysis.create({
          data: {
            pullRequestId,
            checkRunId: String(checkRunId),
            provider: provider as CIProvider,
            failureType: analysisResult.failureType as CIFailureType,
            rawLog: "", // ログは大きいため保存しない（必要なら後で取得）
            analysis: analysisResult.detailedAnalysis,
            suggestedFix: formatSuggestionsForStorage(analysisResult),
          },
        });

        console.log("[Inngest] Saved CI failure analysis:", analysis.id);
        return analysis;
      } catch (error) {
        console.error("[Inngest] Failed to save analysis:", error);
        throw error;
      }
    });

    // Step 3: PRにコメントを投稿
    const commentResult = await step.run("post-comment", async () => {
      try {
        const octokit = await getInstallationOctokit(installationId);
        const commentBody = formatAnalysisComment(analysisResult, language as "ja" | "en");

        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: commentBody,
        });

        return { posted: true };
      } catch (error) {
        console.warn("[Inngest] Failed to post CI analysis comment:", error);
        return { posted: false, error: (error as Error).message };
      }
    });

    return {
      success: true,
      analysisId: savedAnalysis.id,
      failureType: analysisResult.failureType,
      confidence: analysisResult.confidence,
      suggestionsCount: analysisResult.suggestions.length,
      commentPosted: commentResult.posted,
    };
  }
);

// ========================================
// Check Run完了時のハンドラー
// ========================================

export const handleCheckRunCompleted = inngest.createFunction(
  {
    id: "handle-check-run-completed",
    concurrency: {
      limit: 5,
      key: "event.data.installationId",
    },
    retries: 1,
  },
  { event: "github/check_run.completed" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      pullRequestId,
      checkRunId,
      checkRunName,
      conclusion,
      installationId,
    } = event.data;

    // 失敗した場合のみ処理
    if (conclusion !== "failure" && conclusion !== "timed_out") {
      console.log("[Inngest] Check run succeeded, skipping analysis");
      return {
        success: true,
        skipped: true,
        reason: `Check run conclusion: ${conclusion}`,
      };
    }

    // PRに紐づいていない場合はスキップ
    if (!prNumber || !pullRequestId) {
      console.log("[Inngest] No PR associated, skipping analysis");
      return {
        success: true,
        skipped: true,
        reason: "No PR associated",
      };
    }

    // CI分析が無効な場合はスキップ
    if (!isCIAnalysisEnabled()) {
      console.log("[Inngest] CI analysis is disabled");
      return {
        success: true,
        skipped: true,
        reason: "CI analysis is disabled",
      };
    }

    console.log("[Inngest] Check run failed, triggering analysis", {
      checkRunId,
      checkRunName,
      conclusion,
    });

    // 分析イベントを発火
    await step.sendEvent("trigger-analysis", {
      name: "github/analyze-ci-failure",
      data: {
        installationId,
        owner,
        repo,
        prNumber,
        pullRequestId,
        checkRunId,
        provider: "GITHUB_ACTIONS",
        language: "ja",
        enableSimilaritySearch: true,
      },
    });

    return {
      success: true,
      triggered: true,
    };
  }
);

// ========================================
// ヘルパー関数
// ========================================

/**
 * 提案をストレージ用にフォーマット
 */
function formatSuggestionsForStorage(result: CIFailureAnalysisResult): string {
  const suggestions = result.suggestions.map((s, i) => {
    let text = `${i + 1}. ${s.title}\n   ${s.description}`;
    if (s.command) {
      text += `\n   コマンド: ${s.command}`;
    }
    return text;
  });

  return suggestions.join("\n\n");
}

/**
 * 分析結果をPRコメント用にフォーマット
 */
function formatAnalysisComment(result: CIFailureAnalysisResult, language: "ja" | "en"): string {
  const isJa = language === "ja";
  const sections: string[] = [];

  // ヘッダー
  sections.push(isJa ? "## 🔍 CI失敗分析レポート" : "## 🔍 CI Failure Analysis Report");
  sections.push("");

  // サマリー
  sections.push(isJa ? "### 📋 概要" : "### 📋 Summary");
  sections.push("");
  sections.push(result.rootCauseSummary);
  sections.push("");

  // 信頼度
  const confidencePercent = Math.round(result.confidence * 100);
  const confidenceLabel = confidencePercent >= 80
    ? (isJa ? "高" : "High")
    : confidencePercent >= 50
      ? (isJa ? "中" : "Medium")
      : (isJa ? "低" : "Low");
  sections.push(`**${isJa ? "分析信頼度" : "Analysis Confidence"}**: ${confidenceLabel} (${confidencePercent}%)`);
  sections.push("");

  // 影響を受けるファイル
  if (result.affectedFiles.length > 0) {
    sections.push(isJa ? "### 📁 影響を受けるファイル" : "### 📁 Affected Files");
    sections.push("");
    for (const file of result.affectedFiles.slice(0, 5)) {
      const severityIcon = getSeverityIcon(file.severity);
      const location = file.lineNumber ? `${file.filePath}:${file.lineNumber}` : file.filePath;
      sections.push(`- ${severityIcon} \`${location}\`: ${file.issue}`);
    }
    if (result.affectedFiles.length > 5) {
      sections.push(`- ${isJa ? `...他 ${result.affectedFiles.length - 5} ファイル` : `...and ${result.affectedFiles.length - 5} more files`}`);
    }
    sections.push("");
  }

  // 修正提案
  if (result.suggestions.length > 0) {
    sections.push(isJa ? "### 💡 修正提案" : "### 💡 Suggested Fixes");
    sections.push("");
    for (const suggestion of result.suggestions.slice(0, 5)) {
      const priorityIcon = getPriorityIcon(suggestion.priority);
      sections.push(`#### ${priorityIcon} ${suggestion.title}`);
      sections.push("");
      sections.push(suggestion.description);
      if (suggestion.command) {
        sections.push("");
        sections.push("```bash");
        sections.push(suggestion.command);
        sections.push("```");
      }
      sections.push("");
    }
  }

  // 関連リンク
  if (result.relatedLinks.length > 0) {
    sections.push(isJa ? "### 📚 参考リンク" : "### 📚 Related Links");
    sections.push("");
    for (const link of result.relatedLinks) {
      sections.push(`- [${link.title}](${link.url})`);
    }
    sections.push("");
  }

  // フッター
  sections.push("---");
  sections.push("");
  sections.push(
    isJa
      ? "> 🤖 このレポートは自動生成されたものです。分析結果が役に立った場合は、👍 でリアクションしてください。"
      : "> 🤖 This report was automatically generated. If this analysis was helpful, please react with 👍."
  );

  return sections.join("\n");
}

/**
 * 重要度アイコンを取得
 */
function getSeverityIcon(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "🔵";
    default:
      return "⚪";
  }
}

/**
 * 優先度アイコンを取得
 */
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case "high":
      return "🔥";
    case "medium":
      return "⚡";
    case "low":
      return "💡";
    default:
      return "📌";
  }
}
