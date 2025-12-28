/**
 * Phase 6: 重複提案検出 テスト
 *
 * 重複検出・マージ・フィルタリング機能のテストを実行
 */

import type { InlineComment } from "./src/lib/ai/schemas";
import {
  calculateJaccardSimilarity,
  calculateCosineSimilarity,
  calculateEditDistanceSimilarity,
  calculateCombinedSimilarity,
  hasLineOverlap,
  isProximate,
  isDuplicate,
  findAllSimilarityMatches,
  selectBetterComment,
  mergeComments,
  deduplicateComments,
  isDeduplicationEnabled,
  getDeduplicationConfigFromEnv,
  formatDeduplicationSummary,
  generateDuplicateReport,
  type DeduplicationConfig,
  DEFAULT_DEDUP_CONFIG,
} from "./src/lib/ai/deduplication";

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
// モックデータ
// ========================================

function createMockComment(
  path: string,
  line: number,
  body: string,
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
  score?: number,
  startLine?: number
): InlineComment {
  return {
    path,
    endLine: line,
    startLine,
    body,
    severity,
    relevanceScore: score,
  };
}

// ========================================
// 類似度計算テスト
// ========================================

function testSimilarityCalculations() {
  console.log("\n📊 類似度計算テスト");

  // Jaccard類似度（ストップワード除去後の比較）
  const jaccard1 = calculateJaccardSimilarity(
    "security vulnerability critical authentication database",
    "security vulnerability critical authentication system"
  );
  logTest("Jaccard: Similar texts have high similarity", jaccard1 > 0.5);

  const jaccard2 = calculateJaccardSimilarity(
    "Security vulnerability",
    "Performance optimization"
  );
  logTest("Jaccard: Different texts have low similarity", jaccard2 < 0.3);

  const jaccard3 = calculateJaccardSimilarity("hello world test", "hello world test");
  logTest("Jaccard: Identical texts have similarity 1.0", jaccard3 === 1.0);

  const jaccard4 = calculateJaccardSimilarity("", "");
  logTest("Jaccard: Empty texts have similarity 1.0", jaccard4 === 1.0);

  // コサイン類似度
  const cosine1 = calculateCosineSimilarity(
    "This function should validate user input",
    "The function needs input validation"
  );
  logTest("Cosine: Similar texts have high similarity", cosine1 > 0.3);

  const cosine2 = calculateCosineSimilarity(
    "Database connection",
    "Frontend rendering"
  );
  logTest("Cosine: Different texts have low similarity", cosine2 < 0.2);

  // 編集距離類似度
  const edit1 = calculateEditDistanceSimilarity(
    "Fix the security bug immediately",
    "Fix the security bug now"
  );
  logTest("Edit distance: Minor changes have high similarity", edit1 > 0.6);

  const edit2 = calculateEditDistanceSimilarity(
    "Short text",
    "Completely different and much longer text here"
  );
  logTest("Edit distance: Different texts have lower similarity", edit2 < 0.5);

  // 複合類似度
  const combined1 = calculateCombinedSimilarity(
    "This is a critical security issue that needs immediate attention",
    "This is a critical security problem requiring immediate attention"
  );
  logTest("Combined: Similar texts detected", combined1 > 0.3);

  const combined2 = calculateCombinedSimilarity(
    "Add error handling",
    "Remove deprecated code"
  );
  logTest("Combined: Different texts detected", combined2 < 0.4);
}

// ========================================
// 行範囲テスト
// ========================================

