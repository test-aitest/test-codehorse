/**
 * JSON Repair System
 *
 * AIの不正なJSON出力を多段階でリカバリーする
 * pr-agentスタイルの堅牢なパース戦略を実装
 */

import { z } from "zod";

// ========================================
// 型定義
// ========================================

export interface ParseAttempt {
  strategy: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface RepairResult<T = unknown> {
  success: boolean;
  data?: T;
  attempts: ParseAttempt[];
  originalError?: string;
  repairStrategy?: string;
}

// ========================================
// 修復戦略（優先順）
// ========================================

type RepairStrategy = {
  name: string;
  repair: (input: string) => string;
};

const REPAIR_STRATEGIES: RepairStrategy[] = [
  {
    name: "extract_markdown_json",
    repair: extractMarkdownJson,
  },
  {
    name: "extract_raw_json_object",
    repair: extractRawJsonObject,
  },
  {
    name: "remove_trailing_commas",
    repair: removeTrailingCommas,
  },
  {
    name: "fix_unescaped_quotes",
    repair: fixUnescapedQuotes,
  },
  {
    name: "remove_invalid_line_starts",
    repair: removeInvalidLineStarts,
  },
  {
    name: "fix_missing_quotes",
    repair: fixMissingQuotes,
  },
  {
    name: "truncate_to_valid_object",
    repair: truncateToValidObject,
  },
  {
    name: "remove_control_characters",
    repair: removeControlCharacters,
  },
  {
    name: "progressive_line_removal",
    repair: progressiveLineRemoval,
  },
];

// ========================================
// 修復関数
// ========================================

/**
 * Markdownコードフェンスから JSON を抽出
 */
function extractMarkdownJson(input: string): string {
  // ```json ... ``` または ``` ... ``` から抽出
  const codeBlockMatch = input.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // 単一行のコードブロック
  const singleLineMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (singleLineMatch && singleLineMatch[1]) {
    return singleLineMatch[1].trim();
  }

  return input;
}

/**
 * 生のJSONオブジェクトを抽出
 */
function extractRawJsonObject(input: string): string {
  // 最初の { から最後の } までを抽出
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return input.slice(firstBrace, lastBrace + 1);
  }

  // 配列の場合
  const firstBracket = input.indexOf("[");
  const lastBracket = input.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return input.slice(firstBracket, lastBracket + 1);
  }

  return input;
}

/**
 * 末尾カンマを除去
 */
function removeTrailingCommas(input: string): string {
  // オブジェクトの末尾カンマ: ,} → }
  let result = input.replace(/,(\s*[}\]])/g, "$1");

  // 配列の末尾カンマ: ,] → ]
  result = result.replace(/,(\s*])/g, "$1");

  return result;
}

/**
 * エスケープされていない引用符を修正
 */
function fixUnescapedQuotes(input: string): string {
  // 文字列値内の未エスケープの引用符を検出して修正
  // 注: これは完璧ではないが、多くのケースをカバー
  let result = input;

  // JSONを行ごとに処理
  const lines = result.split("\n");
  const fixedLines = lines.map((line) => {
    // "key": "value" パターンを検出
    const match = line.match(/^(\s*"[^"]+"\s*:\s*")(.*)("[\s,]*)$/);
    if (match) {
      const [, prefix, value, suffix] = match;
      // 値内の未エスケープの引用符をエスケープ
      const fixedValue = value.replace(/(?<!\\)"/g, '\\"');
      return prefix + fixedValue + suffix;
    }
    return line;
  });

  return fixedLines.join("\n");
}

/**
 * 行頭の不正文字を除去
 */
function removeInvalidLineStarts(input: string): string {
  const lines = input.split("\n");
  const cleanedLines = lines.map((line) => {
    // 行頭のBOMや不可視文字を除去
    return line.replace(/^[\uFEFF\u200B\u200C\u200D\u2060]+/, "");
  });
  return cleanedLines.join("\n");
}

/**
 * キー名の引用符を修正
 */
function fixMissingQuotes(input: string): string {
  // 引用符なしのキーを修正: { key: "value" } → { "key": "value" }
  return input.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
}

/**
 * 最後の有効なオブジェクトまで切り詰め
 */
function truncateToValidObject(input: string): string {
  // ネストレベルを追跡して、バランスの取れた最後の位置を見つける
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let lastValidEnd = -1;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0 && bracketCount === 0) {
        lastValidEnd = i;
      }
    } else if (char === "[") {
      bracketCount++;
    } else if (char === "]") {
      bracketCount--;
      if (braceCount === 0 && bracketCount === 0) {
        lastValidEnd = i;
      }
    }
  }

  if (lastValidEnd > 0) {
    return input.slice(0, lastValidEnd + 1);
  }

  return input;
}

