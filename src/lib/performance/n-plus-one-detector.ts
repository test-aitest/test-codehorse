/**
 * Phase 8: N+1 Query Detector
 *
 * ループ内でのデータベースクエリを検出
 */

import type { DetectedPerformanceIssue } from "./types";

// ========================================
// クエリパターン定義
// ========================================

/** Prismaのクエリメソッド */
const PRISMA_QUERY_METHODS = [
  "findUnique",
  "findFirst",
  "findMany",
  "create",
  "update",
  "delete",
  "upsert",
  "count",
  "aggregate",
];

/** 一般的なORMクエリパターン */
const ORM_QUERY_PATTERNS = [
  // Prisma
  /\.\s*(findUnique|findFirst|findMany|create|update|delete|upsert|count|aggregate)\s*\(/,
  // TypeORM
  /\.\s*(find|findOne|findOneBy|save|remove|delete|update)\s*\(/,
  // Sequelize
  /\.\s*(findAll|findOne|findByPk|create|update|destroy)\s*\(/,
  // Mongoose
  /\.\s*(find|findOne|findById|save|updateOne|deleteOne)\s*\(/,
  // Generic SQL
  /\.\s*(query|execute|raw)\s*\(/,
  // fetch/axios (API calls)
  /await\s+fetch\s*\(/,
  /await\s+axios\s*\.\s*(get|post|put|delete|patch)\s*\(/,
];

/** ループ構文パターン */
const LOOP_PATTERNS = [
  { regex: /for\s*\(/, type: "for" as const },
  { regex: /\.forEach\s*\(/, type: "forEach" as const },
  { regex: /\.map\s*\(/, type: "map" as const },
  { regex: /while\s*\(/, type: "while" as const },
  { regex: /for\s+.*\s+of\s+/, type: "for-of" as const },
  { regex: /for\s+.*\s+in\s+/, type: "for-in" as const },
];

// ========================================
// メイン検出関数
// ========================================

/**
 * N+1クエリパターンを検出
 */
export function detectNPlusOneQueries(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // ループの開始・終了位置を追跡
  const loopStack: Array<{
    type: string;
    startLine: number;
    braceCount: number;
  }> = [];

  // 各行を解析
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // ループの開始を検出
    for (const pattern of LOOP_PATTERNS) {
      if (pattern.regex.test(line)) {
        loopStack.push({
          type: pattern.type,
          startLine: lineNumber,
          braceCount: countBraces(line),
        });
        break;
      }
    }

    // ブレース数を更新
    if (loopStack.length > 0) {
      const currentLoop = loopStack[loopStack.length - 1];
      currentLoop.braceCount += countBraces(line);

      // ループ終了を検出
      if (currentLoop.braceCount <= 0 && i > 0) {
        loopStack.pop();
      }
    }

    // ループ内でのクエリを検出
    if (loopStack.length > 0) {
      for (const pattern of ORM_QUERY_PATTERNS) {
        if (pattern.test(line)) {
          const currentLoop = loopStack[loopStack.length - 1];
          const queryMethod = extractQueryMethod(line);

          issues.push({
            issueType: "N_PLUS_ONE_QUERY",
            severity: "WARNING",
            filePath,
            lineNumber,
            description: `ループ内でデータベースクエリ（${queryMethod}）が実行されています。これはN+1問題を引き起こす可能性があります。`,
            suggestion: generateNPlusOneSuggestion(queryMethod),
            codeSnippet: line.trim(),
            estimatedImpact: "HIGH",
            patternId: "n-plus-one-loop-query",
            metadata: {
              loopType: currentLoop.type,
              loopStartLine: currentLoop.startLine,
              queryMethod,
            },
          });
          break;
        }
      }
    }
  }

  return issues;
}

/**
 * Prisma特有のN+1パターンを検出
 */
export function detectPrismaNPlusOne(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // include/selectなしの関連データアクセスを検出
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // findMany後に関連データにアクセスするパターン
    if (
      /\.findMany\s*\(\s*\)/.test(line) ||
      /\.findMany\s*\(\s*\{\s*\}\s*\)/.test(line)
    ) {
      // 次の数行で関連データアクセスがないか確認
      const nextLines = lines.slice(i + 1, i + 10).join("\n");
      if (/\.map\s*\(.+\.\w+\./.test(nextLines)) {
        issues.push({
          issueType: "N_PLUS_ONE_QUERY",
          severity: "WARNING",
          filePath,
          lineNumber,
          description:
            "findManyでincludeを使用せずに関連データにアクセスしている可能性があります。",
          suggestion:
            "関連データを取得する場合は、includeオプションを使用してください。\n例: prisma.user.findMany({ include: { posts: true } })",
          codeSnippet: line.trim(),
          estimatedImpact: "HIGH",
          patternId: "prisma-missing-include",
        });
      }
    }
  }

  return issues;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * ブレースの数をカウント（開き - 閉じ）
 */
function countBraces(line: string): number {
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  return open - close;
}

/**
 * クエリメソッドを抽出
 */
function extractQueryMethod(line: string): string {
  // Prismaメソッド
  for (const method of PRISMA_QUERY_METHODS) {
    if (line.includes(`.${method}(`)) {
      return method;
    }
  }

  // fetch/axios
  if (line.includes("fetch(")) return "fetch";
  if (/axios\s*\.\s*(get|post|put|delete|patch)/.test(line)) {
    const match = line.match(/axios\s*\.\s*(get|post|put|delete|patch)/);
    return match ? `axios.${match[1]}` : "axios";
  }

  return "query";
}

/**
 * N+1問題の改善提案を生成
 */
function generateNPlusOneSuggestion(queryMethod: string): string {
  const suggestions: string[] = [];

  suggestions.push("N+1問題を解決するには:");
  suggestions.push("");

  // Prismaの場合
  if (PRISMA_QUERY_METHODS.includes(queryMethod)) {
    suggestions.push("1. ループの外で一括取得する:");
    suggestions.push("   ```typescript");
    suggestions.push("   const items = await prisma.model.findMany({");
    suggestions.push("     where: { id: { in: ids } }");
    suggestions.push("   });");
    suggestions.push("   ```");
    suggestions.push("");
    suggestions.push("2. includeを使用して関連データを同時に取得:");
    suggestions.push("   ```typescript");
    suggestions.push("   const items = await prisma.model.findMany({");
    suggestions.push("     include: { relation: true }");
    suggestions.push("   });");
    suggestions.push("   ```");
  } else if (queryMethod.startsWith("axios") || queryMethod === "fetch") {
    suggestions.push("1. Promise.allを使用して並列リクエスト:");
    suggestions.push("   ```typescript");
    suggestions.push("   const results = await Promise.all(");
    suggestions.push("     ids.map(id => fetch(`/api/items/${id}`)");
    suggestions.push("   );");
    suggestions.push("   ```");
    suggestions.push("");
    suggestions.push("2. バッチAPIエンドポイントを使用:");
    suggestions.push("   ```typescript");
    suggestions.push('   const results = await fetch("/api/items/batch", {');
    suggestions.push("     method: 'POST',");
    suggestions.push("     body: JSON.stringify({ ids })");
    suggestions.push("   });");
    suggestions.push("   ```");
  } else {
    suggestions.push("1. ループの外でデータを一括取得する");
    suggestions.push("2. 事前にデータをMapやオブジェクトにキャッシュする");
    suggestions.push("3. バッチ処理APIを使用する");
  }

  return suggestions.join("\n");
}

/**
 * N+1検出が有効かチェック
 */
export function isNPlusOneDetectionEnabled(): boolean {
  return process.env.DETECT_N_PLUS_ONE !== "false";
}
