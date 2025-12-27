/**
 * Google Sheets Client
 * テストケースの取得・更新を行うクライアント
 */
import type { SheetsInfo } from "./sheets-parser.js";
export interface TestCase {
    id: string;
    name: string;
    description: string;
    expectedResult: string;
    status: "Pending" | "Pass" | "Fail" | "Blocked" | string;
    priority: "High" | "Medium" | "Low" | string;
    relatedCode?: string;
}
export interface TestCaseUpdate {
    action: "add" | "update" | "delete";
    testCase: TestCase;
}
/**
 * テストケースを取得
 */
export declare function fetchTestCases(sheetsInfo: SheetsInfo, sheetName: string): Promise<TestCase[]>;
/**
 * テストケースを追加
 */
export declare function appendTestCases(sheetsInfo: SheetsInfo, sheetName: string, testCases: TestCase[]): Promise<void>;
/**
 * テストケースを更新
 */
export declare function updateTestCase(sheetsInfo: SheetsInfo, sheetName: string, testCase: TestCase): Promise<boolean>;
/**
 * テストケースを削除
 */
export declare function deleteTestCase(sheetsInfo: SheetsInfo, sheetName: string, testCaseId: string): Promise<boolean>;
/**
 * テストケース更新をバッチ適用
 */
export declare function applyTestCaseUpdates(sheetsInfo: SheetsInfo, sheetName: string, updates: TestCaseUpdate[]): Promise<{
    added: number;
    updated: number;
    deleted: number;
}>;
//# sourceMappingURL=sheets-client.d.ts.map