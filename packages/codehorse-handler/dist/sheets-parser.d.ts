/**
 * Google Sheets URL Parser
 * PRの説明文からGoogle Sheets URLを抽出し、スプレッドシート情報をパースする
 */
export interface SheetsInfo {
    spreadsheetId: string;
    sheetId?: number;
    url: string;
}
/**
 * Google Sheets URLからスプレッドシートIDを抽出
 * 対応するURL形式:
 * - https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
 * - https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit#gid={SHEET_ID}
 * - https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}
 */
export declare function parseGoogleSheetsUrl(url: string): SheetsInfo | null;
/**
 * PRの説明文からGoogle Sheets URLを抽出
 * 以下のパターンを検索:
 * 1. 明示的なマーカー: <!-- codehorse:test-design:URL -->
 * 2. テスト設計書セクション: ## テスト設計書\nURL
 * 3. シンプルなGoogle Sheets URL
 */
export declare function extractSheetsUrlFromPRDescription(description: string): string | null;
/**
 * Google Sheets URLの形式を検証
 */
export declare function isValidGoogleSheetsUrl(url: string): boolean;
//# sourceMappingURL=sheets-parser.d.ts.map