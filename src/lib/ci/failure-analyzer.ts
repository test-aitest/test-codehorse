/**
 * Phase 9: CI Failure Analyzer
 *
 * パースされたCIログから失敗原因を分析
 */

import type {
  ParsedCILog,
  CIFailureAnalysisResult,
  CIFailureTypeValue,
  AffectedFile,
  CIAnalysisOptions,
} from "./types";
import { DEFAULT_CI_ANALYSIS_OPTIONS } from "./types";
import { generateFixSuggestions } from "./fix-suggester";

// ========================================
// メイン分析関数
// ========================================

/**
 * CI失敗を分析
 */
export function analyzeCIFailure(
  parsedLog: ParsedCILog,
  options: CIAnalysisOptions = {}
): CIFailureAnalysisResult {
  const mergedOptions = { ...DEFAULT_CI_ANALYSIS_OPTIONS, ...options };
  const isJa = mergedOptions.language === "ja";

  // 影響を受けるファイルを収集
  const affectedFiles = collectAffectedFiles(parsedLog);

  // 根本原因のサマリーを生成
  const rootCauseSummary = generateRootCauseSummary(parsedLog, isJa);

  // 詳細な分析を生成
  const detailedAnalysis = generateDetailedAnalysis(parsedLog, isJa);

  // 修正提案を生成
  const suggestions = generateFixSuggestions(parsedLog, mergedOptions);

  // 関連リンクを生成
  const relatedLinks = generateRelatedLinks(parsedLog, isJa);

  // 信頼度を計算
  const confidence = calculateConfidence(parsedLog);

  return {
    failureType: parsedLog.failureType,
    confidence,
    rootCauseSummary,
    detailedAnalysis,
    affectedFiles,
    suggestions: suggestions.slice(0, mergedOptions.maxSuggestions),
    relatedLinks,
  };
}

// ========================================
// 影響ファイル収集
// ========================================

/**
 * 影響を受けるファイルを収集
 */
function collectAffectedFiles(parsedLog: ParsedCILog): AffectedFile[] {
  const files: AffectedFile[] = [];
  const fileSet = new Set<string>();

  // テスト失敗からファイルを収集
  for (const test of parsedLog.failedTests) {
    if (test.testFile && !fileSet.has(test.testFile)) {
      fileSet.add(test.testFile);
      files.push({
        filePath: test.testFile,
        issue: `テスト失敗: ${test.testName}`,
        severity: "high",
      });
    }
  }

  // ビルドエラーからファイルを収集
  for (const error of parsedLog.buildErrors) {
    if (error.filePath && !fileSet.has(error.filePath)) {
      fileSet.add(error.filePath);
      files.push({
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        issue: error.message,
        severity: "critical",
      });
    }
  }

  // 型エラーからファイルを収集
  for (const error of parsedLog.typeErrors) {
    const key = `${error.filePath}:${error.lineNumber}`;
    if (!fileSet.has(key)) {
      fileSet.add(key);
      files.push({
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        issue: error.message,
        severity: "high",
      });
    }
  }

  // Lintエラーからファイルを収集
  for (const error of parsedLog.lintErrors) {
    const key = `${error.filePath}:${error.lineNumber}`;
    if (!fileSet.has(key)) {
      fileSet.add(key);
      files.push({
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        issue: `${error.rule}: ${error.message}`,
        severity: error.severity === "error" ? "high" : "medium",
      });
    }
  }

  // 一般エラーからファイルを収集
  for (const error of parsedLog.errorMessages) {
    if (error.filePath && !fileSet.has(error.filePath)) {
      fileSet.add(error.filePath);
      files.push({
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        issue: error.message,
        severity: "medium",
      });
    }
  }

  // 重要度順にソート
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  files.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return files.slice(0, 30); // 最大30ファイル
}

// ========================================
// 根本原因サマリー生成
// ========================================

/**
 * 根本原因のサマリーを生成
 */
function generateRootCauseSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const { failureType } = parsedLog;

  switch (failureType) {
    case "TEST_FAILURE":
      return generateTestFailureSummary(parsedLog, isJa);

    case "TYPE_ERROR":
      return generateTypeErrorSummary(parsedLog, isJa);

    case "LINT_ERROR":
      return generateLintErrorSummary(parsedLog, isJa);

    case "BUILD_ERROR":
      return generateBuildErrorSummary(parsedLog, isJa);

    case "DEPENDENCY_ERROR":
      return generateDependencyErrorSummary(parsedLog, isJa);

    case "TIMEOUT":
      return isJa
        ? "ジョブがタイムアウトしました。処理時間が制限を超えています。"
        : "Job timed out. Processing time exceeded the limit.";

    case "OUT_OF_MEMORY":
      return isJa
        ? "メモリ不足が発生しました。プロセスがメモリ制限を超えました。"
        : "Out of memory error occurred. Process exceeded memory limit.";

    case "PERMISSION_ERROR":
      return isJa
        ? "パーミッションエラーが発生しました。ファイルまたはディレクトリへのアクセス権限がありません。"
        : "Permission error occurred. No access rights to file or directory.";

    case "CONFIGURATION_ERROR":
      return isJa
        ? "設定エラーが検出されました。設定ファイルに問題があります。"
        : "Configuration error detected. There is an issue with the configuration file.";

    default:
      return isJa
        ? "CIパイプラインで不明なエラーが発生しました。"
        : "Unknown error occurred in CI pipeline.";
  }
}

/**
 * テスト失敗のサマリー
 */
function generateTestFailureSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const failedCount = parsedLog.failedTests.length;

  if (failedCount === 0) {
    return isJa
      ? "テストが失敗しましたが、詳細を特定できませんでした。"
      : "Tests failed but could not identify details.";
  }

  const firstTest = parsedLog.failedTests[0];

  if (isJa) {
    if (failedCount === 1) {
      return `テスト「${firstTest.testName}」が失敗しました: ${firstTest.errorMessage}`;
    }
    return `${failedCount}個のテストが失敗しました。主なエラー: ${firstTest.errorMessage}`;
  }

  if (failedCount === 1) {
    return `Test "${firstTest.testName}" failed: ${firstTest.errorMessage}`;
  }
  return `${failedCount} tests failed. Main error: ${firstTest.errorMessage}`;
}

/**
 * 型エラーのサマリー
 */
function generateTypeErrorSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const errorCount = parsedLog.typeErrors.length;

  if (errorCount === 0) {
    return isJa
      ? "TypeScriptの型エラーが発生しましたが、詳細を特定できませんでした。"
      : "TypeScript type errors occurred but could not identify details.";
  }

  const firstError = parsedLog.typeErrors[0];

  if (isJa) {
    if (errorCount === 1) {
      return `型エラー: ${firstError.filePath}:${firstError.lineNumber} - ${firstError.message}`;
    }
    return `${errorCount}個の型エラーが検出されました。最初のエラー: ${firstError.message}`;
  }

  if (errorCount === 1) {
    return `Type error: ${firstError.filePath}:${firstError.lineNumber} - ${firstError.message}`;
  }
  return `${errorCount} type errors detected. First error: ${firstError.message}`;
}

/**
 * Lintエラーのサマリー
 */
function generateLintErrorSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const errors = parsedLog.lintErrors.filter(e => e.severity === "error");
  const warnings = parsedLog.lintErrors.filter(e => e.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return isJa
      ? "Lintエラーが発生しましたが、詳細を特定できませんでした。"
      : "Lint errors occurred but could not identify details.";
  }

  if (isJa) {
    return `Lint: ${errors.length}個のエラー、${warnings.length}個の警告が検出されました。`;
  }
  return `Lint: ${errors.length} errors, ${warnings.length} warnings detected.`;
}

/**
 * ビルドエラーのサマリー
 */
function generateBuildErrorSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const errorCount = parsedLog.buildErrors.length;

  if (errorCount === 0) {
    return isJa
      ? "ビルドが失敗しましたが、詳細を特定できませんでした。"
      : "Build failed but could not identify details.";
  }

  const firstError = parsedLog.buildErrors[0];

  if (isJa) {
    return `ビルドエラー: ${firstError.message}`;
  }
  return `Build error: ${firstError.message}`;
}

/**
 * 依存関係エラーのサマリー
 */
function generateDependencyErrorSummary(parsedLog: ParsedCILog, isJa: boolean): string {
  const errorCount = parsedLog.dependencyErrors.length;

  if (errorCount === 0) {
    return isJa
      ? "依存関係のインストールに失敗しましたが、詳細を特定できませんでした。"
      : "Dependency installation failed but could not identify details.";
  }

  const firstError = parsedLog.dependencyErrors[0];

  if (isJa) {
    return `依存関係エラー: ${firstError.packageName} - ${firstError.message}`;
  }
  return `Dependency error: ${firstError.packageName} - ${firstError.message}`;
}

