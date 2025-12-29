/**
 * Phase 9: CI Feedback Analysis
 *
 * CIログ分析と失敗原因特定モジュール
 */

// 型定義
export type {
  CIProviderType,
  CIFailureTypeValue,
  ParsedCILog,
  ExtractedError,
  FailedTest,
  BuildError,
  TypeErrorInfo,
  LintError,
  DependencyError,
  CIFailureAnalysisResult,
  AffectedFile,
  FixSuggestion,
  RelatedLink,
  SimilarFailure,
  CIProviderInterface,
  FetchLogsParams,
  GetCheckRunParams,
  CheckRunInfo,
  CIAnalysisOptions,
} from "./types";

export { DEFAULT_CI_ANALYSIS_OPTIONS } from "./types";

// ログパーサー
export { parseCILog, detectFailureType, isCIAnalysisEnabled } from "./log-parser";

// 失敗分析
export { analyzeCIFailure } from "./failure-analyzer";

// 修正提案
export { generateFixSuggestions } from "./fix-suggester";

// CIプロバイダー
export {
  getCIProvider,
  SUPPORTED_PROVIDERS,
  GitHubActionsProvider,
  GitLabCIProvider,
  CircleCIProvider,
  createGitHubActionsProvider,
  createGitLabCIProvider,
  createCircleCIProvider,
} from "./ci-providers";

// ========================================
// 便利なラッパー関数
// ========================================

import type { CIProviderType, CIAnalysisOptions, CIFailureAnalysisResult } from "./types";
import { parseCILog } from "./log-parser";
import { analyzeCIFailure } from "./failure-analyzer";
import { getCIProvider } from "./ci-providers";

/**
 * CIログを取得して分析（一括処理）
 */
export async function fetchAndAnalyzeCILogs(params: {
  provider: CIProviderType;
  owner: string;
  repo: string;
  checkRunId: string | number;
  installationId?: number;
  options?: CIAnalysisOptions;
}): Promise<CIFailureAnalysisResult> {
  const { provider, owner, repo, checkRunId, installationId, options } = params;

  // プロバイダーを取得
  const ciProvider = getCIProvider(provider);

  // ログを取得
  const rawLog = await ciProvider.fetchLogs({
    owner,
    repo,
    checkRunId: String(checkRunId),
    installationId,
  });

  // ログをパース
  const parsedLog = ciProvider.parseLog(rawLog);

  // 分析を実行
  const analysis = analyzeCIFailure(parsedLog, options);

  return analysis;
}

/**
 * 生ログから直接分析（ログ取得済みの場合）
 */
export function analyzeRawCILog(
  rawLog: string,
  provider: CIProviderType = "GITHUB_ACTIONS",
  options?: CIAnalysisOptions
): CIFailureAnalysisResult {
  const parsedLog = parseCILog(rawLog, provider);
  return analyzeCIFailure(parsedLog, options);
}
