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

/**
 * テキストからEmbeddingを生成
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAI();

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
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

  // OpenAIは最大2048件まで一度にリクエスト可能（ただしトークン制限あり）
  // 安全のため500件ずつ処理
  const BATCH_SIZE = 500;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

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
      `[Embeddings] Generated ${i + embeddings.length}/${texts.length} embeddings`
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
