// Pinecone ベクトルストア型定義

/**
 * コードチャンクのメタデータ
 */
export interface CodeChunkMetadata {
  // リポジトリ情報
  repositoryId: string;
  owner: string;
  repo: string;

  // ファイル情報
  filePath: string;
  language: string;

  // チャンク情報
  chunkType: "function" | "class" | "interface" | "type" | "variable" | "import" | "other";
  name: string; // 関数名、クラス名など
  startLine: number;
  endLine: number;

  // コンテキスト
  parentName?: string; // クラスメソッドの場合の親クラス名
  signature?: string; // 関数シグネチャ

  // インデキシング情報
  commitSha: string;
  indexedAt: string; // ISO 8601
}

/**
 * Pinecone upsert 用のベクトルレコード
 */
export interface VectorRecord {
  id: string;
  values: number[];
  metadata: CodeChunkMetadata;
}

/**
 * 検索結果
 */
export interface SearchResult {
  id: string;
  score: number;
  metadata: CodeChunkMetadata;
  content: string; // 元のコード内容
}

/**
 * Namespace名の生成（リポジトリ単位で分離）
 */
export function getNamespace(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * ベクトルIDの生成
 */
export function generateVectorId(
  repositoryId: string,
  filePath: string,
  chunkType: string,
  name: string,
  startLine: number
): string {
  // 一意なIDを生成
  const base = `${repositoryId}:${filePath}:${chunkType}:${name}:${startLine}`;
  // URLセーフなBase64エンコード（Pinecone IDの制限対応）
  return Buffer.from(base).toString("base64url");
}
