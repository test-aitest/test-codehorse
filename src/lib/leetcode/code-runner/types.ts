/**
 * コードランナーの型定義
 */

import type { SupportedLanguage, TestCase, BenchmarkResult, ExecutionResult } from '../types';

/**
 * コード実行リクエスト
 */
export interface ExecutionRequest {
  /** 評価ID */
  evaluationId: string;
  /** プログラミング言語 */
  language: SupportedLanguage;
  /** ユーザーコード */
  code: string;
  /** テストケース */
  testCases: TestCase[];
  /** ベンチマーク実行回数 */
  runCount?: number;
  /** タイムアウト（秒） */
  timeout?: number;
}

/**
 * GitHub Actions実行リクエスト
 */
export interface WorkflowDispatchRequest {
  /** 評価ID */
  evaluationId: string;
  /** プログラミング言語 */
  language: SupportedLanguage;
  /** Base64エンコードされたコード */
  codeBase64: string;
  /** Base64エンコードされたテストケースJSON */
  testCasesBase64: string;
  /** ベンチマーク実行回数 */
  runCount: number;
  /** コールバックURL */
  callbackUrl: string;
}

/**
 * ワークフロー実行結果
 */
export interface WorkflowRunResult {
  /** 成功したか */
  success: boolean;
  /** ワークフローランID */
  runId?: number;
  /** ワークフローURL */
  workflowUrl?: string;
  /** エラーメッセージ */
  error?: string;
}

/**
 * コールバックペイロード
 */
export interface BenchmarkCallbackPayload {
  /** 評価ID */
  evaluationId: string;
  /** プログラミング言語 */
  language: SupportedLanguage;
  /** ベンチマーク結果 */
  result: BenchmarkResult;
}

/**
 * ランナー設定
 */
export interface RunnerConfig {
  /** GitHub オーナー名 */
  owner: string;
  /** GitHub リポジトリ名 */
  repo: string;
  /** ワークフローファイル名 */
  workflowFile: string;
  /** デフォルト実行回数 */
  defaultRunCount: number;
  /** デフォルトタイムアウト（秒） */
  defaultTimeout: number;
  /** コールバックベースURL */
  callbackBaseUrl: string;
}

/**
 * デフォルト設定
 */
export const DEFAULT_RUNNER_CONFIG: Partial<RunnerConfig> = {
  workflowFile: 'leetcode-benchmark.yml',
  defaultRunCount: 20,
  defaultTimeout: 10,
};

/**
 * 言語別ファイル拡張子
 */
export const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  java: 'java',
  go: 'go',
};

/**
 * 言語別Dockerイメージタグ（将来の拡張用）
 */
export const LANGUAGE_IMAGES: Record<SupportedLanguage, string> = {
  python: 'leetcode-runner:python',
  javascript: 'leetcode-runner:node',
  typescript: 'leetcode-runner:node',
  java: 'leetcode-runner:java',
  go: 'leetcode-runner:go',
};
