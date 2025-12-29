/**
 * AST チャンキングエンジン テストスクリプト
 * 使用方法: npx tsx scripts/test-ast-chunker.ts
 */

import { chunkTypeScriptFile } from "../../src/lib/indexer/ast-chunker";

// テスト用のTypeScriptコード
const testCode = `
import { useState, useEffect } from "react";
import type { User } from "@/types";

// ユーザー情報を取得する関数
export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }
  return response.json();
}

// 認証状態を管理するカスタムフック
export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser("me")
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
};

// ユーザーサービスクラス
export class UserService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getUser(id: string): Promise<User> {
    const response = await fetch(\`\${this.baseUrl}/users/\${id}\`);
    return response.json();
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const response = await fetch(\`\${this.baseUrl}/users/\${id}\`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async deleteUser(id: string): Promise<void> {
    await fetch(\`\${this.baseUrl}/users/\${id}\`, { method: "DELETE" });
  }
}

// ユーザー型定義
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// 認証状態の型
export type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  token?: string;
};

// 定数設定
export const API_CONFIG = {
  baseUrl: process.env.API_URL || "http://localhost:3000",
  timeout: 5000,
  retries: 3,
};
`;

async function main() {
  console.log("=== AST Chunking Test ===\n");

  const result = chunkTypeScriptFile("test/user-service.ts", testCode);

  console.log(`File: ${result.filePath}`);
  console.log(`Total Lines: ${result.totalLines}`);
  console.log(`Total Chunks: ${result.totalChunks}`);
  console.log("\n--- Chunks ---\n");

  result.chunks.forEach((chunk, index) => {
    console.log(`[${index + 1}] ${chunk.chunkType}: ${chunk.name}`);
    console.log(`    Lines: ${chunk.startLine}-${chunk.endLine}`);
    console.log(`    Exported: ${chunk.exports || false}`);
    if (chunk.signature) {
      console.log(`    Signature: ${chunk.signature}`);
    }
    if (chunk.parentName) {
      console.log(`    Parent: ${chunk.parentName}`);
    }
    console.log(`    Content (first 100 chars): ${chunk.content.slice(0, 100).replace(/\n/g, "\\n")}...`);
    console.log();
  });

  console.log("=== Test Completed ===");
}

main().catch(console.error);
