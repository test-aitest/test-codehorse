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
 * pr-agent方式: エラー位置を特定して問題の文字を置換する再帰的修復
 * エラーメッセージからposition情報を抽出し、その位置の文字をスペースに置換
 */
export function fixJsonByErrorPosition(
  jsonStr: string,
  maxIterations: number = 10
): string {
  let current = jsonStr;
  let iterations = 0;

  while (iterations < maxIterations) {
    try {
      JSON.parse(current);
      return current; // パース成功
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // エラーメッセージから位置を抽出
      // 例: "at position 123" or "at line 1 column 45"
      let position = -1;

      // パターン1: "at position N"
      const posMatch = errorMessage.match(/at position (\d+)/i);
      if (posMatch) {
        position = parseInt(posMatch[1], 10);
      }

      // パターン2: "position N (line L column C)"
      const posMatch2 = errorMessage.match(/position (\d+)/i);
      if (position === -1 && posMatch2) {
        position = parseInt(posMatch2[1], 10);
      }

      if (position === -1 || position >= current.length) {
        // 位置を特定できない場合は終了
        break;
      }

      // 問題の文字をスペースに置換
      const chars = current.split("");
      chars[position] = " ";
      current = chars.join("");
      iterations++;

      console.log(`[JSON] Fixed character at position ${position}, iteration ${iterations}`);
    }
  }

  return current;
}

/**
 * 切り詰められたJSONから最後の有効なオブジェクト境界を探す
 * pr-agent方式: 不完全なJSONの末尾を切り詰めて閉じカッコを追加
 */
export function truncateToLastValidObject(jsonStr: string): string {
  // 末尾が正常に閉じている場合はそのまま返す
  if (jsonStr.trim().endsWith("}")) {
    return jsonStr;
  }

  // オブジェクト境界（}, のパターン）を探す
  const objectBoundaries: number[] = [];
  const regex = /\}\s*,/g;
  let match;
  while ((match = regex.exec(jsonStr)) !== null) {
    objectBoundaries.push(match.index);
  }

  if (objectBoundaries.length === 0) {
    return jsonStr;
  }

  // 最後の有効な境界から試行
  for (let i = objectBoundaries.length - 1; i >= 0; i--) {
    const truncated = jsonStr.substring(0, objectBoundaries[i] + 1);
    // 閉じカッコを追加してみる
    const withClosing = truncated + "]}";

    try {
      JSON.parse(withClosing);
      console.log(`[JSON] Truncated to last valid object at position ${objectBoundaries[i]}`);
      return withClosing;
    } catch {
      // 次の境界を試す
    }
  }

  return jsonStr;
}

/**
 * JSONをパースしてZodスキーマで検証
 * pr-agent方式の多段階フォールバック戦略を採用
 */
export function parseAndValidateJson<T>(
  text: string,
  schema: z.ZodType<T>
): ParseResult<T> {
  const rawJsonStr = extractJsonFromText(text);

  // ========================================
  // フォールバック戦略 1: 基本的な前処理
  // ========================================
  const jsonStr = escapeControlCharsInStrings(fixBadEscapeSequences(rawJsonStr));

  try {
    const parsed = JSON.parse(jsonStr);
    const validated = schema.parse(parsed);
    return { success: true, data: validated };
  } catch (error1) {
    console.log("[JSON] Initial parse failed, attempting fallbacks...");

    // ========================================
    // フォールバック戦略 2: 切り詰め修復
    // ========================================
    try {
      const repaired = repairTruncatedJson(rawJsonStr);
      console.log("[JSON] Fallback 2: Truncation repair, length:", repaired.length);

      const parsed = JSON.parse(repaired);
      const validated = schema.parse(parsed);
      console.log("[JSON] Fallback 2 successful!");
      return { success: true, data: validated };
    } catch {
      // 続行

      // ========================================
      // フォールバック戦略 3: エラー位置特定修復
      // ========================================
      try {
        const fixed = fixJsonByErrorPosition(jsonStr);
        console.log("[JSON] Fallback 3: Error position fix");

        const parsed = JSON.parse(fixed);
        const validated = schema.parse(parsed);
        console.log("[JSON] Fallback 3 successful!");
        return { success: true, data: validated };
      } catch {
        // 続行

        // ========================================
        // フォールバック戦略 4: 最後の有効オブジェクトまで切り詰め
        // ========================================
        try {
          const truncated = truncateToLastValidObject(jsonStr);
          console.log("[JSON] Fallback 4: Truncate to last valid object");

          const parsed = JSON.parse(truncated);
          const validated = schema.parse(parsed);
          console.log("[JSON] Fallback 4 successful!");
          return { success: true, data: validated };
        } catch (error4) {
          // 全て失敗
          console.error("[JSON] All fallbacks failed:", error4);
          return {
            success: false,
            error:
              error1 instanceof Error ? error1.message : String(error1),
          };
        }
      }
    }
  }
}
