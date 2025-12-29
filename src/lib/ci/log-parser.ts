/**
 * Phase 9: CI Log Parser
 *
 * CIログを解析してエラー情報を抽出
 */

import type {
  ParsedCILog,
  CIProviderType,
  CIFailureTypeValue,
  ExtractedError,
  FailedTest,
  BuildError,
  TypeErrorInfo,
  LintError,
  DependencyError,
} from "./types";

// ========================================
// エラーパターン定義
// ========================================

/** タイムアウトパターン */
const TIMEOUT_PATTERNS = [
  /Timeout of \d+ms exceeded/gi,
  /Job exceeded maximum execution time/gi,
  /operation timed out/gi,
  /ETIMEDOUT/g,
];

/** メモリ不足パターン */
const OOM_PATTERNS = [
  /JavaScript heap out of memory/gi,
  /FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed/g,
  /Killed\s+.+/g,
  /OOMKilled/g,
  /exit code 137/gi,
];

// ========================================
// メインパーサー関数
// ========================================

/**
 * CIログをパースしてエラー情報を抽出
 */
export function parseCILog(
  rawLog: string,
  provider: CIProviderType = "GITHUB_ACTIONS"
): ParsedCILog {
  const lines = rawLog.split("\n");

  // 基本情報の抽出
  const workflowInfo = extractWorkflowInfo(rawLog, provider);
  const failureType = detectFailureType(rawLog);

  // 各種エラーの抽出
  const errorMessages = extractGeneralErrors(rawLog);
  const failedTests = extractFailedTests(rawLog);
  const buildErrors = extractBuildErrors(rawLog);
  const typeErrors = extractTypeErrors(rawLog);
  const lintErrors = extractLintErrors(rawLog);
  const dependencyErrors = extractDependencyErrors(rawLog);

  // 関連するログセクションの抽出
  const relevantLogSections = extractRelevantSections(lines);

  return {
    provider,
    workflowName: workflowInfo.workflowName,
    jobName: workflowInfo.jobName,
    stepName: workflowInfo.stepName,
    duration: workflowInfo.duration,
    exitCode: extractExitCode(rawLog),
    failureType,
    errorMessages,
    failedTests,
    buildErrors,
    typeErrors,
    lintErrors,
    dependencyErrors,
    relevantLogSections,
    metadata: {
      totalLines: lines.length,
      logSize: rawLog.length,
      provider,
    },
  };
}

// ========================================
// 失敗タイプ検出
// ========================================

/**
 * 失敗タイプを検出
 */
export function detectFailureType(log: string): CIFailureTypeValue {
  // タイムアウト
  if (TIMEOUT_PATTERNS.some(p => p.test(log))) {
    return "TIMEOUT";
  }

  // メモリ不足
  if (OOM_PATTERNS.some(p => p.test(log))) {
    return "OUT_OF_MEMORY";
  }

  // テスト失敗
  if (
    /FAIL\s+/i.test(log) ||
    /Tests?:\s*\d+\s+failed/i.test(log) ||
    /FAILED\s+.+::\w+/i.test(log) ||
    /\d+\s+failing/i.test(log)
  ) {
    return "TEST_FAILURE";
  }

  // 型エラー
  if (/error\s+TS\d+/i.test(log) || /Type\s+'[^']+'\s+is\s+not\s+assignable/i.test(log)) {
    return "TYPE_ERROR";
  }

  // Lintエラー
  if (
    /eslint.*found\s+\d+\s+errors?/i.test(log) ||
    /✖\s+\d+\s+problems?/i.test(log) ||
    /Lint\s+errors?\s+found/i.test(log)
  ) {
    return "LINT_ERROR";
  }

  // 依存関係エラー
  if (
    /npm ERR!/i.test(log) ||
    /ERESOLVE/i.test(log) ||
    /peer dep missing/i.test(log) ||
    /Couldn't find package/i.test(log)
  ) {
    return "DEPENDENCY_ERROR";
  }

  // ビルドエラー
  if (
    /Build failed/i.test(log) ||
    /Compilation failed/i.test(log) ||
    /SyntaxError/i.test(log) ||
    /Module not found/i.test(log)
  ) {
    return "BUILD_ERROR";
  }

  // パーミッションエラー
  if (/EACCES/i.test(log) || /Permission denied/i.test(log)) {
    return "PERMISSION_ERROR";
  }

  // 設定エラー
  if (
    /Invalid configuration/i.test(log) ||
    /Config file not found/i.test(log) ||
    /YAMLException/i.test(log)
  ) {
    return "CONFIGURATION_ERROR";
  }

  return "UNKNOWN";
}

