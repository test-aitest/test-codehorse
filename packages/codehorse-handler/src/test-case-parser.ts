/**
 * Test Case Parser
 * Claude Codeの出力からテストケース更新情報を抽出する
 */

import type { TestCase, TestCaseUpdate } from "./sheets-client.js";

/**
 * Claude Codeの出力からテストケース更新JSONを抽出
 *
 * 期待するフォーマット:
 * ```json:test-updates
 * [
 *   {
 *     "action": "add" | "update" | "delete",
 *     "testCase": {
 *       "id": "TC00X",
 *       "name": "テスト名",
 *       "description": "説明",
 *       "expectedResult": "期待結果",
 *       "status": "Pending",
 *       "priority": "Medium",
 *       "relatedCode": "path/to/file.ts"
 *     }
 *   }
 * ]
 * ```
 */
export function parseTestUpdatesFromClaudeOutput(
  output: string
): TestCaseUpdate[] {
  if (!output) return [];

  // パターン1: ```json:test-updates ... ``` ブロック
  const jsonBlockPattern = /```json:test-updates\s*([\s\S]*?)```/g;
  let match;
  const updates: TestCaseUpdate[] = [];

  while ((match = jsonBlockPattern.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isValidTestCaseUpdate(item)) {
            updates.push(item);
          }
        }
      }
    } catch (e) {
      console.log(
        `[TestCaseParser] Failed to parse JSON block: ${(e as Error).message}`
      );
    }
  }

  if (updates.length > 0) {
    return updates;
  }

  // パターン2: 通常のJSONブロックで test-updates を含むもの
  const genericJsonPattern = /```json\s*([\s\S]*?)```/g;

  while ((match = genericJsonPattern.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        // 配列の最初の要素がテストケース更新の形式かチェック
        if (isValidTestCaseUpdate(parsed[0])) {
          for (const item of parsed) {
            if (isValidTestCaseUpdate(item)) {
              updates.push(item);
            }
          }
          break; // 最初に見つかった有効なJSONブロックのみ使用
        }
      }
    } catch {
      // 無視（他のJSONブロックかもしれない）
    }
  }

  if (updates.length > 0) {
    return updates;
  }

  // パターン3: バッククォートなしのJSON配列
  // Claude Codeがバッククォートなしで出力した場合に対応
  // 入れ子のオブジェクトを正しく処理するため、開始位置を見つけて段階的に解析
  const jsonStartPattern = /\[\s*\{\s*"action"\s*:\s*"(?:add|update|delete)"/g;

  while ((match = jsonStartPattern.exec(output)) !== null) {
    const startIndex = match.index;
    // 開始位置から段階的に長さを増やしながらJSON.parseを試みる
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < output.length; i++) {
      const char = output[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "[" || char === "{") {
        bracketCount++;
      } else if (char === "]" || char === "}") {
        bracketCount--;
        if (bracketCount === 0) {
          // 配列が閉じた
          const jsonCandidate = output.slice(startIndex, i + 1);
          try {
            const parsed = JSON.parse(jsonCandidate);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (isValidTestCaseUpdate(parsed[0])) {
                for (const item of parsed) {
                  if (isValidTestCaseUpdate(item)) {
                    updates.push(item);
                  }
                }
                return updates; // 見つかったらすぐに返す
              }
            }
          } catch {
            // パースに失敗した場合は次のマッチを試す
          }
          break; // このマッチは終了、次を探す
        }
      }
    }
  }

  return updates;
}

/**
 * オブジェクトがTestCaseUpdateの形式かチェック
 */
function isValidTestCaseUpdate(obj: unknown): obj is TestCaseUpdate {
  if (typeof obj !== "object" || obj === null) return false;

  const update = obj as Record<string, unknown>;

  // action のチェック
  if (!["add", "update", "delete"].includes(update.action as string)) {
    return false;
  }

  // testCase のチェック
  const testCase = update.testCase as Record<string, unknown> | undefined;
  if (typeof testCase !== "object" || testCase === null) {
    return false;
  }

  // 必須フィールドのチェック
  if (typeof testCase.id !== "string" || !testCase.id) {
    return false;
  }

  // delete の場合は id のみで OK
  if (update.action === "delete") {
    return true;
  }

  // update の場合は id のみで OK（部分更新を許可）
  if (update.action === "update") {
    return true;
  }

  // add の場合は name も必須
  if (typeof testCase.name !== "string" || !testCase.name) {
    return false;
  }

  return true;
}

/**
 * テストケースのデフォルト値を補完
 */
export function normalizeTestCase(
  testCase: Partial<TestCase> & { id: string }
): TestCase {
  return {
    id: testCase.id,
    name: testCase.name || "",
    description: testCase.description || "",
    expectedResult: testCase.expectedResult || "",
    status: testCase.status || "Pending",
    priority: testCase.priority || "Medium",
    relatedCode: testCase.relatedCode,
  };
}

/**
 * 新しいテストケースIDを生成
 * 既存のIDの最大値 + 1 を使用
 */
export function generateNextTestCaseId(existingTestCases: TestCase[]): string {
  const pattern = /^TC(\d+)$/;
  let maxNum = 0;

  for (const tc of existingTestCases) {
    const match = tc.id.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `TC${nextNum.toString().padStart(3, "0")}`;
}
