/**
 * Phase 9: GitHub Actions Provider
 *
 * GitHub Actionsのログ取得とパース
 */

import type {
  CIProviderInterface,
  FetchLogsParams,
  GetCheckRunParams,
  CheckRunInfo,
  ParsedCILog,
} from "../types";
import { parseCILog } from "../log-parser";
import { getInstallationOctokit } from "@/lib/github/client";

// ========================================
// GitHub Actions Provider
// ========================================

export class GitHubActionsProvider implements CIProviderInterface {
  readonly providerName = "GITHUB_ACTIONS" as const;

  /**
   * GitHub Actionsのログを取得
   */
  async fetchLogs(params: FetchLogsParams): Promise<string> {
    const { owner, repo, checkRunId, installationId } = params;

    if (!installationId) {
      throw new Error("installationId is required for GitHub Actions");
    }

    const octokit = await getInstallationOctokit(installationId);

    try {
      // Check runのログを取得
      const { data } = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
        owner,
        repo,
        job_id: Number(checkRunId),
      });

      // dataはstring型（ログの内容）
      return data as unknown as string;
    } catch (error) {
      // フォールバック: workflow runからログを取得
      try {
        // Check runの詳細を取得
        const { data: checkRun } = await octokit.rest.checks.get({
          owner,
          repo,
          check_run_id: Number(checkRunId),
        });

        // Workflow run IDがあればそこからログを取得
        if (checkRun.check_suite?.id) {
          const { data: jobs } = await octokit.rest.actions.listJobsForWorkflowRun({
            owner,
            repo,
            run_id: checkRun.check_suite.id,
          });

          // 該当ジョブを見つける
          const job = jobs.jobs.find(j => j.id === Number(checkRunId));
          if (job) {
            const { data: logs } = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
              owner,
              repo,
              job_id: job.id,
            });
            return logs as unknown as string;
          }
        }

        throw error;
      } catch {
        console.error("[GitHubActionsProvider] Failed to fetch logs:", error);
        throw new Error(`Failed to fetch logs for check run ${checkRunId}`);
      }
    }
  }

  /**
   * Check Runの情報を取得
   */
  async getCheckRunInfo(params: GetCheckRunParams): Promise<CheckRunInfo> {
    const { owner, repo, checkRunId, installationId } = params;

    if (!installationId) {
      throw new Error("installationId is required for GitHub Actions");
    }

    const octokit = await getInstallationOctokit(installationId);

    const { data: checkRun } = await octokit.rest.checks.get({
      owner,
      repo,
      check_run_id: Number(checkRunId),
    });

    return {
      id: checkRun.id,
      name: checkRun.name,
      status: checkRun.status as CheckRunInfo["status"],
      conclusion: checkRun.conclusion as CheckRunInfo["conclusion"],
      startedAt: checkRun.started_at ? new Date(checkRun.started_at) : undefined,
      completedAt: checkRun.completed_at ? new Date(checkRun.completed_at) : undefined,
      htmlUrl: checkRun.html_url || undefined,
      detailsUrl: checkRun.details_url || undefined,
    };
  }

  /**
   * ログをパース
   */
  parseLog(rawLog: string): ParsedCILog {
    // GitHub Actions特有の前処理
    const processedLog = preprocessGitHubActionsLog(rawLog);
    return parseCILog(processedLog, "GITHUB_ACTIONS");
  }
}

// ========================================
// GitHub Actions ログ前処理
// ========================================

/**
 * GitHub Actions特有のログフォーマットを前処理
 */
function preprocessGitHubActionsLog(rawLog: string): string {
  let log = rawLog;

  // タイムスタンプを除去（可読性向上）
  log = log.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/gm, "");

  // ANSI エスケープシーケンスを除去
  log = log.replace(/\x1b\[[0-9;]*m/g, "");

  // GitHub Actions の特殊コマンドを処理
  log = log.replace(/^##\[command\](.+)$/gm, "$ $1");

  // グループの開始/終了をマーク
  log = log.replace(/^##\[group\](.+)$/gm, "\n=== $1 ===\n");
  log = log.replace(/^##\[endgroup\]$/gm, "\n");

  // エラー/警告のフォーマット
  log = log.replace(/^##\[error\](.+)$/gm, "ERROR: $1");
  log = log.replace(/^##\[warning\](.+)$/gm, "WARNING: $1");

  // デバッグメッセージを除去（ノイズ軽減）
  log = log.replace(/^##\[debug\].+$/gm, "");

  return log;
}

// ========================================
// ファクトリー関数
// ========================================

/**
 * GitHub Actions プロバイダーを作成
 */
export function createGitHubActionsProvider(): GitHubActionsProvider {
  return new GitHubActionsProvider();
}
