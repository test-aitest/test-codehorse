import OpenAI from "openai";

// OpenAI クライアント（遅延初期化）
let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

// Embedding モデル設定
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small のデフォルト次元数
const MAX_TOKENS = 4000; // text-embedding-3-small の上限は8192、コードは推定が難しいため大きな余裕を持って4000

/**
 * テキストの推定トークン数を計算（非常に保守的な概算：1トークン ≈ 2文字）
 * コードは記号・キーワード・特殊文字が多く、通常のテキストより多くのトークンを消費する
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * テキストをトークン上限に収まるようにトランケート
 */
function truncateToTokenLimit(text: string, maxTokens: number = MAX_TOKENS): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // 非常に保守的な概算で必要な文字数を計算（1トークン ≈ 2文字）
  const maxChars = maxTokens * 2;
  const truncated = text.slice(0, maxChars);

  console.log(`[Embeddings] Truncated text from ~${estimatedTokens} to ~${maxTokens} tokens`);
  return truncated + "\n... (truncated)";
}

/**
 * テキストからEmbeddingを生成
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAI();

  // トークン上限を超える場合はトランケート
  const truncatedText = truncateToTokenLimit(text);

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncatedText,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

/**
 * 複数テキストからEmbeddingをバッチ生成
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAI();

  // 各テキストをトークン上限に収まるようにトランケート
  const truncatedTexts = texts.map((text) => truncateToTokenLimit(text));

  // OpenAIは最大2048件まで一度にリクエスト可能（ただしトークン制限あり）
  // 安全のため100件ずつ処理（大きなテキストが含まれる可能性があるため）
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < truncatedTexts.length; i += BATCH_SIZE) {
    const batch = truncatedTexts.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    allEmbeddings.push(...embeddings);

    console.log(
      `[Embeddings] Generated ${i + embeddings.length}/${truncatedTexts.length} embeddings`
    );
  }

  return allEmbeddings;
}

/**
 * コードチャンク用のテキストを整形
 * - メタデータを含めることで検索精度を向上
 */
export function formatChunkForEmbedding(params: {
  content: string;
  filePath: string;
  language: string;
  chunkType: string;
  name: string;
  signature?: string;
}): string {
  const { content, filePath, language, chunkType, name, signature } = params;

  // メタデータをプレフィックスとして追加
  const parts = [
    `File: ${filePath}`,
    `Language: ${language}`,
    `Type: ${chunkType}`,
    `Name: ${name}`,
  ];

  if (signature) {
    parts.push(`Signature: ${signature}`);
  }

  parts.push("", "Code:", content);

  return parts.join("\n");
}

/**
 * 検索クエリ用のテキストを整形
 */
export function formatQueryForEmbedding(params: {
  query: string;
  language?: string;
  context?: string;
}): string {
  const { query, language, context } = params;

  const parts = [query];

  if (language) {
    parts.push(`Language: ${language}`);
  }

  if (context) {
    parts.push(`Context: ${context}`);
  }

  return parts.join("\n");
}

/**
 * Embedding次元数を取得
 */
export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}

// ========================================
// Adaptive Learning Memory 用フォーマッタ
// ========================================

/**
 * 学習ルール用のテキストを整形
 * - ルールの意味内容を正確にベクトル化するためのフォーマット
 */
export function formatRuleForEmbedding(params: {
  ruleText: string;
  ruleType: string;
  language?: string;
  category?: string;
}): string {
  const { ruleText, ruleType, language, category } = params;

  const parts = [`Rule: ${ruleText}`, `Type: ${ruleType}`];

  if (language) {
    parts.push(`Language: ${language}`);
  }

  if (category) {
    parts.push(`Category: ${category}`);
  }

  return parts.join("\n");
}

/**
 * 仕様書チャンク用のテキストを整形
 * - OpenAPIやMarkdownの内容を検索しやすくフォーマット
 */
export function formatSpecChunkForEmbedding(params: {
  content: string;
  documentType: string;
  section?: string;
  filePath: string;
}): string {
  const { content, documentType, section, filePath } = params;

  const parts = [`Type: ${documentType}`, `File: ${filePath}`];

  if (section) {
    parts.push(`Section: ${section}`);
  }

  parts.push("", "Content:", content);

  return parts.join("\n");
}

/**
 * ルール検索クエリ用のテキストを整形
 * - コードの変更内容からルールを検索するためのクエリフォーマット
 */
export function formatRuleQueryForEmbedding(params: {
  codeContext: string;
  language?: string;
  category?: string;
}): string {
  const { codeContext, language, category } = params;

  const parts = [
    "Find coding rules and preferences relevant to this code:",
    "",
    codeContext,
  ];

  if (language) {
    parts.push(`Language: ${language}`);
  }

  if (category) {
    parts.push(`Category: ${category}`);
  }

  return parts.join("\n");
}

/**
 * 仕様書検索クエリ用のテキストを整形
 */
export function formatSpecQueryForEmbedding(params: {
  context: string;
  documentType?: string;
}): string {
  const { context, documentType } = params;

  const parts = [
    "Find specification documentation relevant to:",
    "",
    context,
  ];

  if (documentType) {
    parts.push(`Document Type: ${documentType}`);
  }

  return parts.join("\n");
}