/**
 * 制御文字を除去
 */
function removeControlCharacters(input: string): string {
  // 制御文字（改行・タブ以外）を除去
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * 段階的に行を削除して有効なJSONを探す
 */
function progressiveLineRemoval(input: string): string {
  const lines = input.split("\n");

  // 後ろから行を削除していき、有効なJSONを探す
  for (let i = lines.length; i > 0; i--) {
    const partialInput = lines.slice(0, i).join("\n");

    // 閉じ括弧を追加してみる
    let attempts = [
      partialInput,
      partialInput + "}",
      partialInput + "]}",
      partialInput + "\"]}",
      partialInput + "\"}",
      partialInput + "\"}]",
    ];

    for (const attempt of attempts) {
      try {
        JSON.parse(attempt);
        return attempt;
      } catch {
        // 続行
      }
    }
  }

  return input;
}

// ========================================
// メイン修復関数
// ========================================

/**
 * JSONを修復してパース
 *
 * @param input - 修復対象の文字列
 * @param schema - オプションのZodスキーマ（バリデーション用）
 * @returns 修復結果
 */
export function repairAndParseJSON<T = unknown>(
  input: string,
  schema?: z.ZodSchema<T>
): RepairResult<T> {
  const attempts: ParseAttempt[] = [];
  let currentInput = input;

  // まず生のJSONとしてパースを試みる
  try {
    const parsed = JSON.parse(input);
    const validated = schema ? schema.parse(parsed) : (parsed as T);

    return {
      success: true,
      data: validated,
      attempts: [{ strategy: "direct_parse", success: true, result: validated }],
    };
  } catch (directError) {
    attempts.push({
      strategy: "direct_parse",
      success: false,
      error: (directError as Error).message,
    });
  }

  // 各修復戦略を順番に試す
  for (const strategy of REPAIR_STRATEGIES) {
    try {
      // 修復を適用
      const repairedInput = strategy.repair(currentInput);

      // 修復後にパース
      const parsed = JSON.parse(repairedInput);

      // スキーマバリデーション
      const validated = schema ? schema.parse(parsed) : (parsed as T);

      attempts.push({
        strategy: strategy.name,
        success: true,
        result: validated,
      });

      return {
        success: true,
        data: validated,
        attempts,
        repairStrategy: strategy.name,
      };
    } catch (error) {
      attempts.push({
        strategy: strategy.name,
        success: false,
        error: (error as Error).message,
      });

      // 一部の戦略は入力を変換して次に渡す
      if (
        strategy.name === "extract_markdown_json" ||
        strategy.name === "extract_raw_json_object"
      ) {
        currentInput = strategy.repair(currentInput);
      }
    }
  }

  // 複合戦略: 複数の修復を組み合わせる
  try {
    let combinedInput = extractMarkdownJson(input);
    combinedInput = extractRawJsonObject(combinedInput);
    combinedInput = removeTrailingCommas(combinedInput);
    combinedInput = removeControlCharacters(combinedInput);
    combinedInput = fixUnescapedQuotes(combinedInput);

    const parsed = JSON.parse(combinedInput);
    const validated = schema ? schema.parse(parsed) : (parsed as T);

    attempts.push({
      strategy: "combined_repair",
      success: true,
      result: validated,
    });

    return {
      success: true,
      data: validated,
      attempts,
      repairStrategy: "combined_repair",
    };
  } catch (combinedError) {
    attempts.push({
      strategy: "combined_repair",
      success: false,
      error: (combinedError as Error).message,
    });
  }

  // すべての戦略が失敗
  return {
    success: false,
    attempts,
    originalError: attempts[0]?.error,
  };
}

// ========================================
// 便利なユーティリティ
// ========================================

/**
 * JSON文字列が有効かどうかをチェック
 */
export function isValidJSON(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * 修復なしでパースを試み、失敗時はnullを返す
 */
export function tryParseJSON<T = unknown>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/**
 * 修復結果のサマリーを生成
 */
export function formatRepairSummary(result: RepairResult): string {
  const lines: string[] = [];

  lines.push(`Repair Result: ${result.success ? "SUCCESS" : "FAILED"}`);

  if (result.repairStrategy) {
    lines.push(`Strategy Used: ${result.repairStrategy}`);
  }

  lines.push(`Attempts: ${result.attempts.length}`);

  for (const attempt of result.attempts) {
    const status = attempt.success ? "✓" : "✗";
    lines.push(`  ${status} ${attempt.strategy}${attempt.error ? `: ${attempt.error.slice(0, 50)}...` : ""}`);
  }

  return lines.join("\n");
}
