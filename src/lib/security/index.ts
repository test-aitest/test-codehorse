/**
 * Phase 10: Security Module
 *
 * セキュリティ脆弱性スキャン機能のエクスポート
 */

// 型定義
export type {
  VulnerabilityTypeValue,
  SecuritySeverityValue,
  DetectedVulnerability,
  CWEInfo,
  OWASPCategory,
  SecurityScanOptions,
  SecurityScanResult,
  SecurityScanStats,
  DetectionPattern,
  SecretType,
  SecretPattern,
} from "./types";

export { OWASP_CATEGORIES, DEFAULT_SECURITY_OPTIONS } from "./types";

// スキャナー
export {
  scanFile,
  scanFiles,
  scanPullRequestChanges,
  generateMarkdownReport,
} from "./vulnerability-scanner";

// 個別検出器
export { detectSqlInjection } from "./sql-injection-detector";
export { detectXss } from "./xss-detector";
export { detectSecrets } from "./secret-detector";
export { analyzeAuth } from "./auth-analyzer";
