/**
 * Phase 10: Security Scan Inngest Function
 *
 * PRの変更ファイルに対してセキュリティ脆弱性スキャンを実行し、
 * SQLインジェクション、XSS、機密情報漏洩などを検出
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit, getFileContent } from "@/lib/github/client";
import { parseDiff } from "@/lib/diff/parser";
import { filterReviewableFiles } from "@/lib/diff/filter";
import {
  scanFile,
  type DetectedVulnerability,
  type SecurityScanOptions,
  type SecurityScanStats,
} from "@/lib/security";
import type { VulnerabilityType, SecuritySeverity } from "@prisma/client";

// ========================================
// 型定義
// ========================================

interface SecuritySummary {
  totalVulnerabilities: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byType: Record<string, number>;
  topVulnerabilities: DetectedVulnerability[];
}

// ========================================
// 環境変数チェック
// ========================================

function isSecurityScanEnabled(): boolean {
  return process.env.SECURITY_SCAN_ENABLED !== "false";
}

// ========================================
// メインInngest関数
// ========================================

export const scanSecurityForPR = inngest.createFunction(
  {
    id: "scan-security-for-pr",
    concurrency: {
      limit: 1,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/scan-security" },
  async ({ event, step }) => {
    const {
      owner,
      repo,
      prNumber,
      headSha,
      installationId,
      reviewId,
      language = "ja",
      detectSqlInjection = true,
      detectXss = true,
      detectSecrets = true,
      detectAuthIssues = true,
      minSeverity = "LOW",
      maxIssues = 100,
    } = event.data;

    console.log("[Inngest] Starting security scan", {
      owner,
      repo,
      prNumber,
      headSha,
    });

    // セキュリティスキャンが無効な場合はスキップ
    if (!isSecurityScanEnabled()) {
      console.log("[Inngest] Security scan is disabled");
      return {
        success: true,
        skipped: true,
        reason: "Security scan is disabled",
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

    // Step 3: 差分をパースしてスキャン対象ファイルを特定
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
            f.newPath.endsWith(".jsx") ||
            f.newPath.endsWith(".vue") ||
            f.newPath.endsWith(".py") ||
            f.newPath.endsWith(".rb") ||
            f.newPath.endsWith(".php") ||
            f.newPath.endsWith(".java") ||
            f.newPath.endsWith(".go") ||
            f.newPath.endsWith(".rs") ||
            f.newPath.endsWith(".yaml") ||
            f.newPath.endsWith(".yml") ||
            f.newPath.endsWith(".json") ||
            f.newPath.endsWith(".env")) &&
          !f.newPath.includes(".test.") &&
          !f.newPath.includes(".spec.") &&
          !f.newPath.includes("__tests__") &&
          !f.newPath.includes(".d.ts") &&
          !f.newPath.includes("node_modules") &&
          !f.newPath.includes(".example")
      );

      return candidates.map(f => ({
        path: f.newPath,
        type: f.type,
      }));
    });

    if (targetFiles.length === 0) {
      console.log("[Inngest] No target files for security scan");
      return {
        success: true,
        scanned: 0,
        vulnerabilities: 0,
      };
    }

    // Step 4: 各ファイルのセキュリティスキャンを実行
    const scanResults = await step.run("scan-security", async () => {
      const allVulnerabilities: DetectedVulnerability[] = [];

      const options: SecurityScanOptions = {
        detectSqlInjection,
        detectXss,
        detectSecrets,
        detectAuthIssues,
        detectCommandInjection: true,
        detectPathTraversal: true,
        detectPrototypePollution: true,
        detectReDoS: false, // ReDoS検出は処理が重いのでデフォルトオフ
        minSeverity: minSeverity as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        maxIssues,
        excludePatterns: [
          "node_modules/**",
          "*.test.*",
          "*.spec.*",
          "__tests__/**",
          "*.example",
          "*.sample",
        ],
        language,
      };

      // 最大30ファイルまでスキャン
      for (const file of targetFiles.slice(0, 30)) {
        try {
          const content = await getFileContent(
            installationId,
            owner,
            repo,
            file.path,
            headSha
          );

          if (!content) continue;

          const vulnerabilities = scanFile(content, file.path, options);
          allVulnerabilities.push(...vulnerabilities);
        } catch (error) {
          console.warn(`[Inngest] Failed to scan ${file.path}:`, error);
        }
      }

      return allVulnerabilities;
    });

    if (scanResults.length === 0) {
      console.log("[Inngest] No security vulnerabilities found");
      return {
        success: true,
        scanned: targetFiles.length,
        vulnerabilities: 0,
      };
    }

    console.log(`[Inngest] Found ${scanResults.length} security vulnerabilities`);

    // Step 5: 脆弱性をDBに保存
    await step.run("save-vulnerabilities", async () => {
      for (const vuln of scanResults) {
        try {
          await prisma.securityVulnerability.create({
            data: {
              reviewId,
              filePath: vuln.filePath,
              lineNumber: vuln.lineNumber,
              endLineNumber: vuln.endLineNumber,
              vulnerabilityType: vuln.vulnerabilityType as VulnerabilityType,
              severity: vuln.severity as SecuritySeverity,
              cweId: vuln.cweId,
              owaspCategory: vuln.owaspCategory,
              description: vuln.description,
              remediation: vuln.remediation,
              codeSnippet: vuln.codeSnippet,
            },
          });
        } catch (error) {
          console.warn(
            `[Inngest] Failed to save vulnerability at ${vuln.filePath}:${vuln.lineNumber}:`,
            error
          );
        }
      }

      console.log(`[Inngest] Saved ${scanResults.length} vulnerabilities`);
    });

    // Step 6: サマリーを生成してPRにコメント
    const summary = await step.run("post-summary", async () => {
      // 重要な脆弱性（CRITICAL/HIGH）のみをハイライト
      const importantVulns = scanResults.filter(
        v => v.severity === "CRITICAL" || v.severity === "HIGH"
      );

      if (importantVulns.length === 0) {
        // MEDIUM/LOWのみの場合はコメントしない（ノイズを減らす）
        return { posted: false, reason: "Only MEDIUM/LOW severity issues" };
      }

      const octokit = await getInstallationOctokit(installationId);
      const summaryData = createSummary(scanResults);
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
        console.warn("[Inngest] Failed to post security summary:", error);
        return { posted: false, error: (error as Error).message };
      }
    });

    console.log("[Inngest] Security scan completed", {
      prNumber,
      scanned: targetFiles.length,
      vulnerabilities: scanResults.length,
    });

    return {
      success: true,
      scanned: targetFiles.length,
      vulnerabilities: scanResults.length,
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
function createSummary(vulnerabilities: DetectedVulnerability[]): SecuritySummary {
  const byType: Record<string, number> = {};
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const vuln of vulnerabilities) {
    // 種類別カウント
    byType[vuln.vulnerabilityType] = (byType[vuln.vulnerabilityType] || 0) + 1;

    // 重要度別カウント
    switch (vuln.severity) {
      case "CRITICAL":
        critical++;
        break;
      case "HIGH":
        high++;
        break;
      case "MEDIUM":
        medium++;
        break;
      case "LOW":
        low++;
        break;
    }
  }

  // 重要な脆弱性のトップ5
  const topVulnerabilities = vulnerabilities
    .filter(v => v.severity === "CRITICAL" || v.severity === "HIGH")
    .slice(0, 5);

  return {
    totalVulnerabilities: vulnerabilities.length,
    critical,
    high,
    medium,
    low,
    byType,
    topVulnerabilities,
  };
}

/**
 * サマリーをMarkdown形式にフォーマット
 */
