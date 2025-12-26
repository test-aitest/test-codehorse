import { encoding_for_model, type Tiktoken } from "tiktoken";

// =====================================================
// モデル別のトークン制限
// =====================================================

export const MODEL_LIMITS = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gemini-1.5-pro": 1000000,
  "gemini-1.5-flash": 1000000,
  "gemini-2.0-flash": 1000000,
} as const;

export type SupportedModel = keyof typeof MODEL_LIMITS;

// =====================================================
// エンコーダー管理
// =====================================================

// シングルトンエンコーダー
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    // GPT-4oベースのエンコーディング（o200k_base）を使用
    encoder = encoding_for_model("gpt-4o");
  }
  return encoder!;
}

// =====================================================
// トークン計算関数
// =====================================================

/**
 * テキストのトークン数を計算
 */
export function countTokens(text: string): number {
  const enc = getEncoder();
  return enc.encode(text).length;
}

/**
 * 複数テキストの合計トークン数を計算
 */
export function countTotalTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + countTokens(text), 0);
}

/**
 * 指定トークン数以内にテキストを切り詰め
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const enc = getEncoder();
  const tokens = enc.encode(text);

  if (tokens.length <= maxTokens) {
    return text;
  }

  const truncatedTokens = tokens.slice(0, maxTokens);
  // TextDecoderを使用してデコード
  return new TextDecoder().decode(enc.decode(truncatedTokens));
}

/**
 * コンテキストウィンドウに収まるかチェック
 */
export function fitsInContext(
  texts: string[],
  model: SupportedModel,
  reserveForOutput: number = 4000
): boolean {
  const totalTokens = countTotalTokens(texts);
  const limit = MODEL_LIMITS[model] - reserveForOutput;
  return totalTokens <= limit;
}

/**
 * トークン数の見積もりを取得
 */
export function estimateTokens(text: string): number {
  // 簡易見積もり（1トークン ≈ 4文字）
  // 正確な計算が必要な場合はcountTokensを使用
  return Math.ceil(text.length / 4);
}

/**
 * モデルの最大コンテキスト長を取得
 */
export function getModelContextLimit(model: SupportedModel): number {
  return MODEL_LIMITS[model];
}