function testLineRangeChecks() {
  console.log("\n📍 行範囲テスト");

  const comment1 = createMockComment("a.ts", 10, "Test", "INFO", 5, 5);
  const comment2 = createMockComment("a.ts", 8, "Test", "INFO", 5, 6);
  const comment3 = createMockComment("a.ts", 20, "Test", "INFO", 5);
  const comment4 = createMockComment("b.ts", 10, "Test", "INFO", 5, 5);

  // オーバーラップ
  logTest("Line overlap: Overlapping ranges detected", hasLineOverlap(comment1, comment2) === true);
  logTest("Line overlap: Non-overlapping ranges", hasLineOverlap(comment1, comment3) === false);
  logTest("Line overlap: Different files", hasLineOverlap(comment1, comment4) === false);

  // 近接
  logTest("Proximity: Close lines detected", isProximate(comment1, comment2, 5) === true);
  logTest("Proximity: Far lines not proximate", isProximate(comment1, comment3, 5) === false);
  logTest("Proximity: Different files not proximate", isProximate(comment1, comment4, 5) === false);
}

// ========================================
// 重複検出テスト
// ========================================

function testDuplicateDetection() {
  console.log("\n🔍 重複検出テスト");

  const config: DeduplicationConfig = {
    ...DEFAULT_DEDUP_CONFIG,
    similarityThreshold: 0.8,
    considerLineOverlap: true,
    considerProximity: true,
    proximityLines: 5,
  };

  // 完全一致
  const exact1 = createMockComment("a.ts", 10, "This is a security issue", "CRITICAL", 10);
  const exact2 = createMockComment("a.ts", 10, "This is a security issue", "CRITICAL", 10);
  const exactResult = isDuplicate(exact1, exact2, config);
  logTest("Exact match detected", exactResult.isDuplicate === true);
  logTest("Exact match reason", exactResult.reason === "exact_match");

  // テキスト類似
  const similar1 = createMockComment("a.ts", 10, "This function has a security vulnerability that could expose user data", "CRITICAL", 10);
  const similar2 = createMockComment("a.ts", 15, "This function has a security vulnerability which could expose user data", "IMPORTANT", 8);
  const similarResult = isDuplicate(similar1, similar2, config);
  logTest("Text similarity detected", similarResult.isDuplicate === true);
  logTest("High similarity score", similarResult.similarity > 0.7);

  // 異なるファイル
  const diff1 = createMockComment("a.ts", 10, "Same text", "INFO", 5);
  const diff2 = createMockComment("b.ts", 10, "Same text", "INFO", 5);
  const diffResult = isDuplicate(diff1, diff2, config);
  logTest("Different files not duplicate", diffResult.isDuplicate === false);

  // 全く異なるテキスト
  const unique1 = createMockComment("a.ts", 10, "Add error handling for edge cases", "INFO", 5);
  const unique2 = createMockComment("a.ts", 20, "Optimize database query performance", "INFO", 5);
  const uniqueResult = isDuplicate(unique1, unique2, config);
  logTest("Unique texts not duplicate", uniqueResult.isDuplicate === false);
}

// ========================================
// 類似マッチ検出テスト
// ========================================

function testFindAllMatches() {
  console.log("\n🔎 類似マッチ検出テスト");

  const config: DeduplicationConfig = {
    ...DEFAULT_DEDUP_CONFIG,
    similarityThreshold: 0.5, // Lower threshold for testing
    considerProximity: true,
    proximityLines: 10,
  };

  const comments: InlineComment[] = [
    createMockComment("a.ts", 10, "security vulnerability authentication database injection attack", "CRITICAL", 10),
    createMockComment("a.ts", 15, "security vulnerability authentication database injection problem", "CRITICAL", 9),
    createMockComment("b.ts", 20, "Add input validation", "IMPORTANT", 8),
    createMockComment("b.ts", 25, "Add validation for user input", "INFO", 6),
    createMockComment("c.ts", 30, "Improve error handling", "INFO", 5),
  ];

  const matches = findAllSimilarityMatches(comments, config);

  logTest("Found at least one match", matches.length >= 1);
  logTest("Matches sorted by similarity (highest first)",
    matches.length <= 1 || matches[0].similarity >= matches[matches.length - 1].similarity);

  // いくつかのマッチが見つかったことを確認
  logTest("Some matches found", matches.length >= 1);
}

// ========================================
// コメント選択テスト
// ========================================

