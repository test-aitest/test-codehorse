/**
 * Google Authentication
 * サービスアカウントを使用してGoogle Sheets APIに認証する
 */
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
export declare function getGoogleAuthClient(): Promise<import("google-auth-library").GoogleAuth<import("google-auth-library/build/src/auth/googleauth").JSONClient>>;
/**
 * Google Sheets APIクライアントを取得
 */
export declare function getSheetsClient(): Promise<import("googleapis").sheets_v4.Sheets>;
/**
 * 認証情報が設定されているかチェック
 */
export declare function hasGoogleCredentials(): boolean;
/**
 * 認証情報ファイルのパスを取得
 */
export declare function getCredentialsFilePath(): string;
/**
 * 設定ディレクトリのパスを取得
 */
export declare function getConfigDir(): string;
//# sourceMappingURL=google-auth.d.ts.map