/**
 * Phase 9: CircleCI Provider
 *
 * CircleCIのログ取得とパース
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
// CircleCI Provider
// ========================================

export class CircleCIProvider implements CIProviderInterface {
  readonly providerName = "CIRCLECI" as const;

  private circleToken?: string;

  constructor(options?: { circleToken?: string }) {
    this.circleToken = options?.circleToken || process.env.CIRCLECI_TOKEN;
  }

  /**
   * CircleCIのログを取得
   */
  async fetchLogs(params: FetchLogsParams): Promise<string> {
    const { owner, repo, checkRunId } = params;

    if (!this.circleToken) {
      throw new Error("CircleCI token is required");
    }

    // CircleCI API v2でジョブのログを取得
    const url = `https://circleci.com/api/v2/project/gh/${owner}/${repo}/job/${checkRunId}`;

    const response = await fetch(url, {
      headers: {
        "Circle-Token": this.circleToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CircleCI logs: ${response.status}`);
    }

    const job = await response.json();

    // 各ステップのログを取得して結合
    const logs: string[] = [];
    for (const step of job.steps || []) {
      for (const action of step.actions || []) {
        if (action.output_url) {
          try {
            const logResponse = await fetch(action.output_url, {
              headers: {
                "Circle-Token": this.circleToken,
              },
            });
            if (logResponse.ok) {
              const stepLog = await logResponse.text();
              logs.push(`=== ${step.name} ===\n${stepLog}`);
            }
          } catch {
            // ログ取得に失敗しても続行
          }
        }
      }
    }

    return logs.join("\n\n");
  }

  /**
   * ジョブ情報を取得
   */
  async getCheckRunInfo(params: GetCheckRunParams): Promise<CheckRunInfo> {
    const { owner, repo, checkRunId } = params;

    if (!this.circleToken) {
      throw new Error("CircleCI token is required");
    }

    const url = `https://circleci.com/api/v2/project/gh/${owner}/${repo}/job/${checkRunId}`;

    const response = await fetch(url, {
      headers: {
        "Circle-Token": this.circleToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch CircleCI job info: ${response.status}`);
    }

    const job = await response.json();

    return {
      id: job.job_number,
      name: job.name,
      status: mapCircleCIStatus(job.status),
      conclusion: mapCircleCIConclusion(job.status),
      startedAt: job.started_at ? new Date(job.started_at) : undefined,
      completedAt: job.stopped_at ? new Date(job.stopped_at) : undefined,
      htmlUrl: job.web_url,
    };
  }

  /**
   * ログをパース
   */
  parseLog(rawLog: string): ParsedCILog {
    const processedLog = preprocessCircleCILog(rawLog);
    return parseCILog(processedLog, "CIRCLECI");
  }
}

// ========================================
// ステータスマッピング
// ========================================

function mapCircleCIStatus(status: string): CheckRunInfo["status"] {
  switch (status) {
    case "queued":
    case "not_run":
      return "queued";
    case "running":
      return "in_progress";
    default:
      return "completed";
  }
}

function mapCircleCIConclusion(status: string): CheckRunInfo["conclusion"] {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failure";
    case "canceled":
      return "cancelled";
    case "infrastructure_fail":
    case "timedout":
      return "timed_out";
    default:
      return undefined;
  }
}

// ========================================
// CircleCI ログ前処理
// ========================================

function preprocessCircleCILog(rawLog: string): string {
  let log = rawLog;

  // ANSI エスケープシーケンスを除去
  log = log.replace(/\x1b\[[0-9;]*m/g, "");

  // CircleCI特有のフォーマットを処理
  log = log.replace(/^\$\s+/gm, "$ ");

  return log;
}

// ========================================
// ファクトリー関数
// ========================================

export function createCircleCIProvider(options?: {
  circleToken?: string;
}): CircleCIProvider {
  return new CircleCIProvider(options);
}
