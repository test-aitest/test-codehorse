import { Pinecone, type RecordMetadata } from "@pinecone-database/pinecone";
import type {
  VectorRecord,
  CodeChunkMetadata,
  RuleVectorRecord,
  LearningRuleMetadata,
  RuleSearchResult,
} from "./types";
import { getNamespace, getRulesNamespace } from "./types";

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

  try {
    await index.namespace(namespace).deleteAll();
    console.log(`[Pinecone] Deleted all vectors in namespace: ${namespace}`);
  } catch (error) {
    // Namespace doesn't exist yet (404 error) - this is fine for new repositories
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Namespace ${namespace} doesn't exist yet, skipping delete`);
      return;
    }
    throw error;
  }
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

  try {
    // メタデータフィルターで削除
    await index.namespace(namespace).deleteMany({
      filePath: { $eq: filePath },
    });
    console.log(`[Pinecone] Deleted vectors for file: ${filePath}`);
  } catch (error) {
    // Namespace doesn't exist yet (404 error) - this is fine for new files
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Namespace doesn't exist yet, skipping delete for: ${filePath}`);
      return;
    }
    throw error;
  }
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

// ========================================
// Learning Rules 操作
// ========================================

/**
 * ルールベクトルをアップサート
 */
export async function upsertRuleVectors(
  installationId: number,
  vectors: RuleVectorRecord[]
): Promise<void> {
  if (vectors.length === 0) return;

  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  const BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE).map((v) => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata as unknown as RecordMetadata,
    }));
    await index.namespace(namespace).upsert(batch);
    console.log(
      `[Pinecone] Upserted ${i + batch.length}/${vectors.length} rule vectors to ${namespace}`
    );
  }
}

/**
 * 関連するルールを検索
 */
export async function queryRules(
  installationId: number,
  queryVector: number[],
  options: {
    topK?: number;
    language?: string;
    repositoryId?: string;
    minConfidence?: number;
  } = {}
): Promise<RuleSearchResult[]> {
  const { topK = 10, language, repositoryId, minConfidence = 0.5 } = options;

  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  // フィルター構築
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    confidence: { $gte: minConfidence },
  };

  if (language) {
    filter.language = { $eq: language };
  }

  // 組織全体のルールとリポジトリ固有のルールの両方を含める
  if (repositoryId) {
    filter.$or = [
      { repositoryId: { $eq: repositoryId } },
      { repositoryId: { $exists: false } },
    ];
  }

  try {
    const result = await index.namespace(namespace).query({
      vector: queryVector,
      topK,
      includeMetadata: true,
      filter,
    });

    return (result.matches || []).map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as unknown as LearningRuleMetadata,
    }));
  } catch (error) {
    // Namespace doesn't exist yet - no rules stored
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Rules namespace ${namespace} doesn't exist yet`);
      return [];
    }
    throw error;
  }
}

/**
 * 単一のルールベクトルを削除
 */
export async function deleteRuleVector(
  installationId: number,
  vectorId: string
): Promise<void> {
  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  try {
    await index.namespace(namespace).deleteOne(vectorId);
    console.log(`[Pinecone] Deleted rule vector: ${vectorId}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Rule vector ${vectorId} not found, skipping delete`);
      return;
    }
    throw error;
  }
}

/**
 * 複数のルールベクトルを削除
 */
export async function deleteRuleVectors(
  installationId: number,
  vectorIds: string[]
): Promise<void> {
  if (vectorIds.length === 0) return;

  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  try {
    await index.namespace(namespace).deleteMany(vectorIds);
    console.log(`[Pinecone] Deleted ${vectorIds.length} rule vectors`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Rules namespace doesn't exist yet, skipping delete`);
      return;
    }
    throw error;
  }
}

/**
 * ルール Namespace の統計情報を取得
 */
export async function getRulesNamespaceStats(
  installationId: number
): Promise<{ vectorCount: number }> {
  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  const stats = await index.describeIndexStats();
  const namespaceStats = stats.namespaces?.[namespace];

  return {
    vectorCount: namespaceStats?.recordCount || 0,
  };
}

/**
 * 低信頼度のルールを削除（メンテナンス用）
 */
export async function deleteLowConfidenceRules(
  installationId: number,
  minConfidence: number = 0.3
): Promise<void> {
  const index = getIndex();
  const namespace = getRulesNamespace(installationId);

  try {
    await index.namespace(namespace).deleteMany({
      confidence: { $lt: minConfidence },
    });
    console.log(
      `[Pinecone] Deleted rules with confidence < ${minConfidence} in ${namespace}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      console.log(`[Pinecone] Rules namespace doesn't exist yet, skipping cleanup`);
      return;
    }
    throw error;
  }
}
