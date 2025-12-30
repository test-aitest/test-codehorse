/**
 * Phase 4: 関連性スコアリング テスト
 *
 * スコアリング・フィルタリング機能のテストを実行
 */

import {
  getRelevanceCategory,
  filterByRelevanceScore,
  type InlineComment,
} from "../../src/lib/ai/schemas";
import { getMinRelevanceScore, RELEVANCE_THRESHOLDS } from "../../src/lib/ai/constants";
import {
  formatRelevanceScore,
  getRelevanceCategoryEmoji,
  formatInlineCommentWithSuggestion,
} from "../../src/lib/github/suggestion-formatter";

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

// モックコメント作成ヘルパー
function createComment(
  path: string,
  endLine: number,
  body: string,
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
  relevanceScore: number
): InlineComment {
  return {
    path,
    endLine,
    startLine: null,
    body,
    severity,
    suggestion: "",
    suggestionStartLine: null,
    suggestionEndLine: null,
    relevanceScore,
    relevanceCategory: getRelevanceCategory(relevanceScore),
  };
}

// ========================================
// 設定テスト
// ========================================

function testConfiguration() {
  console.log("\n⚙️ 設定テスト");

  const minScore = getMinRelevanceScore();
  logTest("getMinRelevanceScore() is a number", typeof minScore === "number");
  logTest("RELEVANCE_THRESHOLDS.HIGH is 9", RELEVANCE_THRESHOLDS.HIGH === 9);
  logTest("RELEVANCE_THRESHOLDS.MEDIUM is 7", RELEVANCE_THRESHOLDS.MEDIUM === 7);
  logTest("minScore is between 1-10", minScore >= 1 && minScore <= 10);
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
// filterByRelevanceScore テスト
// ========================================

function testFilterByRelevanceScore() {
  console.log("\n🔍 filterByRelevanceScore テスト");

  const comments: InlineComment[] = [
    createComment("a.ts", 1, "Critical bug", "CRITICAL", 10),
    createComment("b.ts", 2, "Important", "IMPORTANT", 7),
    createComment("c.ts", 3, "Info", "INFO", 5),
    createComment("d.ts", 4, "Nitpick", "NITPICK", 3),
  ];

  // デフォルト閾値（5）でフィルタリング
  const result1 = filterByRelevanceScore(comments, 5);
  logTest("Filters correctly with minScore 5", result1.accepted.length === 3);
  logTest("Filters low score comment", result1.filtered.length === 1);
  logTest("Filtered comment has score 3", result1.filtered[0].relevanceScore === 3);

  // 閾値7でフィルタリング
  const result2 = filterByRelevanceScore(comments, 7);
  logTest("Filters correctly with minScore 7", result2.accepted.length === 2);

  // 閾値10でフィルタリング
  const result3 = filterByRelevanceScore(comments, 10);
  logTest("Filters correctly with minScore 10", result3.accepted.length === 1);

  // 空配列
  const result4 = filterByRelevanceScore([], 5);
  logTest("Handles empty array", result4.accepted.length === 0 && result4.filtered.length === 0);
}

// ========================================
// formatRelevanceScore テスト
// ========================================

function testFormatRelevanceScore() {
  console.log("\n📝 formatRelevanceScore テスト");

  // スコアとカテゴリあり
  const formatted1 = formatRelevanceScore(9, "HIGH");
  logTest("Formats score with category", formatted1.includes("9/10") && formatted1.includes("HIGH"));

  // スコアとカテゴリあり（MEDIUM）
  const formatted2 = formatRelevanceScore(5, "LOW");
  logTest("Formats score with LOW category", formatted2.includes("5/10") && formatted2.includes("LOW"));
}

// ========================================
// getRelevanceCategoryEmoji テスト
// ========================================

function testGetRelevanceCategoryEmoji() {
  console.log("\n😀 getRelevanceCategoryEmoji テスト");

  logTest("HIGH has emoji", getRelevanceCategoryEmoji("HIGH") !== "");
  logTest("MEDIUM has emoji", getRelevanceCategoryEmoji("MEDIUM") !== "");
  logTest("LOW has emoji", getRelevanceCategoryEmoji("LOW") !== "");
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
    suggestion: "",
    relevanceScore: 10,
    relevanceCategory: "HIGH",
  });
  logTest("Includes severity", comment1.includes("CRITICAL"));
  logTest("Includes relevance score", comment1.includes("10/10"));
  logTest("Includes relevance category", comment1.includes("HIGH"));
  logTest("Includes body", comment1.includes("This is a bug"));

  // Suggestionあり
  const comment2 = formatInlineCommentWithSuggestion({
    body: "Consider this",
    severity: "IMPORTANT",
    suggestion: "const x = 1;",
    relevanceScore: 8,
    relevanceCategory: "MEDIUM",
  });
  logTest("Includes suggestion block", comment2.includes("```suggestion"));
  logTest("Includes suggestion code", comment2.includes("const x = 1;"));
}

// ========================================
// 統合テスト
// ========================================

function testIntegration() {
  console.log("\n🔗 統合テスト");

  // 完全なフローをテスト
  const comments: InlineComment[] = [
    createComment("security.ts", 42, "SQL injection vulnerability", "CRITICAL", 10),
    createComment("perf.ts", 100, "N+1 query issue", "IMPORTANT", 8),
    createComment("style.ts", 50, "Consider using const", "NITPICK", 4),
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
      suggestion: securityComment.suggestion,
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
  console.log(`  - Current minScore: ${getMinRelevanceScore()}`);

  testConfiguration();
  testGetRelevanceCategory();
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
