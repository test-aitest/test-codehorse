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
export function parseGoogleSheetsUrl(url: string): SheetsInfo | null {
  if (!url) return null;

  // Google Sheets URLの正規表現パターン
  const sheetsPattern =
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(\/edit)?(\?.*)?(\#gid=(\d+))?/;

  const match = url.match(sheetsPattern);
  if (!match) return null;

  const spreadsheetId = match[1];
  const sheetId = match[5] ? parseInt(match[5], 10) : undefined;

  return {
    spreadsheetId,
    sheetId,
    url,
  };
}

/**
 * PRの説明文からGoogle Sheets URLを抽出
 * 以下のパターンを検索:
 * 1. 明示的なマーカー: <!-- codehorse:test-design:URL -->
 * 2. テスト設計書セクション: ## テスト設計書\nURL
 * 3. シンプルなGoogle Sheets URL
 */
export function extractSheetsUrlFromPRDescription(
  description: string
): string | null {
  if (!description) return null;

  // パターン1: 明示的なマーカー
  const markerPattern =
    /<!--\s*codehorse:test-design:\s*(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s>]+)\s*-->/i;
  const markerMatch = description.match(markerPattern);
  if (markerMatch) {
    return markerMatch[1];
  }

  // パターン2: テスト設計書セクション
  const sectionPattern =
    /##\s*テスト設計書\s*\n+\s*(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s\n]+)/i;
  const sectionMatch = description.match(sectionPattern);
  if (sectionMatch) {
    return sectionMatch[1];
  }

  // パターン2b: Test Design Document セクション（英語）
  const sectionPatternEn =
    /##\s*Test Design Document\s*\n+\s*(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s\n]+)/i;
  const sectionMatchEn = description.match(sectionPatternEn);
  if (sectionMatchEn) {
    return sectionMatchEn[1];
  }

  // パターン3: シンプルなGoogle Sheets URL（最初に見つかったもの）
  const simplePattern =
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+(?:\/edit)?(?:\?[^\s]*)?(?:#gid=\d+)?/;
  const simpleMatch = description.match(simplePattern);
  if (simpleMatch) {
    return simpleMatch[0];
  }

  return null;
}

/**
 * Google Sheets URLの形式を検証
 */
export function isValidGoogleSheetsUrl(url: string): boolean {
  return parseGoogleSheetsUrl(url) !== null;
}
