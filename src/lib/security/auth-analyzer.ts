/**
 * Phase 10: Authentication & Authorization Analyzer
 *
 * 認証・認可に関する脆弱性を検出
 */

import type { DetectedVulnerability, DetectionPattern } from "./types";

// ========================================
// 認証・認可パターン
// ========================================

const AUTH_PATTERNS: DetectionPattern[] = [
  // JWT検証なし
  {
    id: "jwt-no-verify",
    pattern: /jwt\.decode\s*\(/g,
    vulnerabilityType: "BROKEN_AUTH",
    severity: "HIGH",
    cweId: "CWE-347",
    owaspCategory: "A07",
    descriptionJa:
      "jwt.decode が使用されています。これは署名を検証しません。jwt.verify を使用してください。",
    descriptionEn:
      "jwt.decode is used. This does not verify the signature. Use jwt.verify instead.",
    remediationJa: "jwt.decode を jwt.verify に置き換え、秘密鍵で検証してください。",
    remediationEn: "Replace jwt.decode with jwt.verify and verify with the secret key.",
  },
  // セッションの安全でない設定
  {
    id: "session-insecure-cookie",
    pattern: /cookie\s*:\s*\{[^}]*secure\s*:\s*false/g,
    vulnerabilityType: "INSECURE_COOKIE",
    severity: "MEDIUM",
    cweId: "CWE-614",
    owaspCategory: "A05",
    descriptionJa: "Cookie の secure フラグが false に設定されています。HTTPS でのみ送信されるべきです。",
    descriptionEn: "Cookie secure flag is set to false. Should only be sent over HTTPS.",
    remediationJa: "secure: true に設定してください（本番環境）。",
    remediationEn: "Set secure: true (in production).",
  },
  // HttpOnly フラグなし
  {
    id: "session-no-httponly",
    pattern: /cookie\s*:\s*\{[^}]*httpOnly\s*:\s*false/g,
    vulnerabilityType: "INSECURE_COOKIE",
    severity: "MEDIUM",
    cweId: "CWE-1004",
    owaspCategory: "A05",
    descriptionJa: "Cookie の httpOnly フラグが false に設定されています。XSS 攻撃でセッションが盗まれる可能性があります。",
    descriptionEn:
      "Cookie httpOnly flag is set to false. Session could be stolen via XSS attacks.",
    remediationJa: "httpOnly: true に設定してください。",
    remediationEn: "Set httpOnly: true.",
  },
  // SameSite 設定なし
  {
    id: "session-no-samesite",
    pattern: /cookie\s*:\s*\{[^}]*sameSite\s*:\s*['"]none['"]/gi,
    vulnerabilityType: "CSRF",
    severity: "MEDIUM",
    cweId: "CWE-352",
    owaspCategory: "A01",
    descriptionJa:
      "Cookie の sameSite が 'none' に設定されています。CSRF 攻撃に対して脆弱です。",
    descriptionEn: "Cookie sameSite is set to 'none'. Vulnerable to CSRF attacks.",
    remediationJa: "sameSite: 'strict' または 'lax' に設定してください。",
    remediationEn: "Set sameSite: 'strict' or 'lax'.",
  },
  // bcrypt ラウンド数が低い
  {
    id: "bcrypt-low-rounds",
    pattern: /bcrypt\.(?:hash|hashSync)\s*\([^,]+,\s*([1-9])\s*\)/g,
    vulnerabilityType: "BROKEN_AUTH",
    severity: "MEDIUM",
    cweId: "CWE-916",
    owaspCategory: "A02",
    descriptionJa: "bcrypt のラウンド数が低すぎます（10以上を推奨）。",
    descriptionEn: "bcrypt rounds are too low (10+ recommended).",
    remediationJa: "ラウンド数を10以上に設定してください。",
    remediationEn: "Set rounds to 10 or higher.",
  },
  // MD5/SHA1 でのパスワードハッシュ
  {
    id: "weak-password-hash",
    pattern: /(?:crypto\.createHash|createHash)\s*\(\s*['"](?:md5|sha1)['"]\s*\)/gi,
    vulnerabilityType: "BROKEN_AUTH",
    severity: "HIGH",
    cweId: "CWE-328",
    owaspCategory: "A02",
    descriptionJa:
      "MD5 または SHA1 がハッシュに使用されています。パスワードには bcrypt/argon2 を使用してください。",
    descriptionEn:
      "MD5 or SHA1 used for hashing. Use bcrypt/argon2 for passwords.",
    remediationJa: "bcrypt または argon2 を使用してください。",
    remediationEn: "Use bcrypt or argon2.",
  },
  // 認証バイパスパターン
  {
    id: "auth-bypass-pattern",
    pattern: /if\s*\(\s*(?:isAdmin|isAuthenticated|authorized)\s*(?:===?\s*false|!==?\s*true)?\s*\)\s*\{?\s*(?:return|next\(\))/g,
    vulnerabilityType: "MISSING_AUTH_CHECK",
    severity: "HIGH",
    cweId: "CWE-862",
    owaspCategory: "A01",
    descriptionJa: "認証チェックが不適切な可能性があります。条件の論理を確認してください。",
    descriptionEn:
      "Authentication check may be incorrect. Verify the condition logic.",
    remediationJa: "認証チェックの条件を確認し、適切なアクセス制御を実装してください。",
    remediationEn: "Review the authentication check condition and implement proper access control.",
  },
  // 安全でない乱数生成
  {
    id: "insecure-random",
    pattern: /Math\.random\s*\(\s*\)/g,
    vulnerabilityType: "INSECURE_RANDOM",
    severity: "MEDIUM",
    cweId: "CWE-338",
    owaspCategory: "A02",
    descriptionJa:
      "Math.random() は暗号学的に安全ではありません。セキュリティ目的には crypto.randomBytes を使用してください。",
    descriptionEn:
      "Math.random() is not cryptographically secure. Use crypto.randomBytes for security purposes.",
    remediationJa: "crypto.randomBytes() または crypto.getRandomValues() を使用してください。",
    remediationEn: "Use crypto.randomBytes() or crypto.getRandomValues().",
    contextCheck: (code, match, lineNumber) => {
      // セキュリティコンテキストでの使用をチェック
      const lines = code.split("\n");
      const surroundingLines = lines
        .slice(Math.max(0, lineNumber - 3), lineNumber + 2)
        .join("\n")
        .toLowerCase();
      return (
        surroundingLines.includes("token") ||
        surroundingLines.includes("secret") ||
        surroundingLines.includes("password") ||
        surroundingLines.includes("session") ||
        surroundingLines.includes("key") ||
        surroundingLines.includes("auth")
      );
    },
  },
  // オープンリダイレクト
  {
    id: "open-redirect",
    pattern: /(?:res\.redirect|window\.location|location\.href)\s*(?:=|\()\s*(?:req\.(?:query|params|body)\.[^\s;)]+|[^"'`\s;)]+\+)/g,
    vulnerabilityType: "OPEN_REDIRECT",
    severity: "MEDIUM",
    cweId: "CWE-601",
    owaspCategory: "A01",
    descriptionJa:
      "ユーザー入力をリダイレクトに使用しています。オープンリダイレクト攻撃に対して脆弱です。",
    descriptionEn:
      "User input used in redirect. Vulnerable to open redirect attacks.",
    remediationJa: "リダイレクト先をホワイトリストで検証するか、相対パスのみを許可してください。",
    remediationEn: "Validate redirect targets against a whitelist or allow only relative paths.",
  },
  // CORS の設定ミス
  {
    id: "cors-wildcard",
    pattern: /(?:Access-Control-Allow-Origin|origin)\s*[:=]\s*['"]\*['"]/g,
    vulnerabilityType: "BROKEN_AUTH",
    severity: "MEDIUM",
    cweId: "CWE-942",
    owaspCategory: "A05",
    descriptionJa: "CORS で全てのオリジンを許可しています。信頼できるオリジンのみを許可してください。",
    descriptionEn: "CORS allows all origins. Allow only trusted origins.",
    remediationJa: "特定の信頼できるオリジンのみを許可してください。",
    remediationEn: "Allow only specific trusted origins.",
  },
  // 認証なしのルート（Express/Next.js）
  {
    id: "unprotected-route",
    pattern: /app\.(?:get|post|put|delete|patch)\s*\(\s*['"][^'"]*(?:admin|user|account|profile|settings|dashboard)[^'"]*['"]\s*,\s*(?:async\s*)?\(?(?:req|request)/gi,
    vulnerabilityType: "MISSING_AUTH_CHECK",
    severity: "LOW",
    cweId: "CWE-862",
    owaspCategory: "A01",
    descriptionJa:
      "機密性の高いルートに認証ミドルウェアがない可能性があります。確認してください。",
    descriptionEn:
      "Sensitive route may not have authentication middleware. Please verify.",
    remediationJa: "認証ミドルウェアをルートに追加してください。",
    remediationEn: "Add authentication middleware to the route.",
  },
  // パスワードのログ出力
  {
    id: "password-logging",
    pattern: /console\.(?:log|info|debug|warn|error)\s*\([^)]*(?:password|passwd|pwd|secret|token|apiKey|api_key)/gi,
    vulnerabilityType: "SENSITIVE_DATA_EXPOSURE",
    severity: "HIGH",
    cweId: "CWE-532",
    owaspCategory: "A09",
    descriptionJa: "機密情報がログに出力されている可能性があります。",
    descriptionEn: "Sensitive information may be logged.",
    remediationJa: "機密情報をログに出力しないでください。",
    remediationEn: "Do not log sensitive information.",
  },
  // 安全でないデシリアライゼーション
  {
    id: "unsafe-deserialization",
    pattern: /(?:JSON\.parse|deserialize|unserialize)\s*\(\s*(?:req\.(?:body|query|params)|request\.)/g,
    vulnerabilityType: "INSECURE_DESERIALIZATION",
    severity: "HIGH",
    cweId: "CWE-502",
    owaspCategory: "A08",
    descriptionJa:
      "ユーザー入力の直接デシリアライズは危険です。入力を検証してください。",
    descriptionEn:
      "Direct deserialization of user input is dangerous. Validate input.",
    remediationJa: "入力を検証し、信頼できるデータのみをデシリアライズしてください。",
    remediationEn: "Validate input and only deserialize trusted data.",
  },
  // パストラバーサル
  {
    id: "path-traversal",
    pattern: /(?:fs\.(?:readFile|writeFile|readdir|unlink|access|stat)|path\.(?:join|resolve))\s*\([^)]*(?:req\.(?:query|params|body)|request\.)/g,
    vulnerabilityType: "PATH_TRAVERSAL",
    severity: "HIGH",
    cweId: "CWE-22",
    owaspCategory: "A01",
    descriptionJa:
      "ユーザー入力をファイルパスに使用しています。パストラバーサル攻撃に対して脆弱です。",
    descriptionEn:
      "User input used in file path. Vulnerable to path traversal attacks.",
    remediationJa: "入力をサニタイズし、ベースディレクトリ外へのアクセスを防いでください。",
    remediationEn: "Sanitize input and prevent access outside the base directory.",
  },
  // コマンドインジェクション
  {
    id: "command-injection",
    pattern: /(?:child_process\.(?:exec|execSync|spawn|spawnSync)|exec\(|execSync\()\s*(?:[^)]*(?:req\.(?:query|params|body)|request\.)|[`"'][^`"']*\$\{)/g,
    vulnerabilityType: "COMMAND_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-78",
    owaspCategory: "A03",
    descriptionJa:
      "ユーザー入力がシェルコマンドに渡されています。コマンドインジェクション攻撃に対して脆弱です。",
    descriptionEn:
      "User input passed to shell command. Vulnerable to command injection attacks.",
    remediationJa: "ユーザー入力を直接コマンドに渡さないでください。必要な場合は厳密にサニタイズしてください。",
    remediationEn:
      "Do not pass user input directly to commands. If needed, strictly sanitize input.",
  },
  // プロトタイプ汚染
  {
    id: "prototype-pollution",
    pattern: /(?:Object\.assign|_\.(?:merge|extend|defaults|defaultsDeep)|lodash\.(?:merge|extend))\s*\([^,]*,\s*(?:req\.(?:body|query)|request\.)/g,
    vulnerabilityType: "PROTOTYPE_POLLUTION",
    severity: "HIGH",
    cweId: "CWE-1321",
    owaspCategory: "A03",
    descriptionJa:
      "ユーザー入力を直接オブジェクトにマージしています。プロトタイプ汚染攻撃に対して脆弱です。",
    descriptionEn:
      "User input directly merged into object. Vulnerable to prototype pollution attacks.",
    remediationJa: "入力を検証し、__proto__ や constructor プロパティをフィルタリングしてください。",
    remediationEn: "Validate input and filter __proto__ and constructor properties.",
  },
];

// ========================================
// メイン検出関数
// ========================================

/**
 * 認証・認可に関する脆弱性を検出
 */
export function analyzeAuth(
  code: string,
  filePath: string,
  language: "ja" | "en" = "ja"
): DetectedVulnerability[] {
  const vulnerabilities: DetectedVulnerability[] = [];
  const lines = code.split("\n");

  // テストファイルやモックファイルをスキップ
  if (shouldSkipFile(filePath)) {
    return vulnerabilities;
  }

  for (const pattern of AUTH_PATTERNS) {
    pattern.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.pattern.exec(code)) !== null) {
      const lineNumber = code.substring(0, match.index).split("\n").length;
      const line = lines[lineNumber - 1] || "";

      // コメント内の場合はスキップ
      if (isInComment(line, match[0])) {
        continue;
      }

      // コンテキストチェック
      if (pattern.contextCheck && !pattern.contextCheck(code, match, lineNumber)) {
        continue;
      }

      vulnerabilities.push({
        vulnerabilityType: pattern.vulnerabilityType,
        severity: pattern.severity,
        filePath,
        lineNumber,
        cweId: pattern.cweId,
        owaspCategory: pattern.owaspCategory,
        description: language === "ja" ? pattern.descriptionJa : pattern.descriptionEn,
        remediation: language === "ja" ? pattern.remediationJa : pattern.remediationEn,
        codeSnippet: line.trim(),
        patternId: pattern.id,
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
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__/,
    /fixtures/,
    /mocks?/,
    /\.d\.ts$/,
  ];

  return skipPatterns.some((pattern) => pattern.test(filePath));
}

/**
 * コメント内かチェック
 */
function isInComment(line: string, match: string): boolean {
  const matchIndex = line.indexOf(match);
  const commentIndex = line.indexOf("//");
  const blockCommentStart = line.indexOf("/*");

  if (commentIndex !== -1 && commentIndex < matchIndex) {
    return true;
  }
  if (blockCommentStart !== -1 && blockCommentStart < matchIndex) {
    return true;
  }
  return false;
}
