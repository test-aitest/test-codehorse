/**
 * Phase 2: JSON修復システム テスト
 *
 * 多段階JSON修復機能のテストを実行
 */

import { z } from "zod";
import {
  repairAndParseJSON,
  isValidJSON,
  tryParseJSON,
  formatRepairSummary,
} from "./src/lib/ai/parser";

// テスト結果トラッキング
let passedTests = 0;
let failedTests = 0;

function logTest(name: string, passed: boolean, error?: string) {
  if (passed) {
    console.log(`  ✅ ${name}`);
    passedTests++;
  } else {
    console.log(`  ❌ ${name}${error ? `: ${error}` : ""}`);
    failedTests++;
  }
}

// テスト用スキーマ
const TestSchema = z.object({
  name: z.string(),
  value: z.number(),
  items: z.array(z.string()).optional(),
});

// ========================================
// 基本機能テスト
// ========================================

async function testBasicFunctions() {
  console.log("\n📦 基本機能テスト");

  // isValidJSON
  logTest(
    "isValidJSON returns true for valid JSON",
    isValidJSON('{"key": "value"}')
  );
  logTest(
    "isValidJSON returns false for invalid JSON",
    !isValidJSON("{invalid json}")
  );
  logTest("isValidJSON handles empty object", isValidJSON("{}"));
  logTest("isValidJSON handles array", isValidJSON("[1, 2, 3]"));

  // tryParseJSON
  const parsed = tryParseJSON<{ key: string }>('{"key": "value"}');
  logTest(
    "tryParseJSON returns parsed object",
    parsed !== null && parsed.key === "value"
  );
  logTest(
    "tryParseJSON returns null for invalid JSON",
    tryParseJSON("{invalid}") === null
  );
}

// ========================================
// 直接パーステスト
// ========================================

async function testDirectParse() {
  console.log("\n📋 直接パーステスト");

  // 有効なJSONを直接パース
  const validJson = '{"name": "test", "value": 42}';
  const result = repairAndParseJSON(validJson, TestSchema);

  logTest("Direct parse succeeds for valid JSON", result.success);
  logTest(
    "Direct parse returns correct data",
    result.data?.name === "test" && result.data?.value === 42
  );
  logTest(
    "Direct parse has no repair strategy",
    result.repairStrategy === undefined
  );
  logTest("Direct parse has one attempt", result.attempts.length === 1);
}

// ========================================
// Markdownコードブロック抽出テスト
// ========================================

async function testMarkdownExtraction() {
  console.log("\n📝 Markdownコードブロック抽出テスト");

  // ```json ``` 形式
  const jsonWithCodeBlock = `
Some text before
\`\`\`json
{"name": "extracted", "value": 100}
\`\`\`
Some text after
`;
  const result1 = repairAndParseJSON(jsonWithCodeBlock, TestSchema);
  logTest(
    "Extracts JSON from ```json``` block",
    result1.success && result1.data?.name === "extracted"
  );

  // ``` ``` 形式（langなし）
  const jsonWithPlainBlock = `
Text
\`\`\`
{"name": "plain", "value": 200}
\`\`\`
`;
  const result2 = repairAndParseJSON(jsonWithPlainBlock, TestSchema);
  logTest(
    "Extracts JSON from plain ``` block",
    result2.success && result2.data?.name === "plain"
  );
}

// ========================================
// 末尾カンマ修復テスト
// ========================================

async function testTrailingCommaRemoval() {
  console.log("\n🔧 末尾カンマ修復テスト");

  // オブジェクトの末尾カンマ
  const jsonWithTrailingComma = '{"name": "test", "value": 42,}';
  const result1 = repairAndParseJSON(jsonWithTrailingComma, TestSchema);
  logTest("Removes trailing comma in object", result1.success);

  // 配列の末尾カンマ
  const jsonWithArrayTrailingComma =
    '{"name": "test", "value": 42, "items": ["a", "b",]}';
  const result2 = repairAndParseJSON(jsonWithArrayTrailingComma, TestSchema);
  logTest(
    "Removes trailing comma in array",
    result2.success && result2.data?.items?.length === 2
  );

  // ネストした末尾カンマ
  const nestedTrailingComma = '{"name": "test", "value": 42, "items": ["x",],}';
  const result3 = repairAndParseJSON(nestedTrailingComma, TestSchema);
  logTest("Handles nested trailing commas", result3.success);
}