function testSelectBetterComment() {
  console.log("\n⚖️ コメント選択テスト");

  const config: DeduplicationConfig = {
    ...DEFAULT_DEDUP_CONFIG,
    preserveHighestRelevance: true,
    preserveHighestSeverity: true,
  };

  // 関連性スコアで選択
  const highScore = createMockComment("a.ts", 10, "Important issue", "INFO", 9);
  const lowScore = createMockComment("a.ts", 10, "Important issue", "INFO", 5);
  const scoreResult = selectBetterComment(highScore, lowScore, config);
  logTest("Higher relevance score kept", scoreResult.kept.relevanceScore === 9);

  // 深刻度で選択
  const critical = createMockComment("a.ts", 10, "Issue", "CRITICAL", 5);
  const info = createMockComment("a.ts", 10, "Issue", "INFO", 5);
  const sevResult = selectBetterComment(critical, info, config);
  logTest("Higher severity kept", sevResult.kept.severity === "CRITICAL");

  // 長さで選択
  const long = createMockComment("a.ts", 10, "This is a very detailed explanation of the issue with many words", "INFO", 5);
  const short = createMockComment("a.ts", 10, "Short issue", "INFO", 5);
  const lenResult = selectBetterComment(long, short, config);
  logTest("Longer comment kept", lenResult.kept.body.length > lenResult.removed.body.length);

  // 修正提案で選択
  const withSuggestion = createMockComment("a.ts", 10, "Issue", "INFO", 5);
  withSuggestion.suggestion = "const x = 1;";
  const withoutSuggestion = createMockComment("a.ts", 10, "Issue", "INFO", 5);
  const sugResult = selectBetterComment(withSuggestion, withoutSuggestion, config);
  logTest("Comment with suggestion kept", sugResult.kept.suggestion !== undefined);
}

// ========================================
// コメントマージテスト
// ========================================

function testMergeComments() {
  console.log("\n🔀 コメントマージテスト");

  const comment1 = createMockComment("a.ts", 15, "This is the first issue", "CRITICAL", 9, 10);
  const comment2 = createMockComment("a.ts", 20, "This is the second issue with more details", "IMPORTANT", 7, 12);

  const merged = mergeComments(comment1, comment2);

  logTest("Merged comment exists", merged !== undefined);
  logTest("Merged keeps higher severity", merged.severity === "CRITICAL");
  logTest("Merged has expanded line range", (merged.startLine ?? 0) <= 10);
  logTest("Merged endLine is max", merged.endLine >= 15);

  // 修正提案のマージ
  const noSuggestion = createMockComment("a.ts", 10, "Issue without suggestion", "INFO", 5);
  const hasSuggestion = createMockComment("a.ts", 12, "Issue with suggestion", "INFO", 5);
  hasSuggestion.suggestion = "const fix = true;";
  hasSuggestion.suggestionStartLine = 12;
  hasSuggestion.suggestionEndLine = 12;

  const mergedSuggestion = mergeComments(noSuggestion, hasSuggestion);
  logTest("Suggestion preserved in merge", mergedSuggestion.suggestion !== undefined);
}

// ========================================
// 重複除去テスト
// ========================================

