/**
 * Phase 10: Security Vulnerability Scanner Types
 *
 * セキュリティ脆弱性スキャンのための型定義
 */

// ========================================
// 脆弱性タイプ
// ========================================

/** 脆弱性の種類 */
export type VulnerabilityTypeValue =
  | "SQL_INJECTION"
  | "XSS"
  | "CSRF"
  | "BROKEN_AUTH"
  | "SENSITIVE_DATA_EXPOSURE"
  | "INSECURE_DESERIALIZATION"
  | "HARDCODED_SECRET"
  | "PATH_TRAVERSAL"
  | "COMMAND_INJECTION"
  | "INSECURE_RANDOM"
  | "MISSING_AUTH_CHECK"
  | "INSECURE_COOKIE"
  | "OPEN_REDIRECT"
  | "PROTOTYPE_POLLUTION"
  | "REGEX_DOS"
  | "DEPENDENCY_VULNERABILITY";

/** セキュリティ重要度 */
export type SecuritySeverityValue = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ========================================
// 検出結果
// ========================================

/** 検出されたセキュリティ脆弱性 */
export interface DetectedVulnerability {
  /** 脆弱性の種類 */
  vulnerabilityType: VulnerabilityTypeValue;
  /** 重要度 */
  severity: SecuritySeverityValue;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  lineNumber: number;
  /** 終了行番号（範囲の場合） */
  endLineNumber?: number;
  /** CWE ID */
  cweId?: string;
  /** OWASP Top 10 カテゴリ */
  owaspCategory?: string;
  /** 説明 */
  description: string;
  /** 修正方法 */
  remediation?: string;
  /** 問題のあるコードスニペット */
  codeSnippet?: string;
  /** パターンID（重複排除用） */
  patternId?: string;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/** CWE情報 */
export interface CWEInfo {
  id: string;
  name: string;
  description: string;
  url: string;
}

/** OWASP Top 10カテゴリ */
export const OWASP_CATEGORIES = {
  A01: "Broken Access Control",
  A02: "Cryptographic Failures",
  A03: "Injection",
  A04: "Insecure Design",
  A05: "Security Misconfiguration",
  A06: "Vulnerable and Outdated Components",
  A07: "Identification and Authentication Failures",
  A08: "Software and Data Integrity Failures",
  A09: "Security Logging and Monitoring Failures",
  A10: "Server-Side Request Forgery",
} as const;

export type OWASPCategory = keyof typeof OWASP_CATEGORIES;

// ========================================
// スキャン設定
// ========================================

/** セキュリティスキャンオプション */
export interface SecurityScanOptions {
  /** SQLインジェクション検出を有効にするか */
  detectSqlInjection?: boolean;
  /** XSS検出を有効にするか */
  detectXss?: boolean;
  /** 機密情報検出を有効にするか */
  detectSecrets?: boolean;
  /** 認証問題検出を有効にするか */
  detectAuthIssues?: boolean;
  /** コマンドインジェクション検出を有効にするか */
  detectCommandInjection?: boolean;
  /** パストラバーサル検出を有効にするか */
  detectPathTraversal?: boolean;
  /** プロトタイプ汚染検出を有効にするか */
  detectPrototypePollution?: boolean;
  /** ReDoS検出を有効にするか */
  detectReDoS?: boolean;
  /** 最小重要度（これ以上の重要度のみ報告） */
  minSeverity?: SecuritySeverityValue;
  /** 最大検出数 */
  maxIssues?: number;
  /** 除外パターン（glob） */
  excludePatterns?: string[];
  /** 言語 */
  language?: "ja" | "en";
}

/** デフォルトオプション */
export const DEFAULT_SECURITY_OPTIONS: Required<SecurityScanOptions> = {
  detectSqlInjection: true,
  detectXss: true,
  detectSecrets: true,
  detectAuthIssues: true,
  detectCommandInjection: true,
  detectPathTraversal: true,
  detectPrototypePollution: true,
  detectReDoS: true,
  minSeverity: "LOW",
  maxIssues: 100,
  excludePatterns: ["node_modules/**", "*.test.*", "*.spec.*", "__tests__/**"],
  language: "ja",
};

// ========================================
// スキャン結果
// ========================================

/** スキャン結果 */
export interface SecurityScanResult {
  /** 検出された脆弱性 */
  vulnerabilities: DetectedVulnerability[];
  /** 分析したファイル数 */
  filesScanned: number;
  /** 分析時間（ms） */
  scanTimeMs: number;
  /** 統計情報 */
  stats: SecurityScanStats;
}

/** 統計情報 */
export interface SecurityScanStats {
  /** 重要度別カウント */
  bySeverity: Record<SecuritySeverityValue, number>;
  /** 脆弱性タイプ別カウント */
  byType: Record<string, number>;
  /** ファイル別カウント */
  byFile: Record<string, number>;
}

// ========================================
// パターン定義
// ========================================

/** 検出パターン */
export interface DetectionPattern {
  /** パターンID */
  id: string;
  /** 正規表現パターン */
  pattern: RegExp;
  /** 脆弱性タイプ */
  vulnerabilityType: VulnerabilityTypeValue;
  /** 重要度 */
  severity: SecuritySeverityValue;
  /** CWE ID */
  cweId?: string;
  /** OWASP カテゴリ */
  owaspCategory?: OWASPCategory;
  /** 説明（日本語） */
  descriptionJa: string;
  /** 説明（英語） */
  descriptionEn: string;
  /** 修正方法（日本語） */
  remediationJa: string;
  /** 修正方法（英語） */
  remediationEn: string;
  /** コンテキストチェック関数（falseを返すとスキップ） */
  contextCheck?: (code: string, match: RegExpExecArray, lineNumber: number) => boolean;
}

// ========================================
// 機密情報タイプ
// ========================================

/** 機密情報の種類 */
export type SecretType =
  | "API_KEY"
  | "AWS_ACCESS_KEY"
  | "AWS_SECRET_KEY"
  | "GITHUB_TOKEN"
  | "PRIVATE_KEY"
  | "PASSWORD"
  | "DATABASE_URL"
  | "JWT_SECRET"
  | "OAUTH_SECRET"
  | "ENCRYPTION_KEY"
  | "GENERIC_SECRET";

/** 機密情報パターン */
export interface SecretPattern {
  type: SecretType;
  pattern: RegExp;
  description: string;
}
