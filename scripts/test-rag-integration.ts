/**
 * RAG 統合テストスクリプト（スタンドアロン版）
 * 使用方法: npx tsx scripts/test-rag-integration.ts
 */

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import {
  Project,
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
} from "ts-morph";

dotenv.config();

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface CodeChunk {
  filePath: string;
  language: string;
  chunkType: string;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  signature?: string;
}

// 簡易ASTチャンカー
function chunkCode(filePath: string, content: string): CodeChunk[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true, checkJs: false },
  });
  const sourceFile = project.createSourceFile(filePath, content);
  const chunks: CodeChunk[] = [];
  const language = filePath.endsWith(".ts") ? "typescript" : "javascript";

  // 関数
  sourceFile.getFunctions().forEach((func: FunctionDeclaration) => {
    const name = func.getName();
    if (name) {
      chunks.push({
        filePath,
        language,
        chunkType: "function",
        name,
        content: func.getText(),
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
        signature: `function ${name}`,
      });
    }
  });

  // クラス
  sourceFile.getClasses().forEach((cls: ClassDeclaration) => {
    const name = cls.getName() || "AnonymousClass";
    chunks.push({
      filePath,
      language,
      chunkType: "class",
      name,
      content: cls.getText(),
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
      signature: `class ${name}`,
    });
  });

  // インターフェース
  sourceFile.getInterfaces().forEach((iface: InterfaceDeclaration) => {
    chunks.push({
      filePath,
      language,
      chunkType: "interface",
      name: iface.getName(),
      content: iface.getText(),
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
    });
  });

  return chunks;
}

// テスト用コード
const authCode = `
export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ token: string }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return response.json();
}

export function validateToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return !!decoded;
  } catch {
    return false;
  }
}

export class AuthService {
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async login(credentials: { email: string; password: string }) {
    return authenticateUser(credentials.email, credentials.password);
  }

  async refreshToken(refreshToken: string): Promise<string> {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
    const data = await response.json();
    return data.accessToken;
  }
}
`;

const userCode = `
export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

export async function getUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}

export async function updateUserProfile(
  id: string,
  updates: Partial<User>
): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return response.json();
}

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async create(data: Omit<User, "id">): Promise<User> {
    return prisma.user.create({ data });
  }
}
`;

async function main() {
  console.log("=== RAG Integration Test ===\n");

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const indexName = process.env.PINECONE_INDEX_NAME || "codehorse";
  const index = pinecone.index(indexName);
  const testNamespace = "rag-test";

  try {
    // 1. ASTチャンキング
    console.log("1. Chunking source files...");
    const authChunks = chunkCode("src/lib/auth.ts", authCode);
    const userChunks = chunkCode("src/lib/user.ts", userCode);
    const allChunks = [...authChunks, ...userChunks];
    console.log(`   ✅ Created ${allChunks.length} chunks`);
    allChunks.forEach((c) => console.log(`      - ${c.chunkType}: ${c.name}`));
    console.log();

    // 2. Embedding生成
    console.log("2. Generating embeddings...");
    const texts = allChunks.map(
      (chunk) =>
        `File: ${chunk.filePath}\nLanguage: ${chunk.language}\nType: ${chunk.chunkType}\nName: ${chunk.name}\n\nCode:\n${chunk.content}`
    );

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embeddings = embeddingResponse.data.map((d) => d.embedding);
    console.log(`   ✅ Generated ${embeddings.length} embeddings\n`);

    // 3. Pineconeにアップサート
    console.log("3. Upserting to Pinecone...");
    const vectors = allChunks.map((chunk, i) => ({
      id: `test-${chunk.filePath.replace(/\//g, "-")}-${chunk.name}-${i}`,
      values: embeddings[i],
      metadata: {
        filePath: chunk.filePath,
        language: chunk.language,
        chunkType: chunk.chunkType,
        name: chunk.name,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        signature: chunk.signature || "",
      },
    }));

    await index.namespace(testNamespace).upsert(vectors);
    console.log(`   ✅ Upserted ${vectors.length} vectors\n`);

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 4. RAG検索テスト
    console.log("4. Testing RAG search...");
    const testQueries = [
      "how to authenticate a user with email and password",
      "user login functionality",
      "find user by email address",
    ];

    for (const query of testQueries) {
      console.log(`\n   Query: "${query}"`);

      const queryEmbedding = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: query,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const results = await index.namespace(testNamespace).query({
        vector: queryEmbedding.data[0].embedding,
        topK: 3,
        includeMetadata: true,
      });

      console.log("   Results:");
      results.matches?.forEach((match, i) => {
        const meta = match.metadata as Record<string, unknown>;
        console.log(
          `     ${i + 1}. ${meta.name} (${meta.chunkType}) - Score: ${(match.score || 0).toFixed(3)}`
        );
        console.log(`        File: ${meta.filePath}`);
      });
    }

    // 5. コンテキスト構築テスト
    console.log("\n\n5. Building context for AI review...");
    const contextQuery = "user authentication";
    const contextEmbedding = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: contextQuery,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const contextResults = await index.namespace(testNamespace).query({
      vector: contextEmbedding.data[0].embedding,
      topK: 5,
      includeMetadata: true,
    });

    console.log("\n   Context for AI Review:");
    console.log("   ## Related Code Context\n");
    contextResults.matches?.forEach((match) => {
      const meta = match.metadata as Record<string, unknown>;
      const score = ((match.score || 0) * 100).toFixed(0);
      console.log(
        `   - **${meta.name}** (${meta.chunkType}) in \`${meta.filePath}\` - ${score}% relevance`
      );
    });

    // 6. クリーンアップ
    console.log("\n\n6. Cleaning up...");
    await index.namespace(testNamespace).deleteAll();
    console.log(`   ✅ Deleted test namespace: ${testNamespace}\n`);

    console.log("=== All RAG Integration Tests Passed! ===");
  } catch (error) {
    console.error("Test failed:", error);
    try {
      await index.namespace(testNamespace).deleteAll();
    } catch {}
    process.exit(1);
  }
}

main();