// ========================================
// 生JSONオブジェクト抽出テスト
// ========================================

async function testRawJsonExtraction() {
  console.log("\n🔍 生JSONオブジェクト抽出テスト");

  // テキストに埋め込まれたJSON
  const embeddedJson =
    'Here is the result: {"name": "embedded", "value": 50} and some more text';
  const result = repairAndParseJSON(embeddedJson, TestSchema);
  logTest(
    "Extracts embedded JSON object",
    result.success && result.data?.name === "embedded"
  );

  // 前後に改行があるJSON
  const jsonWithNewlines = `

  {"name": "newlined", "value": 60}

  `;
  const result2 = repairAndParseJSON(jsonWithNewlines, TestSchema);
  logTest(
    "Handles JSON with surrounding newlines",
    result2.success && result2.data?.name === "newlined"
  );
}

// ========================================
// 制御文字除去テスト
// ========================================

async function testControlCharacterRemoval() {
  console.log("\n🧹 制御文字除去テスト");

  // BOMを含むJSON
  const jsonWithBOM = '\uFEFF{"name": "bom", "value": 70}';
  const result = repairAndParseJSON(jsonWithBOM, TestSchema);
  logTest(
    "Removes BOM character",
    result.success && result.data?.name === "bom"
  );

  // 不可視文字を含むJSON
  const jsonWithInvisible = '\u200B{"name": "invisible", "value": 80}';
  const result2 = repairAndParseJSON(jsonWithInvisible, TestSchema);
  logTest(
    "Removes zero-width space",
    result2.success && result2.data?.name === "invisible"
  );
}

// ========================================
// 複合修復テスト
// ========================================

async function testCombinedRepair() {
  console.log("\n🔄 複合修復テスト");

  // 複数の問題を含むJSON
  const problematicJson = `
\`\`\`json
{"name": "complex", "value": 90, "items": ["a", "b",],}
\`\`\`
`;
  const result = repairAndParseJSON(problematicJson, TestSchema);
  logTest(
    "Handles multiple issues combined",
    result.success && result.data?.name === "complex"
  );
  logTest("Combined repair has correct data", result.data?.value === 90);
}

// ========================================
// スキーマバリデーションテスト
// ========================================

async function testSchemaValidation() {
  console.log("\n📐 スキーマバリデーションテスト");

  // 有効なデータ
  const validData = '{"name": "valid", "value": 100}';
  const result1 = repairAndParseJSON(validData, TestSchema);
  logTest("Valid data passes schema validation", result1.success);

  // 無効なデータ（numberのところにstring）
  const invalidData = '{"name": "invalid", "value": "not a number"}';
  const result2 = repairAndParseJSON(invalidData, TestSchema);
  logTest("Invalid data fails schema validation", !result2.success);

  // スキーマなしでのパース
  const noSchemaResult = repairAndParseJSON('{"any": "data"}');
  logTest(
    "Parses without schema",
    noSchemaResult.success &&
      (noSchemaResult.data as Record<string, unknown>).any === "data"
  );
}

// ========================================
// formatRepairSummary テスト
// ========================================

async function testFormatRepairSummary() {
  console.log("\n📊 formatRepairSummary テスト");

  const validResult = repairAndParseJSON(
    '{"name": "test", "value": 1}',
    TestSchema
  );
  const summary1 = formatRepairSummary(validResult);
  logTest("formatRepairSummary shows SUCCESS", summary1.includes("SUCCESS"));

  const invalidResult = repairAndParseJSON("{totally broken}}}}}", TestSchema);
  const summary2 = formatRepairSummary(invalidResult);
  logTest("formatRepairSummary shows FAILED", summary2.includes("FAILED"));
  logTest("formatRepairSummary shows attempts", summary2.includes("Attempts:"));
}

// ========================================
// エッジケーステスト
// ========================================

