/**
 * JSON Parse Utilities
 *
 * AI出力からJSONを抽出・パースするユーティリティ
 */

import { z } from "zod";

/**
 * JSON文字列からコードブロックを抽出
 */
export function extractJsonFromText(text: string): string {
  // ```json ... ``` パターンを抽出
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  // JSONオブジェクトを直接検出
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text.trim();
}

/**
 * JSONパース結果の型
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * JSONをパースしてZodスキーマで検証
 */
export function parseAndValidateJson<T>(
  text: string,
  schema: z.ZodType<T>
): ParseResult<T> {
  try {
    const jsonStr = extractJsonFromText(text);
    const parsed = JSON.parse(jsonStr);
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
