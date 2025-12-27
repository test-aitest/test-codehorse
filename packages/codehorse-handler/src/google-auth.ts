/**
 * Google Authentication
 * サービスアカウントを使用してGoogle Sheets APIに認証する
 */

import { google } from "googleapis";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// 認証情報の保存場所
const CONFIG_DIR = join(homedir(), ".config", "codehorse-handler");
const CREDENTIALS_FILE = join(CONFIG_DIR, "google-credentials.json");

// Google Sheets APIのスコープ
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

/**
 * Google認証クライアントを取得
 * サービスアカウントの認証情報を使用
 */
export async function getGoogleAuthClient() {
  // 環境変数から認証情報を取得（優先）
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    });
    return auth;
  }

  // 設定ファイルから認証情報を取得
  if (existsSync(CREDENTIALS_FILE)) {
    const credentials = JSON.parse(
      readFileSync(CREDENTIALS_FILE, "utf-8")
    ) as GoogleCredentials;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
      scopes: SCOPES,
    });
    return auth;
  }

  throw new Error(
    `Google認証情報が見つかりません。\n` +
      `以下のいずれかの方法で設定してください:\n` +
      `1. 環境変数 GOOGLE_APPLICATION_CREDENTIALS にサービスアカウントキーのパスを設定\n` +
      `2. ${CREDENTIALS_FILE} にサービスアカウントキーを配置\n` +
      `3. codehorse-handler config set-google-auth <path/to/credentials.json> を実行`
  );
}

/**
 * Google Sheets APIクライアントを取得
 */
export async function getSheetsClient() {
  const auth = await getGoogleAuthClient();
  return google.sheets({ version: "v4", auth });
}

/**
 * 認証情報が設定されているかチェック
 */
export function hasGoogleCredentials(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  return existsSync(CREDENTIALS_FILE);
}

/**
 * 認証情報ファイルのパスを取得
 */
export function getCredentialsFilePath(): string {
  return CREDENTIALS_FILE;
}

/**
 * 設定ディレクトリのパスを取得
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