async function testEdgeCases() {
  console.log("\n⚠️ エッジケーステスト");

  // 空文字列
  const emptyResult = repairAndParseJSON("", TestSchema);
  logTest("Handles empty string", !emptyResult.success);

  // nullのみ
  const nullResult = repairAndParseJSON("null");
  logTest("Handles null value", nullResult.success && nullResult.data === null);

  // 配列
  const arrayResult = repairAndParseJSON("[1, 2, 3]");
  logTest(
    "Handles array",
    arrayResult.success && Array.isArray(arrayResult.data)
  );

  // 深くネストしたオブジェクト
  const deepNested = '{"a": {"b": {"c": {"d": "deep"}}}}';
  const deepResult = repairAndParseJSON(deepNested);
  logTest("Handles deeply nested objects", deepResult.success);

  // 大きな数値
  const largeNumber = '{"name": "large", "value": 999999999999}';
  const largeResult = repairAndParseJSON(largeNumber, TestSchema);
  logTest(
    "Handles large numbers",
    largeResult.success && largeResult.data?.value === 999999999999
  );
}

// ========================================
// 実際のAI出力パターンテスト
// ========================================

async function testRealAIOutputPatterns() {
  console.log("\n🤖 実際のAI出力パターンテスト");

  // AI Review形式の出力
  const ReviewSchema = z.object({
    summary: z.string(),
    walkthrough: z.array(
      z.object({
        path: z.string(),
        summary: z.string(),
        changeType: z.string(),
      })
    ),
    comments: z.array(
      z.object({
        path: z.string(),
        endLine: z.number(),
        body: z.string(),
        severity: z.string(),
      })
    ),
  });

  const aiReviewOutput = `
Here's my analysis of the code changes:

\`\`\`json
{
  "summary": "This PR adds a new feature for user authentication.",
  "walkthrough": [
    {
      "path": "src/auth.ts",
      "summary": "Added login function",
      "changeType": "add"
    }
  ],
  "comments": [
    {
      "path": "src/auth.ts",
      "endLine": 42,
      "body": "Consider adding input validation here.",
      "severity": "IMPORTANT"
    }
  ]
}
\`\`\`

Let me know if you have any questions!
`;

  const reviewResult = repairAndParseJSON(aiReviewOutput, ReviewSchema);
  logTest("Parses AI review output", reviewResult.success);
  logTest(
    "Review has correct summary",
    reviewResult.data?.summary?.includes("authentication") ?? false
  );
  logTest(
    "Review has walkthrough",
    (reviewResult.data?.walkthrough?.length ?? 0) === 1
  );
  logTest(
    "Review has comments",
    (reviewResult.data?.comments?.length ?? 0) === 1
  );

  // 反省結果形式の出力
  const ReflectionSchema = z.object({
    overallQuality: z.number(),
    suggestions: z.array(
      z.object({
        index: z.number(),
        score: z.number(),
        isRelevant: z.boolean(),
        reasoning: z.string(),
      })
    ),
    summary: z.string(),
  });

  const reflectionOutput = `
\`\`\`json
{
  "overallQuality": 8,
  "suggestions": [
    {
      "index": 0,
      "score": 9,
      "isRelevant": true,
      "reasoning": "Valid security concern"
    },
    {
      "index": 1,
      "score": 5,
      "isRelevant": false,
      "reasoning": "Too nitpicky",
    }
  ],
  "summary": "Good overall review quality"
}
\`\`\`
`;

  const reflectionResult = repairAndParseJSON(
    reflectionOutput,
    ReflectionSchema
  );
  logTest(
    "Parses reflection output with trailing comma",
    reflectionResult.success
  );
  logTest(
    "Reflection has correct quality score",
    reflectionResult.data?.overallQuality === 8
  );
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║    Phase 2: JSON修復システム テスト        ║");
  console.log("╚════════════════════════════════════════════╝");

  await testBasicFunctions();
  await testDirectParse();
  await testMarkdownExtraction();
  await testTrailingCommaRemoval();
  await testRawJsonExtraction();
  await testControlCharacterRemoval();
  await testCombinedRepair();
  await testSchemaValidation();
  await testFormatRepairSummary();
  await testEdgeCases();
  await testRealAIOutputPatterns();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 2 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
