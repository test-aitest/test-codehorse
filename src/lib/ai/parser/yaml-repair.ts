/**
 * YAML Repair System
 *
 * 設定ファイル（.codehorse.yaml）のパース修復
 */

import * as yaml from "yaml";
import { z } from "zod";

// ========================================
// 型定義
// ========================================

export interface YamlParseAttempt {
  strategy: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface YamlRepairResult<T = unknown> {
  success: boolean;
  data?: T;
  attempts: YamlParseAttempt[];
  originalError?: string;
  repairStrategy?: string;
}

// ========================================
// 修復戦略
// ========================================

type YamlRepairStrategy = {
  name: string;
  repair: (input: string) => string;
};

const YAML_REPAIR_STRATEGIES: YamlRepairStrategy[] = [
  {
    name: "extract_yaml_block",
    repair: extractYamlBlock,
  },
  {
    name: "fix_indentation",
    repair: fixIndentation,
  },
  {
    name: "fix_unquoted_strings",
    repair: fixUnquotedStrings,
  },
  {
    name: "remove_invalid_characters",
    repair: removeInvalidYamlCharacters,
  },
  {
    name: "fix_multiline_strings",
    repair: fixMultilineStrings,
  },
];

// ========================================
// 修復関数
// ========================================

/**
 * YAMLブロックを抽出
 */
function extractYamlBlock(input: string): string {
  // ```yaml ... ``` から抽出
  const yamlBlockMatch = input.match(/```(?:yaml|yml)?\s*\n([\s\S]*?)\n```/);
  if (yamlBlockMatch && yamlBlockMatch[1]) {
    return yamlBlockMatch[1].trim();
  }

  return input;
}

/**
 * インデントを修正
 * タブをスペースに変換し、不規則なインデントを修正
 */
function fixIndentation(input: string): string {
  const lines = input.split("\n");
  const fixedLines = lines.map((line) => {
    // タブをスペース2つに変換
    return line.replace(/\t/g, "  ");
  });

  return fixedLines.join("\n");
}

/**
 * 引用符なしの特殊文字列を修正
 */
function fixUnquotedStrings(input: string): string {
  const lines = input.split("\n");
  const fixedLines = lines.map((line) => {
    // キー: 値 のパターンを検出
    const match = line.match(/^(\s*)([^:]+):\s*(.+)$/);
    if (match) {
      const [, indent, key, value] = match;
      const trimmedValue = value.trim();

      // 値が特殊文字で始まる場合は引用符で囲む
      if (
        trimmedValue &&
        !trimmedValue.startsWith('"') &&
        !trimmedValue.startsWith("'") &&
        !trimmedValue.startsWith("[") &&
        !trimmedValue.startsWith("{") &&
        /^[@*&!|>]/.test(trimmedValue)
      ) {
        return `${indent}${key}: "${trimmedValue}"`;
      }

      // yes/no/true/false/null などの予約語を引用符で囲む（文字列として使いたい場合）
      if (/^(yes|no|true|false|null|~)$/i.test(trimmedValue)) {
        // これらは通常YAMLの予約語なのでそのまま
        return line;
      }
    }
    return line;
  });

  return fixedLines.join("\n");
}

/**
 * 不正な文字を除去
 */
function removeInvalidYamlCharacters(input: string): string {
  // BOMと制御文字を除去
  let result = input.replace(/^\uFEFF/, "");
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return result;
}

/**
 * 複数行文字列を修正
 */
function fixMultilineStrings(input: string): string {
  // |や>で始まる複数行文字列のインデントを確認
  const lines = input.split("\n");
  const fixedLines: string[] = [];

  let inMultiline = false;
  let multilineIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inMultiline) {
      const currentIndent = line.search(/\S/);
      if (currentIndent === -1 || currentIndent > multilineIndent) {
        // 複数行文字列の継続
        fixedLines.push(line);
        continue;
      } else {
        // 複数行文字列の終了
        inMultiline = false;
      }
    }

    // 複数行文字列の開始を検出
    const multilineMatch = line.match(/^(\s*)([^:]+):\s*([|>][-+]?)$/);
    if (multilineMatch) {
      inMultiline = true;
      multilineIndent = multilineMatch[1].length;
    }

    fixedLines.push(line);
  }

  return fixedLines.join("\n");
}

// ========================================
// メイン修復関数
// ========================================

/**
 * YAMLを修復してパース
 *
 * @param input - 修復対象の文字列
 * @param schema - オプションのZodスキーマ（バリデーション用）
 * @returns 修復結果
 */
export function repairAndParseYAML<T = unknown>(
  input: string,
  schema?: z.ZodSchema<T>
): YamlRepairResult<T> {
  const attempts: YamlParseAttempt[] = [];
  let currentInput = input;

  // まず生のYAMLとしてパースを試みる
  try {
    const parsed = yaml.parse(input);
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
  for (const strategy of YAML_REPAIR_STRATEGIES) {
    try {
      // 修復を適用
      const repairedInput = strategy.repair(currentInput);

      // 修復後にパース
      const parsed = yaml.parse(repairedInput);

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
      if (strategy.name === "extract_yaml_block") {
        currentInput = strategy.repair(currentInput);
      }
    }
  }

  // 複合戦略
  try {
    let combinedInput = extractYamlBlock(input);
    combinedInput = fixIndentation(combinedInput);
    combinedInput = removeInvalidYamlCharacters(combinedInput);
    combinedInput = fixUnquotedStrings(combinedInput);

    const parsed = yaml.parse(combinedInput);
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
// ユーティリティ
// ========================================

/**
 * YAML文字列が有効かどうかをチェック
 */
export function isValidYAML(input: string): boolean {
  try {
    yaml.parse(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * 修復なしでパースを試み、失敗時はnullを返す
 */
export function tryParseYAML<T = unknown>(input: string): T | null {
  try {
    return yaml.parse(input) as T;
  } catch {
    return null;
  }
}
