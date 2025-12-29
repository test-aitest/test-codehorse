/**
 * Phase 9: CI Feedback Analysis Types
 *
 * CIログ分析と失敗原因特定のための型定義
 */

// ========================================
// CIプロバイダー関連
// ========================================

/** サポートするCIプロバイダー */
export type CIProviderType =
  | "GITHUB_ACTIONS"
  | "GITLAB_CI"
  | "CIRCLECI"
  | "JENKINS"
  | "TRAVIS_CI"
  | "AZURE_PIPELINES";

/** CI失敗タイプ */
export type CIFailureTypeValue =
  | "TEST_FAILURE"
  | "BUILD_ERROR"
  | "LINT_ERROR"
  | "TYPE_ERROR"
  | "DEPENDENCY_ERROR"
  | "TIMEOUT"
  | "OUT_OF_MEMORY"
  | "PERMISSION_ERROR"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

// ========================================
// ログパース関連
// ========================================

/** パースされたCIログ */
export interface ParsedCILog {
  /** CIプロバイダー */
  provider: CIProviderType;
  /** ワークフロー/ジョブ名 */
  workflowName?: string;
  /** ジョブ名 */
  jobName?: string;
  /** ステップ名 */
  stepName?: string;
  /** 実行時間（秒） */
  duration?: number;
  /** 終了コード */
  exitCode?: number;
  /** 失敗タイプ */
  failureType: CIFailureTypeValue;
  /** エラーメッセージ（抽出） */
  errorMessages: ExtractedError[];
  /** 失敗したテスト */
  failedTests: FailedTest[];
  /** ビルドエラー */
  buildErrors: BuildError[];
  /** 型エラー */
  typeErrors: TypeErrorInfo[];
  /** Lintエラー */
  lintErrors: LintError[];
  /** 依存関係エラー */
  dependencyErrors: DependencyError[];
  /** 生ログの関連部分 */
  relevantLogSections: string[];
  /** メタデータ */
  metadata: Record<string, unknown>;
}

/** 抽出されたエラー */
export interface ExtractedError {
  /** エラーメッセージ */
  message: string;
  /** ファイルパス（あれば） */
  filePath?: string;
  /** 行番号（あれば） */
  lineNumber?: number;
  /** カラム番号（あれば） */
  columnNumber?: number;
  /** エラーコード（あれば） */
  errorCode?: string;
  /** スタックトレース（あれば） */
  stackTrace?: string;
}

/** 失敗したテスト */
export interface FailedTest {
  /** テスト名 */
  testName: string;
  /** テストファイル */
  testFile?: string;
  /** テストスイート */
  testSuite?: string;
  /** エラーメッセージ */
  errorMessage: string;
  /** 期待値 */
  expected?: string;
  /** 実際の値 */
  actual?: string;
  /** スタックトレース */
  stackTrace?: string;
  /** 実行時間（ms） */
  duration?: number;
}

/** ビルドエラー */
export interface BuildError {
  /** エラーメッセージ */
  message: string;
  /** ファイルパス */
  filePath?: string;
  /** 行番号 */
  lineNumber?: number;
  /** エラーコード */
  errorCode?: string;
  /** コンパイラ/ビルドツール */
  tool?: string;
}

/** 型エラー */
export interface TypeErrorInfo {
  /** エラーメッセージ */
  message: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber: number;
  /** カラム番号 */
  columnNumber?: number;
  /** TypeScriptエラーコード */
  tsErrorCode?: string;
  /** 期待される型 */
  expectedType?: string;
  /** 実際の型 */
  actualType?: string;
}

/** Lintエラー */
export interface LintError {
  /** ルール名 */
  rule: string;
  /** メッセージ */
  message: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber: number;
  /** カラム番号 */
  columnNumber?: number;
  /** 重要度 */
  severity: "error" | "warning";
  /** 自動修正可能か */
  fixable?: boolean;
}

/** 依存関係エラー */
export interface DependencyError {
  /** パッケージ名 */
  packageName: string;
  /** 要求バージョン */
  requiredVersion?: string;
  /** インストールされたバージョン */
  installedVersion?: string;
  /** エラータイプ */
  errorType: "NOT_FOUND" | "VERSION_MISMATCH" | "PEER_DEPENDENCY" | "SECURITY" | "OTHER";
  /** エラーメッセージ */
  message: string;
}

