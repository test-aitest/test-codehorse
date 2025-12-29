/**
 * JSON Parse Utilities
 *
 * AI出力からJSONを抽出・パースするユーティリティ
 * 途中で切れたJSONの修復機能を含む
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
 * 途中で切れたJSONを修復する
 * AIの応答がトークン制限で切れた場合に対応
 */
export function repairTruncatedJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // 末尾の不完全な文字列を削除（途中で切れた文字列リテラル）
  // "key": "value が途中で切れている場合
  const lastQuoteIndex = repaired.lastIndexOf('"');
  if (lastQuoteIndex > 0) {
    // 最後のクォートの前にある未閉じの文字列を探す
    const afterLastQuote = repaired.substring(lastQuoteIndex + 1);
    // 閉じカッコ以外の文字があれば、文字列が途中で切れている
    if (!/^[\s,\}\]]*$/.test(afterLastQuote)) {
      // 途中で切れた文字列を閉じる
      repaired = repaired.substring(0, lastQuoteIndex + 1);
    }
  }

  // 末尾の不完全な要素を削除
  // 例: {"key": で終わっている場合
  repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

  // 開いているブラケットをカウント
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escapeNext = false;

  for (const char of repaired) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") openBraces++;
      if (char === "}") openBraces--;
      if (char === "[") openBrackets++;
      if (char === "]") openBrackets--;
    }
  }

  // 文字列が閉じていない場合
  if (inString) {
    repaired += '"';
  }

  // 閉じカッコを追加
  while (openBrackets > 0) {
    repaired += "]";
    openBrackets--;
  }
  while (openBraces > 0) {
    repaired += "}";
    openBraces--;
  }

  return repaired;
}

/**
 * JSONパース結果の型
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * JSONをパースしてZodスキーマで検証
 * パース失敗時は修復を試みる
 */
export function parseAndValidateJson<T>(
  text: string,
  schema: z.ZodType<T>
): ParseResult<T> {
  const jsonStr = extractJsonFromText(text);

  // 1. まず通常のパースを試みる
  try {
    const parsed = JSON.parse(jsonStr);
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (firstError) {
    // 2. 失敗した場合、修復を試みる
    console.log("[JSON] Initial parse failed, attempting repair...");

    try {
      const repaired = repairTruncatedJson(jsonStr);
      console.log("[JSON] Repaired JSON length:", repaired.length);

      const parsed = JSON.parse(repaired);
      const validated = schema.parse(parsed);
      console.log("[JSON] Repair successful!");
      return { success: true, data: validated };
    } catch (repairError) {
      // 修復も失敗
      console.error("[JSON] Repair also failed:", repairError);
      return {
        success: false,
        error:
          firstError instanceof Error ? firstError.message : String(firstError),
      };
    }
  }
}
