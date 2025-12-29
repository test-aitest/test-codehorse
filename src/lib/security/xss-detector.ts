/**
 * Phase 10: XSS Detector
 *
 * クロスサイトスクリプティング（XSS）脆弱性を検出
 */

import type { DetectedVulnerability, DetectionPattern } from "./types";

// ========================================
// XSSパターン
// ========================================

const XSS_PATTERNS: DetectionPattern[] = [
  // dangerouslySetInnerHTML
  {
    id: "react-dangerously-set-innerhtml",
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "dangerouslySetInnerHTML の使用が検出されました。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "dangerouslySetInnerHTML usage detected. Vulnerable to XSS if it includes user input.",
    remediationJa: "可能な限り dangerouslySetInnerHTML を避け、使用する場合は DOMPurify などでサニタイズしてください。",
    remediationEn: "Avoid dangerouslySetInnerHTML when possible. If needed, sanitize with DOMPurify.",
  },
  // innerHTML の直接設定
  {
    id: "innerhtml-assignment",
    pattern: /\.innerHTML\s*=\s*(?!["'`])/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "innerHTML への直接代入が検出されました。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "Direct innerHTML assignment detected. Vulnerable to XSS if it includes user input.",
    remediationJa: "textContent を使用するか、DOM操作メソッドを使用してください。",
    remediationEn: "Use textContent or DOM manipulation methods instead.",
  },
  // outerHTML の直接設定
  {
    id: "outerhtml-assignment",
    pattern: /\.outerHTML\s*=\s*(?!["'`])/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "outerHTML への直接代入が検出されました。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "Direct outerHTML assignment detected. Vulnerable to XSS if it includes user input.",
    remediationJa: "DOM操作メソッドを使用してください。",
    remediationEn: "Use DOM manipulation methods instead.",
  },
  // document.write
  {
    id: "document-write",
    pattern: /document\.write\s*\(/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "document.write の使用が検出されました。XSS攻撃に対して脆弱で、パフォーマンスにも悪影響があります。",
    descriptionEn: "document.write usage detected. Vulnerable to XSS and has performance issues.",
    remediationJa: "DOM操作メソッド（appendChild, insertAdjacentHTML等）を使用してください。",
    remediationEn: "Use DOM manipulation methods (appendChild, insertAdjacentHTML, etc.).",
  },
  // insertAdjacentHTML with variable
  {
    id: "insert-adjacent-html-unsafe",
    pattern: /\.insertAdjacentHTML\s*\(\s*["']\w+["']\s*,\s*(?!\s*["'`])/g,
    vulnerabilityType: "XSS",
    severity: "MEDIUM",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "insertAdjacentHTML で変数が使用されています。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "insertAdjacentHTML used with variable. Vulnerable to XSS if it includes user input.",
    remediationJa: "入力をサニタイズするか、DOM操作メソッドを使用してください。",
    remediationEn: "Sanitize input or use DOM manipulation methods.",
  },
  // eval の使用
  {
    id: "eval-usage",
    pattern: /\beval\s*\(/g,
    vulnerabilityType: "XSS",
    severity: "CRITICAL",
    cweId: "CWE-95",
    owaspCategory: "A03",
    descriptionJa: "eval の使用が検出されました。コードインジェクション攻撃に対して非常に脆弱です。",
    descriptionEn: "eval usage detected. Highly vulnerable to code injection attacks.",
    remediationJa: "eval の使用を避け、JSON.parse や他の安全な代替手段を使用してください。",
    remediationEn: "Avoid eval. Use JSON.parse or other safe alternatives.",
  },
  // new Function
  {
    id: "new-function-usage",
    pattern: /new\s+Function\s*\(/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-95",
    owaspCategory: "A03",
    descriptionJa: "new Function の使用が検出されました。eval と同様にコードインジェクション攻撃に対して脆弱です。",
    descriptionEn: "new Function usage detected. Vulnerable to code injection like eval.",
    remediationJa: "new Function の使用を避け、安全な代替手段を使用してください。",
    remediationEn: "Avoid new Function. Use safe alternatives.",
  },
  // setTimeout/setInterval with string
  {
    id: "settimeout-string",
    pattern: /set(?:Timeout|Interval)\s*\(\s*["'`]/g,
    vulnerabilityType: "XSS",
    severity: "MEDIUM",
    cweId: "CWE-95",
    owaspCategory: "A03",
    descriptionJa: "setTimeout/setInterval に文字列が渡されています。関数を直接渡してください。",
    descriptionEn: "String passed to setTimeout/setInterval. Pass a function directly.",
    remediationJa: "文字列ではなく関数を渡してください。",
    remediationEn: "Pass a function instead of a string.",
  },
  // v-html in Vue
  {
    id: "vue-v-html",
    pattern: /v-html\s*=\s*["'][^"']+["']/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "Vue の v-html ディレクティブが検出されました。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "Vue v-html directive detected. Vulnerable to XSS if it includes user input.",
    remediationJa: "可能な限り v-html を避け、使用する場合はサニタイズしてください。",
    remediationEn: "Avoid v-html when possible. If needed, sanitize the content.",
  },
  // [innerHTML] in Angular
  {
    id: "angular-innerhtml-binding",
    pattern: /\[innerHTML\]\s*=\s*["'][^"']+["']/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "Angular の innerHTML バインディングが検出されました。Angular は自動サニタイズしますが、bypassSecurityTrustHtml を使用している場合は脆弱です。",
    descriptionEn: "Angular innerHTML binding detected. Angular auto-sanitizes, but vulnerable if bypassSecurityTrustHtml is used.",
    remediationJa: "bypassSecurityTrustHtml の使用を避けてください。",
    remediationEn: "Avoid using bypassSecurityTrustHtml.",
  },
  // bypassSecurityTrust in Angular
  {
    id: "angular-bypass-security",
    pattern: /bypassSecurityTrust(?:Html|Script|Style|Url|ResourceUrl)\s*\(/g,
    vulnerabilityType: "XSS",
    severity: "HIGH",
    cweId: "CWE-79",
    owaspCategory: "A03",
    descriptionJa: "Angular のセキュリティバイパスが検出されました。ユーザー入力を含む場合、XSS攻撃に対して脆弱です。",
    descriptionEn: "Angular security bypass detected. Vulnerable to XSS if it includes user input.",
    remediationJa: "可能な限りセキュリティバイパスを避け、使用する場合は入力を厳密に検証してください。",
    remediationEn: "Avoid security bypasses when possible. If needed, strictly validate input.",
  },
];

// ========================================
// メイン検出関数
// ========================================

/**
 * XSS脆弱性を検出
 */
export function detectXss(
  code: string,
  filePath: string,
  language: "ja" | "en" = "ja"
): DetectedVulnerability[] {
  const vulnerabilities: DetectedVulnerability[] = [];
  const lines = code.split("\n");

  for (const pattern of XSS_PATTERNS) {
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
