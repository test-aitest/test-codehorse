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
export declare function parseTestUpdatesFromClaudeOutput(output: string): TestCaseUpdate[];
/**
 * テストケースのデフォルト値を補完
 */
export declare function normalizeTestCase(testCase: Partial<TestCase> & {
    id: string;
}): TestCase;
/**
 * 新しいテストケースIDを生成
 * 既存のIDの最大値 + 1 を使用
 */
export declare function generateNextTestCaseId(existingTestCases: TestCase[]): string;
//# sourceMappingURL=test-case-parser.d.ts.map