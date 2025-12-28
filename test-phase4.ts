/**
 * Phase 4: 関連性スコアリング テスト
 *
 * スコアリング・フィルタリング機能のテストを実行
 */

import {
  getRelevanceCategory,
  enrichCommentWithCategory,
  filterByRelevanceScore,
  RELEVANCE_CONFIG,
  type InlineComment,
  type RelevanceCategory,
} from "./src/lib/ai/schemas";
import {
  formatRelevanceScore,
  getRelevanceCategoryEmoji,
  formatInlineCommentWithSuggestion,
} from "./src/lib/github/suggestion-formatter";

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
// 設定テスト
// ========================================

function testConfiguration() {
  console.log("\n⚙️ 設定テスト");

  logTest("RELEVANCE_CONFIG.minScore is a number", typeof RELEVANCE_CONFIG.minScore === "number");
  logTest("RELEVANCE_CONFIG.highThreshold is 9", RELEVANCE_CONFIG.highThreshold === 9);
  logTest("RELEVANCE_CONFIG.mediumThreshold is 7", RELEVANCE_CONFIG.mediumThreshold === 7);
  logTest("minScore is between 1-10", RELEVANCE_CONFIG.minScore >= 1 && RELEVANCE_CONFIG.minScore <= 10);
}

// ========================================
// カテゴリ判定テスト
// ========================================

function testGetRelevanceCategory() {
  console.log("\n📊 getRelevanceCategory テスト");

  // HIGH (9-10)
  logTest("Score 10 is HIGH", getRelevanceCategory(10) === "HIGH");
  logTest("Score 9 is HIGH", getRelevanceCategory(9) === "HIGH");

  // MEDIUM (7-8)
  logTest("Score 8 is MEDIUM", getRelevanceCategory(8) === "MEDIUM");
  logTest("Score 7 is MEDIUM", getRelevanceCategory(7) === "MEDIUM");

  // LOW (1-6)
  logTest("Score 6 is LOW", getRelevanceCategory(6) === "LOW");
  logTest("Score 5 is LOW", getRelevanceCategory(5) === "LOW");
  logTest("Score 1 is LOW", getRelevanceCategory(1) === "LOW");
}

// ========================================
// enrichCommentWithCategory テスト
// ========================================

function testEnrichCommentWithCategory() {
  console.log("\n🏷️ enrichCommentWithCategory テスト");

  // スコアあり、カテゴリなし
  const comment1: InlineComment = {
    path: "test.ts",
    endLine: 10,
    body: "Test comment",
    severity: "INFO",
    relevanceScore: 9,
  };
  const enriched1 = enrichCommentWithCategory(comment1);
  logTest("Adds HIGH category for score 9", enriched1.relevanceCategory === "HIGH");

  // スコアなし
  const comment2: InlineComment = {
    path: "test.ts",
    endLine: 10,
    body: "Test comment",
    severity: "INFO",
  };
  const enriched2 = enrichCommentWithCategory(comment2);
  logTest("No category added when no score", enriched2.relevanceCategory === undefined);

  // カテゴリ既存
  const comment3: InlineComment = {
    path: "test.ts",
    endLine: 10,
    body: "Test comment",
    severity: "INFO",
    relevanceScore: 9,
    relevanceCategory: "LOW", // Already set
  };
  const enriched3 = enrichCommentWithCategory(comment3);
  logTest("Preserves existing category", enriched3.relevanceCategory === "LOW");
}

// ========================================
// filterByRelevanceScore テスト
// ========================================

function testFilterByRelevanceScore() {
  console.log("\n🔍 filterByRelevanceScore テスト");

  const comments: InlineComment[] = [
    { path: "a.ts", endLine: 1, body: "Critical bug", severity: "CRITICAL", relevanceScore: 10 },
    { path: "b.ts", endLine: 2, body: "Important", severity: "IMPORTANT", relevanceScore: 7 },
    { path: "c.ts", endLine: 3, body: "Info", severity: "INFO", relevanceScore: 5 },
    { path: "d.ts", endLine: 4, body: "Nitpick", severity: "NITPICK", relevanceScore: 3 },
    { path: "e.ts", endLine: 5, body: "No score", severity: "INFO" }, // No relevanceScore
  ];

  // デフォルト閾値（5）でフィルタリング
  const result1 = filterByRelevanceScore(comments, 5);
  logTest("Filters correctly with minScore 5", result1.accepted.length === 4);
  logTest("Filters low score comment", result1.filtered.length === 1);
  logTest("Filtered comment has score 3", result1.filtered[0].relevanceScore === 3);

  // 閾値7でフィルタリング
  const result2 = filterByRelevanceScore(comments, 7);
  logTest("Filters correctly with minScore 7", result2.accepted.length === 3);
  logTest("Accepts comments without score", result2.accepted.some(c => c.relevanceScore === undefined));

  // 閾値10でフィルタリング
  const result3 = filterByRelevanceScore(comments, 10);
  logTest("Filters correctly with minScore 10", result3.accepted.length === 2); // score 10 + no score

  // 空配列
  const result4 = filterByRelevanceScore([], 5);
  logTest("Handles empty array", result4.accepted.length === 0 && result4.filtered.length === 0);

  // カテゴリが付与されているか確認
  const result5 = filterByRelevanceScore(comments, 1);
  const hasCategories = result5.accepted.filter(c => c.relevanceScore !== undefined).every(c => c.relevanceCategory !== undefined);
  logTest("Enriches comments with category", hasCategories);
}