function formatSummaryMarkdown(
  summary: SecuritySummary,
  language: "ja" | "en"
): string {
  const isJa = language === "ja";

  const sections: string[] = [];

  // ヘッダー
  sections.push(isJa ? "## 🔒 セキュリティスキャンレポート" : "## 🔒 Security Scan Report");
  sections.push("");

  // 警告バナー
  if (summary.critical > 0) {
    sections.push(
      isJa
        ? "⚠️ **重大なセキュリティ脆弱性が検出されました！** マージ前に必ず対応してください。"
        : "⚠️ **Critical security vulnerabilities detected!** Please address them before merging."
    );
    sections.push("");
  }

  // 概要
  const summaryHeader = isJa ? "### 📊 概要" : "### 📊 Summary";
  sections.push(summaryHeader);
  sections.push("");

  if (summary.critical > 0) {
    sections.push(
      isJa
        ? `- 🔴 **重大（CRITICAL）**: ${summary.critical}件`
        : `- 🔴 **Critical**: ${summary.critical}`
    );
  }
  if (summary.high > 0) {
    sections.push(
      isJa
        ? `- 🟠 **高（HIGH）**: ${summary.high}件`
        : `- 🟠 **High**: ${summary.high}`
    );
  }
  if (summary.medium > 0) {
    sections.push(
      isJa
        ? `- 🟡 **中（MEDIUM）**: ${summary.medium}件`
        : `- 🟡 **Medium**: ${summary.medium}`
    );
  }
  if (summary.low > 0) {
    sections.push(
      isJa
        ? `- 🟢 **低（LOW）**: ${summary.low}件`
        : `- 🟢 **Low**: ${summary.low}`
    );
  }
  sections.push("");

  // 種類別内訳
  const typeHeader = isJa ? "### 📂 脆弱性の種類" : "### 📂 Vulnerability Types";
  sections.push(typeHeader);
  sections.push("");

  const typeLabels: Record<string, { ja: string; en: string }> = {
    SQL_INJECTION: { ja: "SQLインジェクション", en: "SQL Injection" },
    XSS: { ja: "クロスサイトスクリプティング（XSS）", en: "Cross-Site Scripting (XSS)" },
    HARDCODED_SECRET: { ja: "ハードコードされた機密情報", en: "Hardcoded Secret" },
    COMMAND_INJECTION: { ja: "コマンドインジェクション", en: "Command Injection" },
    PATH_TRAVERSAL: { ja: "パストラバーサル", en: "Path Traversal" },
    BROKEN_AUTH: { ja: "認証の問題", en: "Broken Authentication" },
    INSECURE_COOKIE: { ja: "安全でないCookie", en: "Insecure Cookie" },
    CSRF: { ja: "CSRF", en: "CSRF" },
    OPEN_REDIRECT: { ja: "オープンリダイレクト", en: "Open Redirect" },
    PROTOTYPE_POLLUTION: { ja: "プロトタイプ汚染", en: "Prototype Pollution" },
    INSECURE_RANDOM: { ja: "安全でない乱数", en: "Insecure Random" },
    SENSITIVE_DATA_EXPOSURE: { ja: "機密データの露出", en: "Sensitive Data Exposure" },
    INSECURE_DESERIALIZATION: { ja: "安全でないデシリアライゼーション", en: "Insecure Deserialization" },
    MISSING_AUTH_CHECK: { ja: "認証チェックの欠如", en: "Missing Auth Check" },
  };

  for (const [type, count] of Object.entries(summary.byType)) {
    const label = typeLabels[type]?.[isJa ? "ja" : "en"] || type;
    sections.push(`- **${label}**: ${count}`);
  }
  sections.push("");

  // 重要な脆弱性の詳細
  if (summary.topVulnerabilities.length > 0) {
    const detailsHeader = isJa
      ? "### 🔍 検出された重要な脆弱性"
      : "### 🔍 Detected Critical Vulnerabilities";
    sections.push(detailsHeader);
    sections.push("");

    for (const vuln of summary.topVulnerabilities) {
      const severityIcon = vuln.severity === "CRITICAL" ? "🔴" : "🟠";
      const typeLabel = typeLabels[vuln.vulnerabilityType]?.[isJa ? "ja" : "en"] || vuln.vulnerabilityType;

      sections.push(`#### ${severityIcon} ${typeLabel}`);
      sections.push("");
      sections.push(`📍 **${isJa ? "ファイル" : "File"}**: \`${vuln.filePath}:${vuln.lineNumber}\``);

      if (vuln.cweId) {
        sections.push(`🏷️ **CWE**: [${vuln.cweId}](https://cwe.mitre.org/data/definitions/${vuln.cweId.replace("CWE-", "")}.html)`);
      }
      if (vuln.owaspCategory) {
        sections.push(`📋 **OWASP Top 10**: ${vuln.owaspCategory}`);
      }

      sections.push("");
      sections.push(`**${isJa ? "説明" : "Description"}**: ${vuln.description}`);
      sections.push("");

      if (vuln.codeSnippet) {
        sections.push("```");
        sections.push(vuln.codeSnippet);
        sections.push("```");
        sections.push("");
      }

      if (vuln.remediation) {
        sections.push(
          isJa
            ? `💡 **修正方法**: ${vuln.remediation}`
            : `💡 **Remediation**: ${vuln.remediation}`
        );
        sections.push("");
      }

      sections.push("---");
      sections.push("");
    }
  }

  // フッター
  sections.push(
    isJa
      ? "> 🤖 このレポートは自動生成されたものです。OWASP Top 10に基づいてセキュリティ脆弱性を検出しています。"
      : "> 🤖 This report was automatically generated. Security vulnerabilities are detected based on OWASP Top 10."
  );
  sections.push("");
  sections.push(
    isJa
      ? "> ⚠️ 偽陽性の可能性があります。重要な脆弱性については必ず手動で確認してください。"
      : "> ⚠️ False positives are possible. Please manually verify critical vulnerabilities."
  );

  return sections.join("\n");
}

/**
 * 統計情報を計算（外部から呼び出す場合用）
 */
export function calculateSecurityStats(
  vulnerabilities: DetectedVulnerability[]
): SecurityScanStats {
  const bySeverity: Record<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW", number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  const byType: Record<string, number> = {};
  const byFile: Record<string, number> = {};

  for (const vuln of vulnerabilities) {
    bySeverity[vuln.severity]++;
    byType[vuln.vulnerabilityType] = (byType[vuln.vulnerabilityType] || 0) + 1;
    byFile[vuln.filePath] = (byFile[vuln.filePath] || 0) + 1;
  }

  return { bySeverity, byType, byFile };
}