// ========================================
// 分析結果関連
// ========================================

/** CI失敗分析結果 */
export interface CIFailureAnalysisResult {
  /** 失敗タイプ */
  failureType: CIFailureTypeValue;
  /** 信頼度（0-1） */
  confidence: number;
  /** 根本原因の要約 */
  rootCauseSummary: string;
  /** 詳細な分析 */
  detailedAnalysis: string;
  /** 影響を受けるファイル */
  affectedFiles: AffectedFile[];
  /** 修正提案 */
  suggestions: FixSuggestion[];
  /** 関連するドキュメント/リンク */
  relatedLinks: RelatedLink[];
  /** 類似の過去の失敗 */
  similarPastFailures?: SimilarFailure[];
}

/** 影響を受けるファイル */
export interface AffectedFile {
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber?: number;
  /** 問題の説明 */
  issue: string;
  /** 重要度 */
  severity: "critical" | "high" | "medium" | "low";
}

/** 修正提案 */
export interface FixSuggestion {
  /** 提案のタイトル */
  title: string;
  /** 説明 */
  description: string;
  /** 修正タイプ */
  type: "code_change" | "config_change" | "dependency_update" | "manual_action";
  /** 優先度 */
  priority: "high" | "medium" | "low";
  /** コード変更（あれば） */
  codeChange?: {
    filePath: string;
    lineNumber?: number;
    before?: string;
    after: string;
  };
  /** 実行コマンド（あれば） */
  command?: string;
  /** 自動適用可能か */
  autoApplicable: boolean;
}

/** 関連リンク */
export interface RelatedLink {
  /** タイトル */
  title: string;
  /** URL */
  url: string;
  /** 種類 */
  type: "documentation" | "stackoverflow" | "github_issue" | "other";
}

/** 類似の過去の失敗 */
export interface SimilarFailure {
  /** 失敗ID */
  id: string;
  /** 類似度スコア（0-1） */
  similarityScore: number;
  /** 解決されたか */
  wasResolved: boolean;
  /** 解決方法（あれば） */
  resolution?: string;
}

// ========================================
// CIプロバイダーインターフェース
// ========================================

/** CIプロバイダーのログ取得インターフェース */
export interface CIProviderInterface {
  /** プロバイダー名 */
  readonly providerName: CIProviderType;

  /** ログを取得 */
  fetchLogs(params: FetchLogsParams): Promise<string>;

  /** Check Run/Job情報を取得 */
  getCheckRunInfo(params: GetCheckRunParams): Promise<CheckRunInfo>;

  /** ログをパース */
  parseLog(rawLog: string): ParsedCILog;
}

/** ログ取得パラメータ */
export interface FetchLogsParams {
  owner: string;
  repo: string;
  checkRunId: string | number;
  installationId?: number;
}

/** Check Run情報取得パラメータ */
export interface GetCheckRunParams {
  owner: string;
  repo: string;
  checkRunId: string | number;
  installationId?: number;
}

/** Check Run情報 */
export interface CheckRunInfo {
  id: string | number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required";
  startedAt?: Date;
  completedAt?: Date;
  htmlUrl?: string;
  detailsUrl?: string;
}

// ========================================
// 設定関連
// ========================================

/** CI分析オプション */
export interface CIAnalysisOptions {
  /** 最大ログサイズ（バイト） */
  maxLogSize?: number;
  /** 分析対象のプロバイダー */
  enabledProviders?: CIProviderType[];
  /** 類似失敗の検索を有効化 */
  enableSimilaritySearch?: boolean;
  /** 類似度の閾値 */
  similarityThreshold?: number;
  /** 最大提案数 */
  maxSuggestions?: number;
  /** 言語 */
  language?: "ja" | "en";
}

/** デフォルトオプション */
export const DEFAULT_CI_ANALYSIS_OPTIONS: Required<CIAnalysisOptions> = {
  maxLogSize: 1_000_000, // 1MB
  enabledProviders: ["GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI"],
  enableSimilaritySearch: true,
  similarityThreshold: 0.7,
  maxSuggestions: 5,
  language: "ja",
};
