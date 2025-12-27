"use strict";
/**
 * Google Authentication
 * サービスアカウントを使用してGoogle Sheets APIに認証する
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleAuthClient = getGoogleAuthClient;
exports.getSheetsClient = getSheetsClient;
exports.hasGoogleCredentials = hasGoogleCredentials;
exports.getCredentialsFilePath = getCredentialsFilePath;
exports.getConfigDir = getConfigDir;
const googleapis_1 = require("googleapis");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
// 認証情報の保存場所
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), ".config", "codehorse-handler");
const CREDENTIALS_FILE = (0, path_1.join)(CONFIG_DIR, "google-credentials.json");
// Google Sheets APIのスコープ
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
/**
 * Google認証クライアントを取得
 * サービスアカウントの認証情報を使用
 */
async function getGoogleAuthClient() {
    // 環境変数から認証情報を取得（優先）
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const auth = new googleapis_1.google.auth.GoogleAuth({
            keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: SCOPES,
        });
        return auth;
    }
    // 設定ファイルから認証情報を取得
    if ((0, fs_1.existsSync)(CREDENTIALS_FILE)) {
        const credentials = JSON.parse((0, fs_1.readFileSync)(CREDENTIALS_FILE, "utf-8"));
        const auth = new googleapis_1.google.auth.GoogleAuth({
            credentials: {
                client_email: credentials.client_email,
                private_key: credentials.private_key,
            },
            scopes: SCOPES,
        });
        return auth;
    }
    throw new Error(`Google認証情報が見つかりません。\n` +
        `以下のいずれかの方法で設定してください:\n` +
        `1. 環境変数 GOOGLE_APPLICATION_CREDENTIALS にサービスアカウントキーのパスを設定\n` +
        `2. ${CREDENTIALS_FILE} にサービスアカウントキーを配置\n` +
        `3. codehorse-handler config set-google-auth <path/to/credentials.json> を実行`);
}
/**
 * Google Sheets APIクライアントを取得
 */
async function getSheetsClient() {
    const auth = await getGoogleAuthClient();
    return googleapis_1.google.sheets({ version: "v4", auth });
}
/**
 * 認証情報が設定されているかチェック
 */
function hasGoogleCredentials() {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return (0, fs_1.existsSync)(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    }
    return (0, fs_1.existsSync)(CREDENTIALS_FILE);
}
/**
 * 認証情報ファイルのパスを取得
 */
function getCredentialsFilePath() {
    return CREDENTIALS_FILE;
}
/**
 * 設定ディレクトリのパスを取得
 */
function getConfigDir() {
    return CONFIG_DIR;
}
//# sourceMappingURL=google-auth.js.map