// ========================================
// 詳細分析生成
// ========================================

/**
 * 詳細な分析を生成
 */
function generateDetailedAnalysis(parsedLog: ParsedCILog, isJa: boolean): string {
  const sections: string[] = [];

  // ヘッダー
  sections.push(isJa ? "## CI失敗分析レポート" : "## CI Failure Analysis Report");
  sections.push("");

  // 失敗タイプ
  const failureTypeLabel = getFailureTypeLabel(parsedLog.failureType, isJa);
  sections.push(isJa ? `### 失敗タイプ: ${failureTypeLabel}` : `### Failure Type: ${failureTypeLabel}`);
  sections.push("");

  // ワークフロー情報
  if (parsedLog.workflowName || parsedLog.jobName) {
    sections.push(isJa ? "### ワークフロー情報" : "### Workflow Information");
    if (parsedLog.workflowName) {
      sections.push(`- ${isJa ? "ワークフロー" : "Workflow"}: ${parsedLog.workflowName}`);
    }
    if (parsedLog.jobName) {
      sections.push(`- ${isJa ? "ジョブ" : "Job"}: ${parsedLog.jobName}`);
    }
    if (parsedLog.stepName) {
      sections.push(`- ${isJa ? "ステップ" : "Step"}: ${parsedLog.stepName}`);
    }
    if (parsedLog.duration) {
      sections.push(`- ${isJa ? "実行時間" : "Duration"}: ${parsedLog.duration}s`);
    }
    if (parsedLog.exitCode !== undefined) {
      sections.push(`- ${isJa ? "終了コード" : "Exit Code"}: ${parsedLog.exitCode}`);
    }
    sections.push("");
  }

  // テスト失敗の詳細
  if (parsedLog.failedTests.length > 0) {
    sections.push(isJa ? "### 失敗したテスト" : "### Failed Tests");
    sections.push("");
    for (const test of parsedLog.failedTests.slice(0, 10)) {
      sections.push(`#### ${test.testName}`);
      if (test.testFile) {
        sections.push(`- ${isJa ? "ファイル" : "File"}: ${test.testFile}`);
      }
      sections.push(`- ${isJa ? "エラー" : "Error"}: ${test.errorMessage}`);
      if (test.expected && test.actual) {
        sections.push(`- ${isJa ? "期待値" : "Expected"}: ${test.expected}`);
        sections.push(`- ${isJa ? "実際の値" : "Actual"}: ${test.actual}`);
      }
      sections.push("");
    }
  }

  // 型エラーの詳細
  if (parsedLog.typeErrors.length > 0) {
    sections.push(isJa ? "### 型エラー" : "### Type Errors");
    sections.push("");
    for (const error of parsedLog.typeErrors.slice(0, 10)) {
      sections.push(`- \`${error.filePath}:${error.lineNumber}\`: ${error.message}`);
      if (error.tsErrorCode) {
        sections.push(`  - ${isJa ? "エラーコード" : "Error Code"}: ${error.tsErrorCode}`);
      }
    }
    sections.push("");
  }

  // Lintエラーの詳細
  if (parsedLog.lintErrors.length > 0) {
    sections.push(isJa ? "### Lintエラー" : "### Lint Errors");
    sections.push("");
    for (const error of parsedLog.lintErrors.slice(0, 10)) {
      const severity = error.severity === "error" ? "🔴" : "🟡";
      sections.push(`- ${severity} \`${error.filePath}:${error.lineNumber}\`: ${error.rule}`);
      sections.push(`  - ${error.message}`);
    }
    sections.push("");
  }

  // 依存関係エラーの詳細
  if (parsedLog.dependencyErrors.length > 0) {
    sections.push(isJa ? "### 依存関係エラー" : "### Dependency Errors");
    sections.push("");
    for (const error of parsedLog.dependencyErrors) {
      sections.push(`- **${error.packageName}**: ${error.message}`);
      sections.push(`  - ${isJa ? "タイプ" : "Type"}: ${error.errorType}`);
    }
    sections.push("");
  }

  // ビルドエラーの詳細
  if (parsedLog.buildErrors.length > 0) {
    sections.push(isJa ? "### ビルドエラー" : "### Build Errors");
    sections.push("");
    for (const error of parsedLog.buildErrors.slice(0, 10)) {
      if (error.filePath) {
        sections.push(`- \`${error.filePath}${error.lineNumber ? `:${error.lineNumber}` : ""}\`: ${error.message}`);
      } else {
        sections.push(`- ${error.message}`);
      }
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * 失敗タイプのラベルを取得
 */
function getFailureTypeLabel(failureType: CIFailureTypeValue, isJa: boolean): string {
  const labels: Record<CIFailureTypeValue, { ja: string; en: string }> = {
    TEST_FAILURE: { ja: "テスト失敗", en: "Test Failure" },
    BUILD_ERROR: { ja: "ビルドエラー", en: "Build Error" },
    LINT_ERROR: { ja: "Lintエラー", en: "Lint Error" },
    TYPE_ERROR: { ja: "型エラー", en: "Type Error" },
    DEPENDENCY_ERROR: { ja: "依存関係エラー", en: "Dependency Error" },
    TIMEOUT: { ja: "タイムアウト", en: "Timeout" },
    OUT_OF_MEMORY: { ja: "メモリ不足", en: "Out of Memory" },
    PERMISSION_ERROR: { ja: "パーミッションエラー", en: "Permission Error" },
    CONFIGURATION_ERROR: { ja: "設定エラー", en: "Configuration Error" },
    UNKNOWN: { ja: "不明なエラー", en: "Unknown Error" },
  };

  return labels[failureType]?.[isJa ? "ja" : "en"] || failureType;
}

// ========================================
// 関連リンク生成
// ========================================

/**
 * 関連リンクを生成
 */
function generateRelatedLinks(parsedLog: ParsedCILog, isJa: boolean): CIFailureAnalysisResult["relatedLinks"] {
  const links: CIFailureAnalysisResult["relatedLinks"] = [];

  switch (parsedLog.failureType) {
    case "TYPE_ERROR":
      links.push({
        title: isJa ? "TypeScript エラー一覧" : "TypeScript Error Reference",
        url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html",
        type: "documentation",
      });
      break;

    case "DEPENDENCY_ERROR":
      links.push({
        title: isJa ? "npm 依存関係の解決" : "Resolving npm Dependencies",
        url: "https://docs.npmjs.com/cli/v9/configuring-npm/package-lock-json",
        type: "documentation",
      });
      break;

    case "LINT_ERROR":
      links.push({
        title: "ESLint Rules",
        url: "https://eslint.org/docs/latest/rules/",
        type: "documentation",
      });
      break;

    case "TEST_FAILURE":
      if (parsedLog.failedTests.some(t => t.testFile?.includes(".test."))) {
        links.push({
          title: "Jest Documentation",
          url: "https://jestjs.io/docs/getting-started",
          type: "documentation",
        });
      }
      break;

    case "OUT_OF_MEMORY":
      links.push({
        title: isJa ? "Node.js メモリ制限" : "Node.js Memory Limits",
        url: "https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-megabytes",
        type: "documentation",
      });
      break;

    default:
      break;
  }

  return links;
}

// ========================================
// 信頼度計算
// ========================================

/**
 * 分析の信頼度を計算
 */
function calculateConfidence(parsedLog: ParsedCILog): number {
  let confidence = 0.5; // ベースライン

  // エラー情報が多いほど信頼度が上がる
  if (parsedLog.failedTests.length > 0) confidence += 0.1;
  if (parsedLog.typeErrors.length > 0) confidence += 0.1;
  if (parsedLog.lintErrors.length > 0) confidence += 0.1;
  if (parsedLog.buildErrors.length > 0) confidence += 0.1;
  if (parsedLog.dependencyErrors.length > 0) confidence += 0.1;

  // 具体的なファイル情報があれば信頼度が上がる
  const hasFileInfo =
    parsedLog.failedTests.some(t => t.testFile) ||
    parsedLog.typeErrors.length > 0 ||
    parsedLog.lintErrors.length > 0 ||
    parsedLog.buildErrors.some(e => e.filePath);
  if (hasFileInfo) confidence += 0.1;

  // 失敗タイプがUNKNOWNの場合は信頼度が下がる
  if (parsedLog.failureType === "UNKNOWN") {
    confidence -= 0.2;
  }

  return Math.min(1, Math.max(0, confidence));
}