// ========================================
// ワークフロー情報抽出
// ========================================

interface WorkflowInfo {
  workflowName?: string;
  jobName?: string;
  stepName?: string;
  duration?: number;
}

/**
 * ワークフロー情報を抽出
 */
function extractWorkflowInfo(log: string, provider: CIProviderType): WorkflowInfo {
  const info: WorkflowInfo = {};

  switch (provider) {
    case "GITHUB_ACTIONS":
      // ワークフロー名
      const workflowMatch = log.match(/Run\s+(.+\.ya?ml)/i);
      if (workflowMatch) {
        info.workflowName = workflowMatch[1];
      }

      // ジョブ名
      const jobMatch = log.match(/Job name:\s*(.+)/i);
      if (jobMatch) {
        info.jobName = jobMatch[1].trim();
      }

      // ステップ名
      const stepMatch = log.match(/##\[group\](.+)/);
      if (stepMatch) {
        info.stepName = stepMatch[1].trim();
      }

      // 実行時間
      const durationMatch = log.match(/Job took (\d+(?:\.\d+)?)\s*s/i);
      if (durationMatch) {
        info.duration = parseFloat(durationMatch[1]);
      }
      break;

    case "GITLAB_CI":
      const gitlabJobMatch = log.match(/Running with gitlab-runner.+job=(\d+)/i);
      if (gitlabJobMatch) {
        info.jobName = `job-${gitlabJobMatch[1]}`;
      }
      break;

    case "CIRCLECI":
      const circleJobMatch = log.match(/Running job:\s*(.+)/i);
      if (circleJobMatch) {
        info.jobName = circleJobMatch[1].trim();
      }
      break;

    default:
      break;
  }

  return info;
}

// ========================================
// エラー抽出関数
// ========================================

/**
 * 一般的なエラーメッセージを抽出
 */
function extractGeneralErrors(log: string): ExtractedError[] {
  const errors: ExtractedError[] = [];
  const lines = log.split("\n");

  // Error: で始まる行
  const errorPattern = /^(?:.*?)?(?:Error|ERROR|error)[:：]\s*(.+)$/;
  // スタックトレースパターン
  const stackTracePattern = /^\s+at\s+.+\(.+:\d+:\d+\)/;

  let currentError: ExtractedError | null = null;
  let stackTraceLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(errorPattern);

    if (match) {
      // 前のエラーを保存
      if (currentError) {
        if (stackTraceLines.length > 0) {
          currentError.stackTrace = stackTraceLines.join("\n");
        }
        errors.push(currentError);
      }

      // 新しいエラー
      currentError = {
        message: match[1].trim(),
      };
      stackTraceLines = [];

      // ファイルパスと行番号を抽出
      const locationMatch = line.match(/(.+\.[a-z]+):(\d+)(?::(\d+))?/i);
      if (locationMatch) {
        currentError.filePath = locationMatch[1];
        currentError.lineNumber = parseInt(locationMatch[2], 10);
        if (locationMatch[3]) {
          currentError.columnNumber = parseInt(locationMatch[3], 10);
        }
      }
    } else if (currentError && stackTracePattern.test(line)) {
      stackTraceLines.push(line.trim());
    }
  }

  // 最後のエラーを保存
  if (currentError) {
    if (stackTraceLines.length > 0) {
      currentError.stackTrace = stackTraceLines.join("\n");
    }
    errors.push(currentError);
  }

  return errors.slice(0, 20); // 最大20個
}

