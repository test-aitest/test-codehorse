/**
 * PR Template Parser
 * PRのdescriptionからLeetCode情報を抽出し、Diffからコードを取得する
 */

import type {
  SupportedLanguage,
  TestCase,
} from "./types";

// LeetCode問題URLのパターン
const LEETCODE_URL_PATTERN =
  /https?:\/\/leetcode\.com\/problems\/([a-z0-9-]+)\/?/i;

// PR descriptionのパターン
const PROBLEM_URL_PATTERN = /Problem\s*URL:\s*(https?:\/\/[^\s]+)/i;
const TEST_CASES_PATTERN = /Test\s*Cases:\s*([\s\S]*?)(?=###|$)/i;

/**
 * PRのdescriptionからLeetCode情報を抽出
 */
export function parsePRDescription(description: string): {
  problemUrl: string | null;
  problemId: string | null;
  testCases: TestCase[];
} {
  // Problem URLを抽出
  const urlMatch = description.match(PROBLEM_URL_PATTERN);
  const problemUrl = urlMatch ? urlMatch[1].trim() : null;

  // Problem IDを抽出
  let problemId: string | null = null;
  if (problemUrl) {
    const idMatch = problemUrl.match(LEETCODE_URL_PATTERN);
    problemId = idMatch ? idMatch[1] : null;
  }

  // Test Casesを抽出
  const testCases: TestCase[] = [];
  const testCasesMatch = description.match(TEST_CASES_PATTERN);

  if (testCasesMatch) {
    const testCasesSection = testCasesMatch[1];

    // Input/Output ペアを抽出
    // より柔軟なパターンで複数行に対応
    const lines = testCasesSection.split("\n");
    let currentInput: string | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.toLowerCase().startsWith("input:")) {
        currentInput = trimmedLine.substring(6).trim();
      } else if (trimmedLine.toLowerCase().startsWith("output:") && currentInput) {
        const output = trimmedLine.substring(7).trim();
        testCases.push({
          input: currentInput,
          expectedOutput: output,
        });
        currentInput = null;
      }
    }
  }

  return { problemUrl, problemId, testCases };
}

/**
 * ファイル拡張子から言語を判定
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

  const extensionMap: Record<string, SupportedLanguage> = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".java": "java",
    ".go": "go",
    ".swift": "swift",
  };

  return extensionMap[ext] || null;
}

/**
 * Problem URLからProblem IDを抽出
 */
export function extractProblemId(url: string): string | null {
  const match = url.match(LEETCODE_URL_PATTERN);
  return match ? match[1] : null;
}

/**
 * PRがLeetCodeテンプレートかどうかを判定
 */
export function isLeetCodePR(description: string): boolean {
  // Problem URLが含まれているか
  const hasUrl = PROBLEM_URL_PATTERN.test(description);

  // Test Casesセクションが含まれているか
  const hasTestCases = TEST_CASES_PATTERN.test(description);

  return hasUrl && hasTestCases;
}

/**
 * テストケースの入力をパースして言語別の形式に変換
 * LeetCode形式の配列表現をそのまま使用
 */
export function parseTestInput(input: string): string {
  // そのまま返す（実行時にヘルパー関数でパース）
  return input.trim();
}

/**
 * 出力を正規化して比較可能な形式に
 */
export function normalizeOutput(output: string): string {
  return output
    .trim()
    .replace(/\s+/g, " ") // 連続する空白を1つに
    .replace(/,\s*/g, ",") // カンマ後の空白を削除
    .replace(/\[\s*/g, "[") // 配列開始後の空白を削除
    .replace(/\s*\]/g, "]"); // 配列終了前の空白を削除
}

/**
 * 出力の比較
 */
export function compareOutputs(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
