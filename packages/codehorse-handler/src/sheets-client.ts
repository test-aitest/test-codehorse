/**
 * Google Sheets Client
 * テストケースの取得・更新を行うクライアント
 */

import { getSheetsClient } from "./google-auth.js";
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

// テストケースシートのカラム定義
const COLUMNS = {
  ID: 0,
  NAME: 1,
  DESCRIPTION: 2,
  EXPECTED_RESULT: 3,
  STATUS: 4,
  PRIORITY: 5,
  RELATED_CODE: 6,
};

// ヘッダーは1行目（将来の使用のために定義を保持）
// const HEADER_ROW = 1;

/**
 * シート名からシートIDを取得
 */
async function getSheetIdByName(
  spreadsheetId: string,
  sheetName: string
): Promise<number | null> {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });

  const sheet = response.data.sheets?.find(
    (s) => s.properties?.title === sheetName
  );

  return sheet?.properties?.sheetId ?? null;
}

/**
 * テストケースを取得
 */
export async function fetchTestCases(
  sheetsInfo: SheetsInfo,
  sheetName: string
): Promise<TestCase[]> {
  const sheets = await getSheetsClient();

  // シートの全データを取得
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsInfo.spreadsheetId,
    range: `${sheetName}!A:G`,
  });

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    return []; // ヘッダーのみまたはデータなし
  }

  // ヘッダーをスキップしてデータを変換
  const testCases: TestCase[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[COLUMNS.ID]) continue; // IDがない行はスキップ

    testCases.push({
      id: row[COLUMNS.ID] || "",
      name: row[COLUMNS.NAME] || "",
      description: row[COLUMNS.DESCRIPTION] || "",
      expectedResult: row[COLUMNS.EXPECTED_RESULT] || "",
      status: row[COLUMNS.STATUS] || "Pending",
      priority: row[COLUMNS.PRIORITY] || "Medium",
      relatedCode: row[COLUMNS.RELATED_CODE] || undefined,
    });
  }

  return testCases;
}

/**
 * テストケースを追加
 */
export async function appendTestCases(
  sheetsInfo: SheetsInfo,
  sheetName: string,
  testCases: TestCase[]
): Promise<void> {
  if (testCases.length === 0) return;

  const sheets = await getSheetsClient();

  const values = testCases.map((tc) => [
    tc.id,
    tc.name,
    tc.description,
    tc.expectedResult,
    tc.status,
    tc.priority,
    tc.relatedCode || "",
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetsInfo.spreadsheetId,
    range: `${sheetName}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });

  console.log(`[Sheets] Added ${testCases.length} test cases`);
}

/**
 * テストケースを更新
 */
export async function updateTestCase(
  sheetsInfo: SheetsInfo,
  sheetName: string,
  testCase: TestCase
): Promise<boolean> {
  const sheets = await getSheetsClient();

  // 既存のテストケースを検索
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsInfo.spreadsheetId,
    range: `${sheetName}!A:A`,
  });

  const ids = response.data.values?.flat() || [];
  const rowIndex = ids.findIndex((id) => id === testCase.id);

  if (rowIndex === -1) {
    console.log(`[Sheets] Test case ${testCase.id} not found, adding instead`);
    await appendTestCases(sheetsInfo, sheetName, [testCase]);
    return true;
  }

  // 行番号（1-indexed）
  const rowNumber = rowIndex + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetsInfo.spreadsheetId,
    range: `${sheetName}!A${rowNumber}:G${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          testCase.id,
          testCase.name,
          testCase.description,
          testCase.expectedResult,
          testCase.status,
          testCase.priority,
          testCase.relatedCode || "",
        ],
      ],
    },
  });

  console.log(`[Sheets] Updated test case ${testCase.id} at row ${rowNumber}`);
  return true;
}

/**
 * テストケースを削除
 */
export async function deleteTestCase(
  sheetsInfo: SheetsInfo,
  sheetName: string,
  testCaseId: string
): Promise<boolean> {
  const sheets = await getSheetsClient();

  // シートIDを取得
  const sheetId = await getSheetIdByName(sheetsInfo.spreadsheetId, sheetName);
  if (sheetId === null) {
    console.log(`[Sheets] Sheet ${sheetName} not found`);
    return false;
  }

  // 既存のテストケースを検索
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsInfo.spreadsheetId,
    range: `${sheetName}!A:A`,
  });

  const ids = response.data.values?.flat() || [];
  const rowIndex = ids.findIndex((id) => id === testCaseId);

  if (rowIndex === -1) {
    console.log(`[Sheets] Test case ${testCaseId} not found`);
    return false;
  }

  // 行を削除（batchUpdateを使用）
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetsInfo.spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });

  console.log(`[Sheets] Deleted test case ${testCaseId}`);
  return true;
}

/**
 * テストケース更新をバッチ適用
 */
export async function applyTestCaseUpdates(
  sheetsInfo: SheetsInfo,
  sheetName: string,
  updates: TestCaseUpdate[]
): Promise<{ added: number; updated: number; deleted: number }> {
  const result = { added: 0, updated: 0, deleted: 0 };

  const toAdd: TestCase[] = [];

  for (const update of updates) {
    switch (update.action) {
      case "add":
        toAdd.push(update.testCase);
        result.added++;
        break;
      case "update":
        await updateTestCase(sheetsInfo, sheetName, update.testCase);
        result.updated++;
        break;
      case "delete":
        await deleteTestCase(sheetsInfo, sheetName, update.testCase.id);
        result.deleted++;
        break;
    }
  }

  // 追加は一括で行う
  if (toAdd.length > 0) {
    await appendTestCases(sheetsInfo, sheetName, toAdd);
  }

  console.log(
    `[Sheets] Applied updates: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
  );

  return result;
}
