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
 * JSON文字列内の不正なエスケープシーケンスを修復する
 */
export function fixBadEscapeSequences(jsonStr: string): string {
  let result = "";
  let i = 0;

  while (i < jsonStr.length) {
    const char = jsonStr[i];

    if (char === "\\") {
      // バックスラッシュの次の文字を確認
      const nextChar = jsonStr[i + 1];

      if (nextChar === undefined) {
        // 文字列の最後にバックスラッシュがある場合は削除
        i++;
        continue;
      }

      // 有効なJSONエスケープシーケンス: \" \\ \/ \b \f \n \r \t \uXXXX
      const validEscapes = ['"', "\\", "/", "b", "f", "n", "r", "t", "u"];

      if (validEscapes.includes(nextChar)) {
        if (nextChar === "u") {
          // \uXXXX の形式をチェック
          const hex = jsonStr.substring(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            // 有効なUnicodeエスケープ
            result += jsonStr.substring(i, i + 6);
            i += 6;
            continue;
          } else {
            // 無効なUnicodeエスケープ - バックスラッシュをエスケープ
            result += "\\\\u";
            i += 2;
            continue;
          }
        }
        // 有効なエスケープシーケンス
        result += char + nextChar;
        i += 2;
      } else {
        // 無効なエスケープシーケンス - バックスラッシュをエスケープするか削除
        // 例: \a, \x, \1 などは無効
        // バックスラッシュを二重にしてエスケープ
        result += "\\\\" + nextChar;
        i += 2;
      }
    } else if (char === "\n" || char === "\r" || char === "\t") {
      // 文字列内の生の制御文字をエスケープシーケンスに置換
      // ただし、JSON構造の一部（インデント等）かどうかを判定するのは難しいため、
      // 文字列リテラル内かどうかを追跡する必要がある
      // ここではシンプルに追加（後の処理で文字列内の場合のみ問題になる）
      result += char;
      i++;
    } else {
      result += char;
      i++;
    }
  }

  return result;
}

/**
 * JSON文字列内のリテラル制御文字をエスケープする
 * （文字列リテラル内の生の改行やタブを修正）
 */
export function escapeControlCharsInStrings(jsonStr: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // 文字列リテラル内の制御文字をエスケープ
    if (inString) {
      if (char === "\n") {
        result += "\\n";
        continue;
      }
      if (char === "\r") {
        result += "\\r";
        continue;
      }
      if (char === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += char;
  }

  return result;
}

/**
 * 途中で切れたJSONを修復する
 * AIの応答がトークン制限で切れた場合に対応
 */
export function repairTruncatedJson(jsonStr: string): string {
  // まず不正なエスケープシーケンスを修復
  let repaired = fixBadEscapeSequences(jsonStr.trim());

  // 文字列内の制御文字をエスケープ
  repaired = escapeControlCharsInStrings(repaired);

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
  const rawJsonStr = extractJsonFromText(text);

  // 前処理: 不正なエスケープシーケンスと制御文字を修正
  const jsonStr = escapeControlCharsInStrings(fixBadEscapeSequences(rawJsonStr));

  // 1. まず通常のパースを試みる
  try {
    const parsed = JSON.parse(jsonStr);
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (firstError) {
    // 2. 失敗した場合、追加の修復を試みる
    console.log("[JSON] Initial parse failed, attempting repair...");

    try {
      const repaired = repairTruncatedJson(rawJsonStr);
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