function testDeduplicateComments() {
  console.log("\n🧹 重複除去テスト");

  // 重複なしのケース
  const uniqueComments: InlineComment[] = [
    createMockComment("a.ts", 10, "First unique issue", "CRITICAL", 10),
    createMockComment("b.ts", 20, "Second unique issue", "IMPORTANT", 8),
    createMockComment("c.ts", 30, "Third unique issue", "INFO", 6),
  ];

  const uniqueResult = deduplicateComments(uniqueComments);
  logTest("No duplicates: all kept", uniqueResult.comments.length === 3);
  logTest("No duplicates: duplicatesRemoved is 0", uniqueResult.stats.duplicatesRemoved === 0);

  // 重複ありのケース
  const duplicateComments: InlineComment[] = [
    createMockComment("a.ts", 10, "This is a critical security vulnerability issue", "CRITICAL", 10),
    createMockComment("a.ts", 12, "This is a critical security vulnerability problem", "IMPORTANT", 8),
    createMockComment("b.ts", 20, "Different unique comment", "INFO", 6),
  ];

  const duplicateResult = deduplicateComments(duplicateComments);
  logTest("Duplicates: some removed", duplicateResult.comments.length < 3);
  logTest("Duplicates: duplicatesRemoved > 0", duplicateResult.stats.duplicatesRemoved > 0);
  logTest("Duplicates: higher relevance kept", duplicateResult.comments.some(c => c.relevanceScore === 10));

  // 完全一致のケース
  const exactComments: InlineComment[] = [
    createMockComment("a.ts", 10, "Exact same text", "INFO", 5),
    createMockComment("a.ts", 10, "Exact same text", "INFO", 5),
    createMockComment("a.ts", 10, "Exact same text", "INFO", 5),
  ];

  const exactResult = deduplicateComments(exactComments);
  logTest("Exact matches: reduced to 1", exactResult.comments.length === 1);
  logTest("Exact matches: exact_match reason", exactResult.stats.byReason.exact_match >= 1);

  // 空配列のケース
  const emptyResult = deduplicateComments([]);
  logTest("Empty array: returns empty", emptyResult.comments.length === 0);
  logTest("Empty array: duplicatesRemoved is 0", emptyResult.stats.duplicatesRemoved === 0);

  // 単一コメントのケース
  const singleResult = deduplicateComments([createMockComment("a.ts", 10, "Single", "INFO", 5)]);
  logTest("Single comment: unchanged", singleResult.comments.length === 1);

  // ソート確認
  const sortedComments: InlineComment[] = [
    createMockComment("a.ts", 10, "Info issue", "INFO", 5),
    createMockComment("b.ts", 20, "Critical issue", "CRITICAL", 10),
    createMockComment("c.ts", 30, "Important issue", "IMPORTANT", 8),
  ];

  const sortedResult = deduplicateComments(sortedComments);
  logTest("Sorted by severity (CRITICAL first)", sortedResult.comments[0].severity === "CRITICAL");
}

// ========================================
// 設定テスト
// ========================================

function testConfiguration() {
  console.log("\n⚙️ 設定テスト");

  const config = getDeduplicationConfigFromEnv();
  logTest("similarityThreshold is a number", typeof config.similarityThreshold === "number");
  logTest("similarityThreshold in range", config.similarityThreshold >= 0 && config.similarityThreshold <= 1);
  logTest("considerLineOverlap is boolean", typeof config.considerLineOverlap === "boolean");
  logTest("considerProximity is boolean", typeof config.considerProximity === "boolean");
  logTest("proximityLines is a number", typeof config.proximityLines === "number");

  const enabled = isDeduplicationEnabled();
  logTest("isDeduplicationEnabled returns boolean", typeof enabled === "boolean");
}

// ========================================
// フォーマット・ユーティリティテスト
// ========================================

function testFormatting() {
  console.log("\n📝 フォーマットテスト");

  // サマリーフォーマット
  const result = deduplicateComments([
    createMockComment("a.ts", 10, "Same issue here", "CRITICAL", 10),
    createMockComment("a.ts", 12, "Same issue here", "CRITICAL", 10),
    createMockComment("b.ts", 20, "Different issue", "INFO", 5),
  ]);

  const summary = formatDeduplicationSummary(result);
  logTest("Summary includes counts", summary.includes("→"));
  logTest("Summary is not empty when duplicates", result.stats.duplicatesRemoved > 0 ? summary.length > 10 : true);

  // 重複なしのサマリー
  const noDedup = deduplicateComments([createMockComment("a.ts", 10, "Unique", "INFO", 5)]);
  const noSummary = formatDeduplicationSummary(noDedup);
  logTest("No duplicates summary", noSummary.includes("重複なし"));

  // レポート生成
  const report = generateDuplicateReport(result);
  logTest("Report includes header", report.includes("重複検出レポート") || report.includes("重複グループなし"));
  logTest("Report is not empty", report.length > 0);
}