/**
 * 失敗したテストを抽出
 */
function extractFailedTests(log: string): FailedTest[] {
  const tests: FailedTest[] = [];

  // Jest/Vitest形式
  const jestPattern = /●\s+(.+)\s*›\s*(.+)\n\n([\s\S]+?)(?=\n\n●|\n\n\s*Test Suites:|\z)/g;
  let match;
  while ((match = jestPattern.exec(log)) !== null) {
    const errorBlock = match[3];
    const expectedMatch = errorBlock.match(/Expected:?\s*(.+)/);
    const receivedMatch = errorBlock.match(/Received:?\s*(.+)/);

    tests.push({
      testSuite: match[1].trim(),
      testName: match[2].trim(),
      errorMessage: errorBlock.split("\n")[0]?.trim() || "Test failed",
      expected: expectedMatch?.[1]?.trim(),
      actual: receivedMatch?.[1]?.trim(),
      stackTrace: errorBlock,
    });
  }

  // FAIL行からテストファイルを抽出
  const failPattern = /FAIL\s+(.+\.(?:test|spec)\.[jt]sx?)/g;
  while ((match = failPattern.exec(log)) !== null) {
    // 既に抽出されていなければ追加
    const testFile = match[1];
    if (!tests.some(t => t.testFile === testFile)) {
      tests.push({
        testFile,
        testName: testFile,
        errorMessage: `Test file failed: ${testFile}`,
      });
    }
  }

  // pytest形式
  const pytestPattern = /FAILED\s+(.+)::(\w+)\s+-\s+(.+)/g;
  while ((match = pytestPattern.exec(log)) !== null) {
    tests.push({
      testFile: match[1],
      testName: match[2],
      errorMessage: match[3].trim(),
    });
  }

  return tests.slice(0, 50); // 最大50個
}

/**
 * ビルドエラーを抽出
 */
function extractBuildErrors(log: string): BuildError[] {
  const errors: BuildError[] = [];

  // Module not found
  const modulePattern = /Module not found:\s*(?:Error:\s*)?(?:Can't resolve\s+)?['"]?([^'"]+)['"]?\s*in\s*['"]?([^'"]+)['"]?/g;
  let match;
  while ((match = modulePattern.exec(log)) !== null) {
    errors.push({
      message: `Module not found: ${match[1]}`,
      filePath: match[2],
      tool: "webpack",
    });
  }

  // SyntaxError
  const syntaxPattern = /SyntaxError:\s*(.+)\n\s*at\s+(.+):(\d+)/g;
  while ((match = syntaxPattern.exec(log)) !== null) {
    errors.push({
      message: `SyntaxError: ${match[1]}`,
      filePath: match[2],
      lineNumber: parseInt(match[3], 10),
    });
  }

  return errors.slice(0, 20);
}

/**
 * TypeScriptエラーを抽出
 */
function extractTypeErrors(log: string): TypeErrorInfo[] {
  const errors: TypeErrorInfo[] = [];

  // TSエラー形式1: file.ts(10,5): error TS2322: ...
  const pattern1 = /(.+\.tsx?)\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*(.+)/g;
  let match;
  while ((match = pattern1.exec(log)) !== null) {
    errors.push({
      filePath: match[1],
      lineNumber: parseInt(match[2], 10),
      columnNumber: parseInt(match[3], 10),
      tsErrorCode: match[4],
      message: match[5].trim(),
    });
  }

  // TSエラー形式2: file.ts:10:5 - error TS2322: ...
  const pattern2 = /(.+\.tsx?):(\d+):(\d+)\s*[-–]\s*error\s*(TS\d+):\s*(.+)/g;
  while ((match = pattern2.exec(log)) !== null) {
    errors.push({
      filePath: match[1],
      lineNumber: parseInt(match[2], 10),
      columnNumber: parseInt(match[3], 10),
      tsErrorCode: match[4],
      message: match[5].trim(),
    });
  }

  // 型の不一致を解析
  for (const error of errors) {
    const typeMatch = error.message.match(/Type '(.+)' is not assignable to type '(.+)'/);
    if (typeMatch) {
      error.actualType = typeMatch[1];
      error.expectedType = typeMatch[2];
    }
  }

  return errors.slice(0, 50);
}

