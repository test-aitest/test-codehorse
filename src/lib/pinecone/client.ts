import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";
import type { VectorRecord, CodeChunkMetadata } from "./types";
import { getNamespace } from "./types";

// Pinecone クライアント（遅延初期化）
let pinecone: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error("PINECONE_API_KEY is not configured");
    }
    pinecone = new Pinecone({ apiKey });
  }
  return pinecone;
}

function getIndexName(): string {
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME is not configured");
  }
  return indexName;
}

/**
 * Pinecone インデックスを取得
 */
export function getIndex() {
  return getPinecone().index(getIndexName());
}

/**
 * ベクトルをアップサート（バッチ対応）
 */
export async function upsertVectors(
  owner: string,
  repo: string,
  vectors: VectorRecord[]
): Promise<void> {
  if (vectors.length === 0) return;

  const index = getIndex();
  const namespace = getNamespace(owner, repo);

  // Pineconeは最大100件ずつアップサート
  const BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE).map((v) => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata as unknown as RecordMetadata,
    }));
    await index.namespace(namespace).upsert(batch);
    console.log(
      `[Pinecone] Upserted ${i + batch.length}/${vectors.length} vectors to ${namespace}`
    );
  }
}

/**
 * 類似ベクトルを検索
 */
export async function queryVectors(
  owner: string,
  repo: string,
  queryVector: number[],
  topK: number = 10,
  filter?: Partial<CodeChunkMetadata>
): Promise<Array<{ id: string; score: number; metadata: CodeChunkMetadata }>> {
  const index = getIndex();
  const namespace = getNamespace(owner, repo);

  const result = await index.namespace(namespace).query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter: filter as Record<string, unknown>,
  });

  return (result.matches || []).map((match) => ({
    id: match.id,
    score: match.score || 0,
    metadata: match.metadata as unknown as CodeChunkMetadata,
  }));
}

/**
 * Namespace内の全ベクトルを削除（リポジトリ再インデックス用）
 */
export async function deleteNamespace(owner: string, repo: string): Promise<void> {
  const index = getIndex();
  const namespace = getNamespace(owner, repo);

  await index.namespace(namespace).deleteAll();
  console.log(`[Pinecone] Deleted all vectors in namespace: ${namespace}`);
}

/**
 * 特定ファイルのベクトルを削除（増分更新用）
 */
export async function deleteByFilePath(
  owner: string,
  repo: string,
  filePath: string
): Promise<void> {
  const index = getIndex();
  const namespace = getNamespace(owner, repo);

  // メタデータフィルターで削除
  await index.namespace(namespace).deleteMany({
    filePath: { $eq: filePath },
  });
  console.log(`[Pinecone] Deleted vectors for file: ${filePath}`);
}

/**
 * Namespace の統計情報を取得
 */
export async function getNamespaceStats(
  owner: string,
  repo: string
): Promise<{ vectorCount: number }> {
  const index = getIndex();
  const namespace = getNamespace(owner, repo);

  const stats = await index.describeIndexStats();
  const namespaceStats = stats.namespaces?.[namespace];

  return {
    vectorCount: namespaceStats?.recordCount || 0,
  };
}
