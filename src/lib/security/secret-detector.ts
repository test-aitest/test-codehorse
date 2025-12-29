/**
 * Phase 10: Secret Detector
 *
 * ハードコードされた機密情報を検出
 */

import type { DetectedVulnerability, SecretPattern, SecretType } from "./types";

// ========================================
// 機密情報パターン
// ========================================

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    type: "AWS_ACCESS_KEY",
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    description: "AWS Access Key ID",
  },
  {
    type: "AWS_SECRET_KEY",
    pattern: /(?:aws)?_?(?:secret)?_?(?:access)?_?key["'\s]*[:=]["'\s]*[A-Za-z0-9/+=]{40}/gi,
    description: "AWS Secret Access Key",
  },
  // GitHub
  {
    type: "GITHUB_TOKEN",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
    description: "GitHub Personal Access Token",
  },
  {
    type: "GITHUB_TOKEN",
    pattern: /github_pat_[A-Za-z0-9_]{22,255}/g,
    description: "GitHub Personal Access Token (fine-grained)",
  },
  // Private Keys
  {
    type: "PRIVATE_KEY",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    description: "Private Key",
  },
  // Generic API Keys
  {
    type: "API_KEY",
    pattern: /(?:api[_-]?key|apikey)["'\s]*[:=]["'\s]*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
    description: "API Key",
  },
  // Generic Secrets
  {
    type: "GENERIC_SECRET",
    pattern: /(?:secret|token|password|passwd|pwd)["'\s]*[:=]["'\s]*["'][^"'\s]{8,}["']/gi,
    description: "Generic Secret",
  },
  // JWT Secret
  {
    type: "JWT_SECRET",
    pattern: /(?:jwt[_-]?secret|jwtSecret)["'\s]*[:=]["'\s]*["'][^"']+["']/gi,
    description: "JWT Secret",
  },
  // Database URLs with credentials
  {
    type: "DATABASE_URL",
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^:]+:[^@]+@[^\s"']+/gi,
    description: "Database URL with credentials",
  },
  // OAuth secrets
  {
    type: "OAUTH_SECRET",
    pattern: /(?:client[_-]?secret|oauth[_-]?secret)["'\s]*[:=]["'\s]*["'][^"']{10,}["']/gi,
    description: "OAuth Client Secret",
  },
  // Stripe keys
  {
    type: "API_KEY",
    pattern: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g,
    description: "Stripe Secret Key",
  },
  {
    type: "API_KEY",
    pattern: /pk_(?:live|test)_[A-Za-z0-9]{24,}/g,
    description: "Stripe Publishable Key",
  },
  // SendGrid
  {
    type: "API_KEY",
    pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
    description: "SendGrid API Key",
  },
  // Slack
  {
    type: "API_KEY",
    pattern: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
    description: "Slack Token",
  },
  // Twilio
  {
    type: "API_KEY",
    pattern: /SK[0-9a-fA-F]{32}/g,
    description: "Twilio API Key",
  },
  // Google
  {
    type: "API_KEY",
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    description: "Google API Key",
  },
  // Encryption keys
  {
    type: "ENCRYPTION_KEY",
    pattern: /(?:encryption[_-]?key|aes[_-]?key|crypto[_-]?key)["'\s]*[:=]["'\s]*["'][^"']{16,}["']/gi,
    description: "Encryption Key",
  },
];

// 除外パターン（偽陽性を減らす）
const EXCLUSION_PATTERNS = [
  /process\.env\./,
  /\$\{.*?\}/,
  /\{\{.*?\}\}/,
  /<%.*?%>/,
  /example|sample|test|dummy|placeholder|xxx|your[_-]?/i,
  /<[^>]+>/,
  /^\s*\/\//,
  /^\s*\*/,
];

// ========================================
// メイン検出関数
// ========================================

/**
 * ハードコードされた機密情報を検出
 */
export function detectSecrets(
  code: string,
  filePath: string,
  language: "ja" | "en" = "ja"
): DetectedVulnerability[] {
  const vulnerabilities: DetectedVulnerability[] = [];
  const lines = code.split("\n");

  // 設定ファイルやテストファイルをスキップ
  if (shouldSkipFile(filePath)) {
    return vulnerabilities;
  }

  for (const secretPattern of SECRET_PATTERNS) {
    secretPattern.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = secretPattern.pattern.exec(code)) !== null) {
      const matchedText = match[0];
      const lineNumber = code.substring(0, match.index).split("\n").length;
      const line = lines[lineNumber - 1] || "";

      // 除外パターンをチェック
      if (shouldExclude(line, matchedText)) {
        continue;
      }

      // コメント内の場合はスキップ
      if (isInComment(line)) {
        continue;
      }

      const severity = getSeverityForSecretType(secretPattern.type);
      const description = getDescription(secretPattern, language);
      const remediation = getRemediation(secretPattern.type, language);

      vulnerabilities.push({
        vulnerabilityType: "HARDCODED_SECRET",
        severity,
        filePath,
        lineNumber,
        cweId: "CWE-798",
        owaspCategory: "A02",
        description,
        remediation,
        codeSnippet: maskSecret(line.trim()),
        patternId: `secret-${secretPattern.type.toLowerCase()}`,
        metadata: {
          secretType: secretPattern.type,
        },
      });
    }
  }

  return vulnerabilities;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * ファイルをスキップすべきかチェック
 */
function shouldSkipFile(filePath: string): boolean {
  const skipPatterns = [
    /\.example$/,
    /\.sample$/,
    /\.template$/,
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__/,
    /fixtures/,
    /mocks?/,
    /\.md$/,
    /\.txt$/,
    /CHANGELOG/i,
    /README/i,
  ];

  return skipPatterns.some(pattern => pattern.test(filePath));
}

/**
 * 除外すべきかチェック
 */
function shouldExclude(line: string, matchedText: string): boolean {
  // 環境変数参照
  if (/process\.env\.|import\.meta\.env\.|Deno\.env\.get/.test(line)) {
    return true;
  }

  // テンプレート変数
  if (/\$\{|\{\{|<%/.test(matchedText)) {
    return true;
  }

  // 除外パターンをチェック
  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(line) || pattern.test(matchedText)) {
      return true;
    }
  }

  return false;
}

/**
 * コメント内かチェック
 */
function isInComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

/**
 * 機密タイプに基づいて重要度を取得
 */
function getSeverityForSecretType(type: SecretType): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  switch (type) {
    case "PRIVATE_KEY":
    case "AWS_ACCESS_KEY":
    case "AWS_SECRET_KEY":
      return "CRITICAL";
    case "GITHUB_TOKEN":
    case "DATABASE_URL":
    case "JWT_SECRET":
    case "OAUTH_SECRET":
    case "ENCRYPTION_KEY":
      return "HIGH";
    case "API_KEY":
    case "PASSWORD":
      return "HIGH";
    default:
      return "MEDIUM";
  }
}

/**
 * 説明を取得
 */
function getDescription(pattern: SecretPattern, language: "ja" | "en"): string {
  if (language === "ja") {
    return `ハードコードされた${pattern.description}が検出されました。機密情報をコードにハードコードすることはセキュリティリスクです。`;
  }
  return `Hardcoded ${pattern.description} detected. Hardcoding secrets in code is a security risk.`;
}

/**
 * 修正方法を取得
 */
function getRemediation(type: SecretType, language: "ja" | "en"): string {
  if (language === "ja") {
    return "機密情報は環境変数やシークレット管理サービス（AWS Secrets Manager、HashiCorp Vault等）を使用して管理してください。";
  }
  return "Use environment variables or secret management services (AWS Secrets Manager, HashiCorp Vault, etc.) to manage secrets.";
}

/**
 * シークレットをマスク
 */
function maskSecret(line: string): string {
  // 長い文字列をマスク
  return line.replace(/([A-Za-z0-9_\-/+=]{8})[A-Za-z0-9_\-/+=]{4,}/g, "$1********");
}
