/**
 * Pinecone 接続・Embedding・upsert/query テストスクリプト
 * 使用方法: npx tsx scripts/test-pinecone.ts
 */

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

async function main() {
  console.log("=== Pinecone Integration Test ===\n");

  // 1. Pinecone接続テスト
  console.log("1. Testing Pinecone connection...");
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const indexName = process.env.PINECONE_INDEX_NAME || "codehorse";

  const indexDescription = await pinecone.describeIndex(indexName);
  console.log(`   ✅ Connected to index: ${indexName}`);
  console.log(`   Dimension: ${indexDescription.dimension}`);
  console.log(`   Host: ${indexDescription.host}`);
  console.log(`   Status: ${indexDescription.status?.state}\n`);

  // 2. Embedding生成テスト
  console.log("2. Testing Embedding generation...");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const testTexts = [
    "function calculateSum(a: number, b: number): number { return a + b; }",
    "class UserService { async getUser(id: string) { return await db.users.find(id); } }",
    "export interface User { id: string; name: string; email: string; }",
  ];

  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: testTexts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embeddings = embeddingResponse.data.map((d) => d.embedding);
  console.log(`   ✅ Generated ${embeddings.length} embeddings`);
  console.log(`   Embedding dimension: ${embeddings[0].length}\n`);

  // 3. Upsertテスト
  console.log("3. Testing upsert...");
  const index = pinecone.index(indexName);
  const testNamespace = "test-namespace";

  const vectors = embeddings.map((values, i) => ({
    id: `test-vector-${i}`,
    values,
    metadata: {
      filePath: `test/file${i}.ts`,
      content: testTexts[i],
      language: "typescript",
      chunkType: i === 0 ? "function" : i === 1 ? "class" : "interface",
    },
  }));

  await index.namespace(testNamespace).upsert(vectors);
  console.log(`   ✅ Upserted ${vectors.length} vectors to namespace: ${testNamespace}\n`);

  // 少し待機（インデックス更新のため）
  console.log("   Waiting for index to update...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 4. Queryテスト
  console.log("4. Testing query...");
  const queryText = "how to add two numbers";
  const queryEmbedding = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: queryText,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const queryResult = await index.namespace(testNamespace).query({
    vector: queryEmbedding.data[0].embedding,
    topK: 3,
    includeMetadata: true,
  });

  console.log(`   ✅ Query: "${queryText}"`);
  console.log(`   Results:`);
  queryResult.matches?.forEach((match, i) => {
    console.log(`     ${i + 1}. Score: ${match.score?.toFixed(4)} - ${match.metadata?.filePath}`);
    console.log(`        Type: ${match.metadata?.chunkType}`);
  });
  console.log();

  // 5. クリーンアップ
  console.log("5. Cleaning up test data...");
  await index.namespace(testNamespace).deleteAll();
  console.log(`   ✅ Deleted test namespace: ${testNamespace}\n`);

  console.log("=== All tests passed! ===");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