// ========================================
// formatRelevanceScore テスト
// ========================================

function testFormatRelevanceScore() {
  console.log("\n📝 formatRelevanceScore テスト");

  // スコアとカテゴリあり
  const formatted1 = formatRelevanceScore(9, "HIGH");
  logTest("Formats score with category", formatted1.includes("9/10") && formatted1.includes("HIGH"));

  // スコアのみ
  const formatted2 = formatRelevanceScore(5, undefined);
  logTest("Formats score without category", formatted2.includes("5/10"));

  // スコアなし
  const formatted3 = formatRelevanceScore(undefined, undefined);
  logTest("Returns empty for undefined score", formatted3 === "");
}

// ========================================
// getRelevanceCategoryEmoji テスト
// ========================================

function testGetRelevanceCategoryEmoji() {
  console.log("\n😀 getRelevanceCategoryEmoji テスト");

  logTest("HIGH has emoji", getRelevanceCategoryEmoji("HIGH") !== "");
  logTest("MEDIUM has emoji", getRelevanceCategoryEmoji("MEDIUM") !== "");
  logTest("LOW has emoji", getRelevanceCategoryEmoji("LOW") !== "");
  logTest("Undefined returns empty", getRelevanceCategoryEmoji(undefined) === "");
}

// ========================================
// formatInlineCommentWithSuggestion テスト
// ========================================

function testFormatInlineCommentWithSuggestion() {
  console.log("\n💬 formatInlineCommentWithSuggestion テスト");

  // スコアあり
  const comment1 = formatInlineCommentWithSuggestion({
    body: "This is a bug",
    severity: "CRITICAL",
    relevanceScore: 10,
    relevanceCategory: "HIGH",
  });
  logTest("Includes severity", comment1.includes("CRITICAL"));
  logTest("Includes relevance score", comment1.includes("10/10"));
  logTest("Includes relevance category", comment1.includes("HIGH"));
  logTest("Includes body", comment1.includes("This is a bug"));

  // スコアなし
  const comment2 = formatInlineCommentWithSuggestion({
    body: "Just a note",
    severity: "INFO",
  });
  logTest("Works without score", comment2.includes("INFO") && comment2.includes("Just a note"));
  logTest("No relevance info when no score", !comment2.includes("Relevance"));

  // Suggestionあり
  const comment3 = formatInlineCommentWithSuggestion({
    body: "Consider this",
    severity: "IMPORTANT",
    suggestion: "const x = 1;",
    relevanceScore: 8,
    relevanceCategory: "MEDIUM",
  });
  logTest("Includes suggestion block", comment3.includes("```suggestion"));
  logTest("Includes suggestion code", comment3.includes("const x = 1;"));
}

// ========================================
// 統合テスト
// ========================================

function testIntegration() {
  console.log("\n🔗 統合テスト");

  // 完全なフローをテスト
  const comments: InlineComment[] = [
    { path: "security.ts", endLine: 42, body: "SQL injection vulnerability", severity: "CRITICAL", relevanceScore: 10 },
    { path: "perf.ts", endLine: 100, body: "N+1 query issue", severity: "IMPORTANT", relevanceScore: 8 },
    { path: "style.ts", endLine: 50, body: "Consider using const", severity: "NITPICK", relevanceScore: 4 },
  ];

  // フィルタリング
  const filtered = filterByRelevanceScore(comments, 5);

  logTest("Integration: Filters low score", filtered.accepted.length === 2);
  logTest("Integration: Security issue kept", filtered.accepted.some(c => c.path === "security.ts"));
  logTest("Integration: Style issue filtered", filtered.filtered.some(c => c.path === "style.ts"));

  // 採用されたコメントにカテゴリが付いている
  const securityComment = filtered.accepted.find(c => c.path === "security.ts");
  logTest("Integration: HIGH category assigned", securityComment?.relevanceCategory === "HIGH");

  const perfComment = filtered.accepted.find(c => c.path === "perf.ts");
  logTest("Integration: MEDIUM category assigned", perfComment?.relevanceCategory === "MEDIUM");

  // フォーマット
  if (securityComment) {
    const formatted = formatInlineCommentWithSuggestion({
      body: securityComment.body,
      severity: securityComment.severity,
      relevanceScore: securityComment.relevanceScore,
      relevanceCategory: securityComment.relevanceCategory,
    });
    logTest("Integration: Formatted comment includes all info",
      formatted.includes("CRITICAL") &&
      formatted.includes("10/10") &&
      formatted.includes("HIGH") &&
      formatted.includes("SQL injection")
    );
  }
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║    Phase 4: 関連性スコアリング テスト      ║");
  console.log("╚════════════════════════════════════════════╝");

  // 環境設定
  console.log("\n📋 環境設定:");
  console.log(`  - AI_RELEVANCE_MIN_SCORE: ${process.env.AI_RELEVANCE_MIN_SCORE ?? "(default: 5)"}`);
  console.log(`  - Current minScore: ${RELEVANCE_CONFIG.minScore}`);

  testConfiguration();
  testGetRelevanceCategory();
  testEnrichCommentWithCategory();
  testFilterByRelevanceScore();
  testFormatRelevanceScore();
  testGetRelevanceCategoryEmoji();
  testFormatInlineCommentWithSuggestion();
  testIntegration();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 4 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
