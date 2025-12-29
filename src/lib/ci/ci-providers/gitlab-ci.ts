/**
 * Phase 9: GitLab CI Provider
 *
 * GitLab CIのログ取得とパース
 */

import type {
  CIProviderInterface,
  FetchLogsParams,
  GetCheckRunParams,
  CheckRunInfo,
  ParsedCILog,
} from "../types";
import { parseCILog } from "../log-parser";

// ========================================
// GitLab CI Provider
// ========================================

export class GitLabCIProvider implements CIProviderInterface {
  readonly providerName = "GITLAB_CI" as const;

  private gitlabToken?: string;
  private gitlabUrl: string;

  constructor(options?: { gitlabToken?: string; gitlabUrl?: string }) {
    this.gitlabToken = options?.gitlabToken || process.env.GITLAB_TOKEN;
    this.gitlabUrl = options?.gitlabUrl || process.env.GITLAB_URL || "https://gitlab.com";
  }

  /**
   * GitLab CIのログを取得
   */
  async fetchLogs(params: FetchLogsParams): Promise<string> {
    const { owner, repo, checkRunId } = params;

    if (!this.gitlabToken) {
      throw new Error("GitLab token is required");
    }

    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const url = `${this.gitlabUrl}/api/v4/projects/${projectPath}/jobs/${checkRunId}/trace`;

    const response = await fetch(url, {
      headers: {
        "PRIVATE-TOKEN": this.gitlabToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitLab CI logs: ${response.status}`);
    }

    return response.text();
  }

  /**
   * ジョブ情報を取得
   */
  async getCheckRunInfo(params: GetCheckRunParams): Promise<CheckRunInfo> {
    const { owner, repo, checkRunId } = params;

    if (!this.gitlabToken) {
      throw new Error("GitLab token is required");
    }

    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const url = `${this.gitlabUrl}/api/v4/projects/${projectPath}/jobs/${checkRunId}`;

    const response = await fetch(url, {
      headers: {
        "PRIVATE-TOKEN": this.gitlabToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch GitLab CI job info: ${response.status}`);
    }

    const job = await response.json();

    return {
      id: job.id,
      name: job.name,
      status: mapGitLabStatus(job.status),
      conclusion: mapGitLabConclusion(job.status),
      startedAt: job.started_at ? new Date(job.started_at) : undefined,
      completedAt: job.finished_at ? new Date(job.finished_at) : undefined,
      htmlUrl: job.web_url,
    };
  }

  /**
   * ログをパース
   */
  parseLog(rawLog: string): ParsedCILog {
    const processedLog = preprocessGitLabCILog(rawLog);
    return parseCILog(processedLog, "GITLAB_CI");
  }
}

// ========================================
// ステータスマッピング
// ========================================

function mapGitLabStatus(status: string): CheckRunInfo["status"] {
  switch (status) {
    case "pending":
    case "created":
      return "queued";
    case "running":
      return "in_progress";
    default:
      return "completed";
  }
}

function mapGitLabConclusion(status: string): CheckRunInfo["conclusion"] {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "canceled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return undefined;
  }
}

// ========================================
// GitLab CI ログ前処理
// ========================================

function preprocessGitLabCILog(rawLog: string): string {
  let log = rawLog;

  // ANSI エスケープシーケンスを除去
  log = log.replace(/\x1b\[[0-9;]*m/g, "");

  // GitLab CI特有のセクションマーカーを処理
  log = log.replace(/section_start:\d+:([^\r\n]+)/g, "\n=== $1 ===\n");
  log = log.replace(/section_end:\d+:[^\r\n]+/g, "\n");

  // タイムスタンプを除去
  log = log.replace(/^\[\d+\]\s*/gm, "");

  return log;
}

// ========================================
// ファクトリー関数
// ========================================

export function createGitLabCIProvider(options?: {
  gitlabToken?: string;
  gitlabUrl?: string;
}): GitLabCIProvider {
  return new GitLabCIProvider(options);
}
