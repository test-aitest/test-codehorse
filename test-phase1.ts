/**
 * Phase 1: Self-Reflection Protocol テスト
 *
 * 自己反省機能のテストを実行
 */

import {
  reflectOnReview,
  filterCommentsByReflection,
  applyReflection,
  isReflectionEnabled,
  getReflectionThreshold,
  formatReflectionSummary,
  type ReflectionResult,
  type SuggestionValidation,
} from "./src/lib/ai/reflection";
import type { InlineComment } from "./src/lib/ai/schemas";

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

// ========================================
// ユーティリティ関数テスト
// ========================================

async function testUtilityFunctions() {
  console.log("\n📦 ユーティリティ関数テスト");

  // isReflectionEnabled
  try {
    const enabled = isReflectionEnabled();
    logTest("isReflectionEnabled returns boolean", typeof enabled === "boolean");
  } catch (e) {
    logTest("isReflectionEnabled returns boolean", false, (e as Error).message);
  }

  // getReflectionThreshold
  try {
    const threshold = getReflectionThreshold();
    logTest("getReflectionThreshold returns number", typeof threshold === "number");
    logTest("getReflectionThreshold is between 1-10", threshold >= 1 && threshold <= 10);
  } catch (e) {
    logTest("getReflectionThreshold returns number", false, (e as Error).message);
    logTest("getReflectionThreshold is between 1-10", false);
  }
}

// ========================================
// formatReflectionSummary テスト
// ========================================

async function testFormatReflectionSummary() {
  console.log("\n📝 formatReflectionSummary テスト");

  // 正常ケース
  try {
    const mockReflection: ReflectionResult = {
      overallQuality: 8,
      suggestions: [
        { index: 0, score: 9, isRelevant: true, reasoning: "Good catch" },
        { index: 1, score: 6, isRelevant: true, reasoning: "Minor issue" },
        { index: 2, score: 4, isRelevant: false, reasoning: "False positive" },
      ],
      summary: "Overall good review with some false positives",
    };

    const summary = formatReflectionSummary(mockReflection);

    logTest("formatReflectionSummary returns string", typeof summary === "string");
    logTest("Contains overall quality", summary.includes("8/10"));
    logTest("Contains high quality count", summary.includes("High Quality"));
    logTest("Contains low quality count", summary.includes("Low Quality"));
    logTest("Contains summary text", summary.includes("Overall good review"));
  } catch (e) {
    logTest("formatReflectionSummary basic test", false, (e as Error).message);
  }

  // 空の提案リスト
  try {
    const emptyReflection: ReflectionResult = {
      overallQuality: 10,
      suggestions: [],
      summary: "No comments to review",
    };

    const summary = formatReflectionSummary(emptyReflection);
    logTest("formatReflectionSummary handles empty suggestions", summary.includes("10/10"));
  } catch (e) {
    logTest("formatReflectionSummary handles empty suggestions", false, (e as Error).message);
  }
}

// ========================================
// filterCommentsByReflection テスト
// ========================================

async function testFilterCommentsByReflection() {
  console.log("\n🔍 filterCommentsByReflection テスト");

  const mockComments: InlineComment[] = [
    { path: "file1.ts", endLine: 10, body: "Critical bug", severity: "CRITICAL" },
    { path: "file2.ts", endLine: 20, body: "Style issue", severity: "NITPICK" },
    { path: "file3.ts", endLine: 30, body: "Important", severity: "IMPORTANT" },
    { path: "file4.ts", endLine: 40, body: "Info only", severity: "INFO" },
  ];

  const mockReflection: ReflectionResult = {
    overallQuality: 7,
    suggestions: [
      { index: 0, score: 9, isRelevant: true, reasoning: "Valid critical issue" },
      { index: 1, score: 4, isRelevant: false, reasoning: "Too nitpicky" },
      { index: 2, score: 8, isRelevant: true, reasoning: "Good point" },
      { index: 3, score: 6, isRelevant: true, reasoning: "Borderline useful" },
    ],
    summary: "Mixed quality",
  };

  // デフォルト閾値（7）でフィルタリング
  try {
    const result = filterCommentsByReflection(mockComments, mockReflection);

    logTest("filterCommentsByReflection returns accepted array", Array.isArray(result.accepted));
    logTest("filterCommentsByReflection returns rejected array", Array.isArray(result.rejected));
    logTest("Accepted count is 2 (score >= 7 & isRelevant)", result.accepted.length === 2);
    logTest("Rejected count is 2", result.rejected.length === 2);
    logTest("Critical bug is accepted", result.accepted.some(c => c.body === "Critical bug"));
    logTest("Style issue is rejected", result.rejected.some(r => r.comment.body === "Style issue"));
  } catch (e) {
    logTest("filterCommentsByReflection default threshold", false, (e as Error).message);
  }

  // カスタム閾値（5）でフィルタリング
  try {
    const result = filterCommentsByReflection(mockComments, mockReflection, 5);

    logTest("Custom threshold accepts more comments", result.accepted.length === 3);
    logTest("Custom threshold rejects fewer comments", result.rejected.length === 1);
  } catch (e) {
    logTest("filterCommentsByReflection custom threshold", false, (e as Error).message);
  }

  // 空のコメントリスト
  try {
    const emptyReflection: ReflectionResult = {
      overallQuality: 10,
      suggestions: [],
      summary: "Empty",
    };

    const result = filterCommentsByReflection([], emptyReflection);
    logTest("filterCommentsByReflection handles empty input", result.accepted.length === 0 && result.rejected.length === 0);
  } catch (e) {
    logTest("filterCommentsByReflection handles empty input", false, (e as Error).message);
  }
}

