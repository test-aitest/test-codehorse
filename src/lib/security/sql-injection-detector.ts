/**
 * Phase 10: SQL Injection Detector
 *
 * SQLインジェクション脆弱性を検出
 */

import type { DetectedVulnerability, DetectionPattern } from "./types";

// ========================================
// SQLインジェクションパターン
// ========================================

const SQL_INJECTION_PATTERNS: DetectionPattern[] = [
  // 文字列連結によるクエリ構築
  {
    id: "sql-string-concat",
    pattern: /(?:query|execute|raw)\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "テンプレートリテラルを使用したSQLクエリ構築が検出されました。SQLインジェクション攻撃に対して脆弱です。",
    descriptionEn: "SQL query construction using template literals detected. Vulnerable to SQL injection attacks.",
    remediationJa: "パラメータ化クエリまたはプリペアドステートメントを使用してください。",
    remediationEn: "Use parameterized queries or prepared statements.",
  },
  {
    id: "sql-plus-concat",
    pattern: /(?:query|execute|raw)\s*\(\s*["'].*?\s*\+\s*(?:\w+|["'])/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "文字列連結によるSQLクエリ構築が検出されました。SQLインジェクション攻撃に対して脆弱です。",
    descriptionEn: "SQL query construction using string concatenation detected. Vulnerable to SQL injection attacks.",
    remediationJa: "パラメータ化クエリまたはプリペアドステートメントを使用してください。",
    remediationEn: "Use parameterized queries or prepared statements.",
  },
  // $queryRaw の危険な使用
  {
    id: "prisma-raw-unsafe",
    pattern: /\$queryRaw\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "Prisma $queryRaw で変数が直接埋め込まれています。SQLインジェクション攻撃に対して脆弱です。",
    descriptionEn: "Variables directly embedded in Prisma $queryRaw. Vulnerable to SQL injection attacks.",
    remediationJa: "Prisma.sql タグ付きテンプレートリテラルを使用してください。",
    remediationEn: "Use Prisma.sql tagged template literals.",
  },
  // $executeRaw の危険な使用
  {
    id: "prisma-execute-raw-unsafe",
    pattern: /\$executeRaw\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "Prisma $executeRaw で変数が直接埋め込まれています。SQLインジェクション攻撃に対して脆弱です。",
    descriptionEn: "Variables directly embedded in Prisma $executeRaw. Vulnerable to SQL injection attacks.",
    remediationJa: "Prisma.sql タグ付きテンプレートリテラルを使用してください。",
    remediationEn: "Use Prisma.sql tagged template literals.",
  },
  // Sequelize の危険なクエリ
  {
    id: "sequelize-raw-unsafe",
    pattern: /sequelize\.query\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "Sequelize の生クエリで変数が直接埋め込まれています。",
    descriptionEn: "Variables directly embedded in Sequelize raw query.",
    remediationJa: "replacements オプションを使用してパラメータ化してください。",
    remediationEn: "Use the replacements option for parameterization.",
  },
  // TypeORM の危険なクエリ
  {
    id: "typeorm-raw-unsafe",
    pattern: /\.query\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "HIGH",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "TypeORM の生クエリで変数が直接埋め込まれている可能性があります。",
    descriptionEn: "Variables may be directly embedded in TypeORM raw query.",
    remediationJa: "パラメータバインディングを使用してください。",
    remediationEn: "Use parameter binding.",
  },
  // knex の危険な使用
  {
    id: "knex-raw-unsafe",
    pattern: /knex\.raw\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "Knex の raw クエリで変数が直接埋め込まれています。",
    descriptionEn: "Variables directly embedded in Knex raw query.",
    remediationJa: "knex.raw の第2引数でパラメータを渡してください。",
    remediationEn: "Pass parameters as the second argument to knex.raw.",
  },
  // mysql/mysql2 の危険な使用
  {
    id: "mysql-query-unsafe",
    pattern: /(?:connection|pool)\.query\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "MySQL クエリで変数が直接埋め込まれています。",
    descriptionEn: "Variables directly embedded in MySQL query.",
    remediationJa: "プレースホルダー（?）を使用してパラメータ化してください。",
    remediationEn: "Use placeholders (?) for parameterization.",
  },
  // pg の危険な使用
  {
    id: "pg-query-unsafe",
    pattern: /(?:client|pool)\.query\s*\(\s*[`"'].*?\$\{.*?\}.*?[`"']/g,
    vulnerabilityType: "SQL_INJECTION",
    severity: "CRITICAL",
    cweId: "CWE-89",
    owaspCategory: "A03",
    descriptionJa: "PostgreSQL クエリで変数が直接埋め込まれています。",
    descriptionEn: "Variables directly embedded in PostgreSQL query.",
    remediationJa: "パラメータ化クエリ（$1, $2 など）を使用してください。",
    remediationEn: "Use parameterized queries ($1, $2, etc.).",
  },
];

// ========================================
// メイン検出関数
// ========================================

/**
 * SQLインジェクション脆弱性を検出
 */
export function detectSqlInjection(
  code: string,
  filePath: string,
  language: "ja" | "en" = "ja"
): DetectedVulnerability[] {
  const vulnerabilities: DetectedVulnerability[] = [];
  const lines = code.split("\n");

  for (const pattern of SQL_INJECTION_PATTERNS) {
    // パターンをリセット
    pattern.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.pattern.exec(code)) !== null) {
      // 行番号を計算
      const lineNumber = code.substring(0, match.index).split("\n").length;
      const line = lines[lineNumber - 1] || "";

      // コンテキストチェック
      if (pattern.contextCheck && !pattern.contextCheck(code, match, lineNumber)) {
        continue;
      }

      // コメント内の場合はスキップ
      if (isInComment(line, match[0])) {
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
 * マッチがコメント内かどうかをチェック
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
