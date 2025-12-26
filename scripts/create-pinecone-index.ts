/**
 * Pinecone インデックス作成スクリプト
 * 使用方法: npx tsx scripts/create-pinecone-index.ts
 */

import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME || "codehorse";

  if (!apiKey) {
    console.error("Error: PINECONE_API_KEY is not set");
    process.exit(1);
  }

  console.log(`Creating Pinecone index: ${indexName}`);

  const pinecone = new Pinecone({ apiKey });

  // 既存のインデックスを確認
  const indexes = await pinecone.listIndexes();
  const existingIndex = indexes.indexes?.find((idx) => idx.name === indexName);

  if (existingIndex) {
    console.log(`Index "${indexName}" already exists`);
    console.log("Index details:", existingIndex);
    return;
  }

  // インデックスを作成
  await pinecone.createIndex({
    name: indexName,
    dimension: 1536, // text-embedding-3-small
    metric: "cosine",
    spec: {
      serverless: {
        cloud: "aws",
        region: "us-east-1",
      },
    },
  });

  console.log(`Index "${indexName}" created successfully!`);

  // インデックスの準備を待つ
  console.log("Waiting for index to be ready...");
  let ready = false;
  while (!ready) {
    const description = await pinecone.describeIndex(indexName);
    if (description.status?.ready) {
      ready = true;
      console.log("Index is ready!");
      console.log("Index details:", description);
    } else {
      console.log("Index status:", description.status?.state);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch(console.error);
