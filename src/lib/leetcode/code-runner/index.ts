/**
 * LeetCode コードランナー
 * GitHub Actionsを使用してコードをベンチマーク実行する
 */

import { Octokit } from 'octokit';
import type { SupportedLanguage, BenchmarkResult } from '../types';
import type {
  ExecutionRequest,
  WorkflowRunResult,
  RunnerConfig,
} from './types';
import { DEFAULT_RUNNER_CONFIG } from './types';

/**
 * コードランナークラス
 */
export class CodeRunner {
  private octokit: Octokit;
  private config: RunnerConfig;

  constructor(githubToken: string, config: Partial<RunnerConfig>) {
    this.octokit = new Octokit({ auth: githubToken });
    this.config = {
      ...DEFAULT_RUNNER_CONFIG,
      ...config,
    } as RunnerConfig;
  }

  /**
   * ベンチマーク実行をトリガー
   */
  async triggerBenchmark(request: ExecutionRequest): Promise<WorkflowRunResult> {
    const {
      evaluationId,
      language,
      code,
      testCases,
      runCount = this.config.defaultRunCount,
    } = request;

    // Base64エンコード
    const codeBase64 = Buffer.from(code).toString('base64');
    const testCasesBase64 = Buffer.from(JSON.stringify(testCases)).toString('base64');

    // コールバックURL生成
    const callbackUrl = `${this.config.callbackBaseUrl}/api/leetcode/benchmark-callback`;

    try {
      // GitHub Actionsワークフローをトリガー
      await this.octokit.rest.actions.createWorkflowDispatch({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: this.config.workflowFile,
        ref: 'main',
        inputs: {
          evaluation_id: evaluationId,
          language: language,
          code: codeBase64,
          test_cases: testCasesBase64,
          run_count: String(runCount),
          callback_url: callbackUrl,
        },
      });

      // ワークフローランIDを取得（直後なので最新のランを取得）
      const { data: runs } = await this.octokit.rest.actions.listWorkflowRuns({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: this.config.workflowFile,
        per_page: 1,
      });

      const latestRun = runs.workflow_runs[0];

      return {
        success: true,
        runId: latestRun?.id,
        workflowUrl: latestRun?.html_url,
      };
    } catch (error) {
      console.error('Failed to trigger benchmark workflow:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * ワークフローの実行状態を確認
   */
  async checkWorkflowStatus(runId: number): Promise<{
    status: string;
    conclusion: string | null;
    completed: boolean;
  }> {
    try {
      const { data: run } = await this.octokit.rest.actions.getWorkflowRun({
        owner: this.config.owner,
        repo: this.config.repo,
        run_id: runId,
      });

      return {
        status: run.status ?? 'unknown',
        conclusion: run.conclusion,
        completed: run.status === 'completed',
      };
    } catch (error) {
      console.error('Failed to check workflow status:', error);
      return {
        status: 'error',
        conclusion: null,
        completed: false,
      };
    }
  }

}

/**
 * コールバックペイロードの検証
 */
export function validateBenchmarkCallback(payload: unknown): payload is {
  evaluationId: string;
  language: SupportedLanguage;
  result: BenchmarkResult;
} {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const p = payload as Record<string, unknown>;

  return (
    typeof p.evaluationId === 'string' &&
    typeof p.language === 'string' &&
    typeof p.result === 'object' &&
    p.result !== null
  );
}

/**
 * ベンチマーク結果の統計を計算
 */
export function calculateBenchmarkStats(times: number[]): {
  average: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (times.length === 0) {
    return { average: 0, min: 0, max: 0, stdDev: 0 };
  }

  const sum = times.reduce((a, b) => a + b, 0);
  const average = sum / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  const squaredDiffs = times.map((t) => Math.pow(t - average, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { average, min, max, stdDev };
}

// エクスポート
export * from './types';