// ========================================
// 統合テスト
// ========================================

function testIntegration() {
  console.log("\n🔗 統合テスト");

  // 実際のレビューコメントを模擬（より明確な重複パターン）
  const reviewComments: InlineComment[] = [
    // セキュリティ関連 - 完全一致に近い重複
    createMockComment("src/auth/login.ts", 42, "SQL injection vulnerability database query sanitize input attack", "CRITICAL", 10),
    createMockComment("src/auth/login.ts", 45, "SQL injection vulnerability database query sanitize input problem", "CRITICAL", 9),

    // パフォーマンス関連 - 完全一致に近い重複
    createMockComment("src/api/users.ts", 100, "N+1 query problem batch loading database performance optimization", "IMPORTANT", 8),
    createMockComment("src/api/users.ts", 102, "N+1 query problem batch loading database performance issue", "IMPORTANT", 7),

    // ユニークなコメント
    createMockComment("src/utils/format.ts", 20, "Missing null check for input parameter", "INFO", 6),
    createMockComment("src/components/Button.tsx", 15, "Consider using memo for performance", "NITPICK", 4),

    // 完全一致
    createMockComment("src/config/settings.ts", 10, "Same exact comment text here", "INFO", 5),
    createMockComment("src/config/settings.ts", 12, "Same exact comment text here", "INFO", 5),
  ];

  // 低い閾値でテスト
  const result = deduplicateComments(reviewComments, { similarityThreshold: 0.6 });

  logTest("Integration: Reduced comment count", result.comments.length < reviewComments.length);
  logTest("Integration: Some duplicates removed", result.stats.duplicatesRemoved > 0);
  logTest("Integration: Security comment kept", result.comments.some(c => c.path === "src/auth/login.ts"));
  logTest("Integration: Unique comments preserved", result.comments.some(c => c.path === "src/utils/format.ts"));
  logTest("Integration: Results sorted by severity", result.comments[0].severity === "CRITICAL");

  // 重複グループの確認
  logTest("Integration: Duplicate groups created", result.duplicateGroups.length > 0);

  // 高スコアが保持されていることを確認
  const securityComment = result.comments.find(c => c.path === "src/auth/login.ts");
  logTest("Integration: Higher score security comment kept", securityComment?.relevanceScore === 10);

  console.log(`\n  統計: ${result.stats.originalCount} → ${result.stats.finalCount} コメント`);
  console.log(`  除去: ${result.stats.duplicatesRemoved} 件`);
  console.log(`  理由別: 完全一致=${result.stats.byReason.exact_match}, 類似=${result.stats.byReason.text_similarity}, オーバーラップ=${result.stats.byReason.line_overlap}, 近接=${result.stats.byReason.proximity}`);
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║     Phase 6: 重複提案検出 テスト           ║");
  console.log("╚════════════════════════════════════════════╝");

  // 環境設定
  console.log("\n📋 環境設定:");
  console.log(`  - AI_DEDUPLICATION_ENABLED: ${process.env.AI_DEDUPLICATION_ENABLED ?? "(default: true)"}`);
  console.log(`  - AI_DEDUP_SIMILARITY_THRESHOLD: ${process.env.AI_DEDUP_SIMILARITY_THRESHOLD ?? "(default: 0.8)"}`);
  console.log(`  - AI_DEDUP_PROXIMITY_LINES: ${process.env.AI_DEDUP_PROXIMITY_LINES ?? "(default: 5)"}`);

  testSimilarityCalculations();
  testLineRangeChecks();
  testDuplicateDetection();
  testFindAllMatches();
  testSelectBetterComment();
  testMergeComments();
  testDeduplicateComments();
  testConfiguration();
  testFormatting();
  testIntegration();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 6 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