/**
 * Lintエラーを抽出
 */
function extractLintErrors(log: string): LintError[] {
  const errors: LintError[] = [];

  // ESLint形式
  const eslintPattern = /(.+):(\d+):(\d+):\s*(error|warning)\s+(.+?)\s+(\S+)$/gm;
  let match;
  while ((match = eslintPattern.exec(log)) !== null) {
    errors.push({
      filePath: match[1],
      lineNumber: parseInt(match[2], 10),
      columnNumber: parseInt(match[3], 10),
      severity: match[4] as "error" | "warning",
      message: match[5].trim(),
      rule: match[6],
    });
  }

  return errors.slice(0, 100);
}

/**
 * 依存関係エラーを抽出
 */
function extractDependencyErrors(log: string): DependencyError[] {
  const errors: DependencyError[] = [];

  // npm 404エラー
  const npm404Pattern = /npm ERR! 404\s+(?:Not Found\s*[-–]\s*)?['"]?(@?[^'"]+)['"]?/g;
  let match;
  while ((match = npm404Pattern.exec(log)) !== null) {
    errors.push({
      packageName: match[1],
      errorType: "NOT_FOUND",
      message: `Package not found: ${match[1]}`,
    });
  }

  // peer dependency エラー
  const peerPattern = /npm ERR! peer dep missing:\s*([^,]+),\s*required by\s*(.+)/g;
  while ((match = peerPattern.exec(log)) !== null) {
    errors.push({
      packageName: match[1].trim(),
      errorType: "PEER_DEPENDENCY",
      message: `Peer dependency missing: ${match[1]}, required by ${match[2]}`,
    });
  }

  // ERESOLVE エラー
  if (/ERESOLVE unable to resolve dependency tree/i.test(log)) {
    const conflictMatch = log.match(/While resolving:\s*([^\n]+)/);
    errors.push({
      packageName: conflictMatch?.[1] || "unknown",
      errorType: "VERSION_MISMATCH",
      message: "Unable to resolve dependency tree",
    });
  }

  return errors.slice(0, 20);
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 終了コードを抽出
 */
function extractExitCode(log: string): number | undefined {
  const match = log.match(/(?:exit|Exit)\s*(?:code|Code)?[:\s]+(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }

  // Process exited with code X
  const processMatch = log.match(/Process (?:exited|completed) with (?:exit )?code (\d+)/i);
  if (processMatch) {
    return parseInt(processMatch[1], 10);
  }

  return undefined;
}

/**
 * 関連するログセクションを抽出
 */
function extractRelevantSections(lines: string[]): string[] {
  const sections: string[] = [];
  const maxSections = 5;
  const sectionSize = 20; // 各セクションの行数

  // エラー行を見つける
  const errorLineIndices: number[] = [];
  const errorPatterns = [
    /error[:：]/i,
    /FAIL/i,
    /failed/i,
    /ERROR/,
    /exception/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of errorPatterns) {
      if (pattern.test(lines[i])) {
        errorLineIndices.push(i);
        break;
      }
    }
  }

  // 各エラー行の前後を抽出
  const usedRanges: Array<[number, number]> = [];
  for (const errorIndex of errorLineIndices.slice(0, maxSections)) {
    const start = Math.max(0, errorIndex - 5);
    const end = Math.min(lines.length, errorIndex + sectionSize);

    // 重複チェック
    const overlaps = usedRanges.some(
      ([s, e]) => (start >= s && start <= e) || (end >= s && end <= e)
    );
    if (!overlaps) {
      usedRanges.push([start, end]);
      const section = lines.slice(start, end).join("\n");
      if (section.trim()) {
        sections.push(section);
      }
    }
  }

  return sections;
}

/**
 * CI分析が有効かチェック
 */
export function isCIAnalysisEnabled(): boolean {
  return process.env.CI_FEEDBACK_ENABLED !== "false";
}