// ========================================
// reflectOnReview テスト（モック）
// ========================================

async function testReflectOnReview() {
  console.log("\n🤔 reflectOnReview テスト");

  // 空のコメントリストの場合
  try {
    const result = await reflectOnReview({
      prTitle: "Test PR",
      prBody: "Test body",
      diffContent: "diff content",
      comments: [],
    });

    logTest("reflectOnReview handles empty comments", result.overallQuality === 10);
    logTest("reflectOnReview returns empty suggestions for empty comments", result.suggestions.length === 0);
    logTest("reflectOnReview returns appropriate summary for empty comments", result.summary === "レビューコメントなし");
  } catch (e) {
    logTest("reflectOnReview handles empty comments", false, (e as Error).message);
  }

  // 実際のAI呼び出しはスキップ（APIキーが必要なため）
  console.log("  ⏭️ AI呼び出しテストはスキップ（APIキーが必要）");
}

// ========================================
// applyReflection テスト
// ========================================

async function testApplyReflection() {
  console.log("\n🔄 applyReflection テスト");

  const mockComments: InlineComment[] = [
    { path: "file1.ts", endLine: 10, body: "Comment 1", severity: "INFO" },
    { path: "file2.ts", endLine: 20, body: "Comment 2", severity: "INFO" },
  ];

  // コメントが少ない場合（2件以下）はスキップ
  try {
    const result = await applyReflection({
      prTitle: "Test PR",
      prBody: "Test body",
      diffContent: "diff content",
      comments: mockComments,
    });

    logTest("applyReflection skips for <= 2 comments", result.filtered === false);
    logTest("applyReflection returns original comments when skipped", result.comments.length === 2);
    logTest("applyReflection returns undefined reflection when skipped", result.reflection === undefined);
  } catch (e) {
    logTest("applyReflection skips for <= 2 comments", false, (e as Error).message);
  }

  // 空のコメント
  try {
    const result = await applyReflection({
      prTitle: "Test PR",
      prBody: "Test body",
      diffContent: "diff content",
      comments: [],
    });

    logTest("applyReflection handles empty comments", result.comments.length === 0);
    logTest("applyReflection returns filtered=false for empty", result.filtered === false);
  } catch (e) {
    logTest("applyReflection handles empty comments", false, (e as Error).message);
  }
}

// ========================================
// 統合テスト
// ========================================

async function testIntegration() {
  console.log("\n🔗 統合テスト");

  // 反省結果からフィルタリングまでの一連の流れ
  try {
    const mockComments: InlineComment[] = [
      { path: "src/index.ts", endLine: 15, body: "Security vulnerability", severity: "CRITICAL", suggestion: "Use parameterized query" },
      { path: "src/utils.ts", endLine: 42, body: "Missing null check", severity: "IMPORTANT" },
      { path: "src/styles.css", endLine: 5, body: "Consider using rem", severity: "NITPICK" },
    ];

    const mockReflection: ReflectionResult = {
      overallQuality: 7,
      suggestions: [
        { index: 0, score: 10, isRelevant: true, reasoning: "Critical security issue" },
        { index: 1, score: 8, isRelevant: true, reasoning: "Good defensive coding" },
        { index: 2, score: 3, isRelevant: false, reasoning: "Subjective style preference" },
      ],
      summary: "2 out of 3 suggestions are valuable",
    };

    // フィルタリング
    const filtered = filterCommentsByReflection(mockComments, mockReflection);

    // サマリー生成
    const summary = formatReflectionSummary(mockReflection);

    logTest("Integration: Critical comment preserved", filtered.accepted.some(c => c.severity === "CRITICAL"));
    logTest("Integration: Nitpick filtered out", filtered.rejected.some(r => r.comment.severity === "NITPICK"));
    logTest("Integration: Summary generated", summary.length > 0);
    logTest("Integration: Accepted count correct", filtered.accepted.length === 2);
  } catch (e) {
    logTest("Integration test", false, (e as Error).message);
  }
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Phase 1: Self-Reflection Protocol テスト  ║");
  console.log("╚════════════════════════════════════════════╝");

  // 環境変数の確認
  console.log("\n📋 環境設定:");
  console.log(`  - AI_REFLECTION_ENABLED: ${process.env.AI_REFLECTION_ENABLED ?? "(default: true)"}`);
  console.log(`  - AI_REFLECTION_THRESHOLD: ${process.env.AI_REFLECTION_THRESHOLD ?? "(default: 7)"}`);

  await testUtilityFunctions();
  await testFormatReflectionSummary();
  await testFilterCommentsByReflection();
  await testReflectOnReview();
  await testApplyReflection();
  await testIntegration();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 1 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
