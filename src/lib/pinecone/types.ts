// Pinecone ベクトルストア型定義

import type { RuleType, RuleSource, SpecDocType } from "@prisma/client";

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

// ========================================
// Adaptive Learning Memory 型定義
// ========================================

/**
 * 学習ルールのメタデータ
 * Pineconeに保存されるルールベクトルのメタデータ
 */
export interface LearningRuleMetadata {
  // マルチテナント分離（必須フィルタリング用）
  installationId: number; // GitHub App installation ID
  repositoryId?: string; // リポジトリ固有ルール（optional）

  // ルール識別
  ruleId: string; // DBレコードID
  ruleType: RuleType; // STYLE, PATTERN, etc.
  source: RuleSource; // IMPLICIT, EXPLICIT, SPECIFICATION

  // フィルタリング属性
  language?: string; // typescript, python, etc.
  category?: string; // security, performance, style

  // ライフサイクル
  confidence: number; // 0.0 - 1.0
  createdAt: string; // ISO 8601
}

/**
 * 仕様書チャンクのメタデータ
 */
export interface SpecificationChunkMetadata {
  repositoryId: string;

  // ドキュメント情報
  documentId: string; // DBレコードID
  documentType: SpecDocType; // OPENAPI, MARKDOWN, etc.
  filePath: string;

  // チャンク情報
  chunkIndex: number;
  section: string; // APIエンドポイント、ヘッダーなど
  startLine?: number;
  endLine?: number;
  content?: string; // チャンクのテキスト内容（検索用）
}

/**
 * ルール用ベクトルレコード
 */
export interface RuleVectorRecord {
  id: string;
  values: number[];
  metadata: LearningRuleMetadata;
}

/**
 * 仕様書用ベクトルレコード
 */
export interface SpecVectorRecord {
  id: string;
  values: number[];
  metadata: SpecificationChunkMetadata;
}

/**
 * 結合型のメタデータ（検索結果用）
 */
export type VectorMetadata =
  | CodeChunkMetadata
  | LearningRuleMetadata
  | SpecificationChunkMetadata;

/**
 * ルール検索結果
 */
export interface RuleSearchResult {
  id: string;
  score: number;
  metadata: LearningRuleMetadata;
}

/**
 * 仕様書検索結果
 */
export interface SpecSearchResult {
  id: string;
  score: number;
  metadata: SpecificationChunkMetadata;
  content?: string;
}

// ========================================
// Namespace ヘルパー関数
// ========================================

/**
 * ルール用 Namespace名の生成（installation単位で分離）
 */
export function getRulesNamespace(installationId: number): string {
  return `rules/${installationId}`;
}

/**
 * 仕様書用 Namespace名の生成（リポジトリ単位）
 */
export function getSpecsNamespace(owner: string, repo: string): string {
  return `specs/${owner}/${repo}`;
}

/**
 * ルールベクトルIDの生成
 */
export function generateRuleVectorId(ruleId: string): string {
  return `rule:${ruleId}`;
}

/**
 * 仕様書チャンクベクトルIDの生成
 */
export function generateSpecVectorId(
  documentId: string,
  chunkIndex: number
): string {
  return `spec:${documentId}:${chunkIndex}`;
}
