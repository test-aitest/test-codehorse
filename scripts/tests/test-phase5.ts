/**
 * Phase 5: マルチチャンク処理 テスト
 *
 * チャンキング・並列処理・結果マージ機能のテストを実行
 */

import type { ParsedFile } from "../../src/lib/diff/types";
import type { InlineComment, ReviewResult } from "../../src/lib/ai/schemas";
import { getRelevanceCategory } from "../../src/lib/ai/schemas";
import {
  needsChunking,
  createChunks,
  buildChunkContext,
  formatChunkingSummary,
  isChunkingEnabled,
  getChunkConfigFromEnv,
  type ChunkConfig,
  type DiffChunk,
} from "../../src/lib/ai/chunking/chunk-processor";
import {
  deduplicateComments,
  mergeChunkResults,
  formatMergeSummary,
  shouldMergeResults,
  type ChunkReviewResult,
} from "../../src/lib/ai/chunking/result-merger";

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

function createMockFile(path: string, additions: number, deletions: number): ParsedFile {
  // ParsedChange型に準拠したchanges配列を作成
  const changes: Array<{
    type: "insert" | "delete" | "normal";
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
    diffPosition: number;
  }> = [];

  let diffPosition = 1;
  let oldLine = 1;
  let newLine = 1;

  // 削除行
  for (let i = 0; i < deletions; i++) {
    changes.push({
      type: "delete",
      content: `deleted line ${i + 1}`,
      oldLineNumber: oldLine++,
      diffPosition: diffPosition++,
    });
  }

  // 追加行
  for (let i = 0; i < additions; i++) {
    changes.push({
      type: "insert",
      content: `added line ${i + 1}`,
      newLineNumber: newLine++,
      diffPosition: diffPosition++,
    });
  }

  const hunks = [{
    oldStart: 1,
    oldLines: deletions || 1,
    newStart: 1,
    newLines: additions || 1,
    content: `@@ -1,${deletions || 1} +1,${additions || 1} @@`,
    changes,
  }];

  return {
    oldPath: path,
    newPath: path,
    type: "modify" as const,
    additions,
    deletions,
    hunks,
  };
}

function createMockDiff(files: ParsedFile[]): string {
  return files.map(f => {
    const changeLines = f.hunks.flatMap(h =>
      h.changes.map(c => {
        if (c.type === "insert") return `+${c.content}`;
        if (c.type === "delete") return `-${c.content}`;
        return ` ${c.content}`;
      })
    );

    return `diff --git a/${f.oldPath} b/${f.newPath}\n` +
      `--- a/${f.oldPath}\n` +
      `+++ b/${f.newPath}\n` +
      `@@ -1,${f.deletions || 1} +1,${f.additions || 1} @@\n` +
      changeLines.join("\n");
  }).join("\n\n");
}

function createMockComment(
  path: string,
  line: number,
  body: string,
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
  score: number = 7
): InlineComment {
  return {
    path,
    endLine: line,
    startLine: null,
    body,
    severity,
    suggestion: "",
    suggestionStartLine: null,
    suggestionEndLine: null,
    relevanceScore: score,
    relevanceCategory: getRelevanceCategory(score),
  };
}

// ========================================
// 設定テスト
// ========================================

function testConfiguration() {
  console.log("\n⚙️ 設定テスト");

  const config = getChunkConfigFromEnv();
  logTest("maxTokensPerChunk is a number", typeof config.maxTokensPerChunk === "number");
  logTest("overlapTokens is a number", typeof config.overlapTokens === "number");
  logTest("parallelChunks is a number", typeof config.parallelChunks === "number");
  logTest("minFilesForChunking is a number", typeof config.minFilesForChunking === "number");

  const enabled = isChunkingEnabled();
  logTest("isChunkingEnabled returns boolean", typeof enabled === "boolean");
}

// ========================================
// needsChunking テスト
// ========================================

function testNeedsChunking() {
  console.log("\n📊 needsChunking テスト");

  // 少ないファイル数 → チャンク不要
  const fewFiles = [createMockFile("a.ts", 10, 5)];
  const fewFilesDiff = createMockDiff(fewFiles);
  logTest("Few files don't need chunking", needsChunking(fewFiles, fewFilesDiff) === false);

  // 多いファイル数だがトークン数少ない → チャンク不要
  const manySmallFiles = Array(5).fill(null).map((_, i) => createMockFile(`file${i}.ts`, 5, 2));
  const smallDiff = createMockDiff(manySmallFiles);
  logTest("Many small files don't need chunking", needsChunking(manySmallFiles, smallDiff) === false);

  // カスタム設定でテスト
  const lowThresholdConfig: ChunkConfig = {
    maxTokensPerChunk: 10, // 非常に低い閾値
    overlapTokens: 0,
    parallelChunks: 2,
    minFilesForChunking: 2,
  };

  const threeFiles = Array(3).fill(null).map((_, i) => createMockFile(`file${i}.ts`, 20, 10));
  const threeDiff = createMockDiff(threeFiles);
  logTest("Low threshold triggers chunking", needsChunking(threeFiles, threeDiff, lowThresholdConfig) === true);
}

// ========================================
// createChunks テスト
// ========================================

function testCreateChunks() {
  console.log("\n📦 createChunks テスト");

  // チャンキング不要のケース
  const smallFiles = [createMockFile("a.ts", 10, 5)];
  const smallDiff = createMockDiff(smallFiles);
  const smallResult = createChunks(smallFiles, smallDiff);

  logTest("Small files: needsChunking is false", smallResult.needsChunking === false);
  logTest("Small files: 1 chunk", smallResult.chunks.length === 1);
  logTest("Small files: chunk has correct files", smallResult.chunks[0].files.length === 1);
  logTest("Small files: chunk isFirst is true", smallResult.chunks[0].isFirst === true);
  logTest("Small files: chunk isLast is true", smallResult.chunks[0].isLast === true);

  // チャンキング必要のケース（低閾値でテスト）
  const lowThresholdConfig: Partial<ChunkConfig> = {
    maxTokensPerChunk: 50,
    minFilesForChunking: 2,
  };

  const manyFiles = Array(6).fill(null).map((_, i) => createMockFile(`dir${i % 2}/file${i}.ts`, 30, 15));
  const manyDiff = createMockDiff(manyFiles);
  const chunkedResult = createChunks(manyFiles, manyDiff, lowThresholdConfig);

  logTest("Many files: needsChunking is true", chunkedResult.needsChunking === true);
  logTest("Many files: multiple chunks created", chunkedResult.chunks.length > 1);
  logTest("Many files: first chunk isFirst", chunkedResult.chunks[0].isFirst === true);
  logTest("Many files: first chunk isLast is false", chunkedResult.chunks[0].isLast === false);
  logTest("Many files: last chunk isLast", chunkedResult.chunks[chunkedResult.chunks.length - 1].isLast === true);
  logTest("Many files: totalChunks correct", chunkedResult.chunks[0].totalChunks === chunkedResult.chunks.length);

  // 統計情報
  logTest("Stats: avgTokensPerChunk exists", typeof chunkedResult.stats.avgTokensPerChunk === "number");
  logTest("Stats: maxTokensInChunk exists", typeof chunkedResult.stats.maxTokensInChunk === "number");
  logTest("Stats: minTokensInChunk exists", typeof chunkedResult.stats.minTokensInChunk === "number");
}

// ========================================
// buildChunkContext テスト
// ========================================

function testBuildChunkContext() {
  console.log("\n🔗 buildChunkContext テスト");

  const files1 = [createMockFile("src/a.ts", 10, 5)];
  const files2 = [createMockFile("src/b.ts", 15, 8)];

  const chunk1: DiffChunk = {
    id: "chunk-0",
    index: 0,
    files: files1,
    diffContent: createMockDiff(files1),
    tokenCount: 100,
    isFirst: true,
    isLast: false,
    totalChunks: 2,
  };

  const chunk2: DiffChunk = {
    id: "chunk-1",
    index: 1,
    files: files2,
    diffContent: createMockDiff(files2),
    tokenCount: 120,
    isFirst: false,
    isLast: true,
    totalChunks: 2,
  };

  const allChunks = [chunk1, chunk2];

  // 単一チャンクの場合は空
  const singleChunkContext = buildChunkContext(chunk1, [chunk1]);
  logTest("Single chunk returns empty context", singleChunkContext === "");

  // 複数チャンクの場合はコンテキストが生成される
  const multiChunkContext = buildChunkContext(chunk1, allChunks);
  logTest("Multi-chunk context is not empty", multiChunkContext.length > 0);
  logTest("Context includes chunk info", multiChunkContext.includes("1/2"));
  logTest("Context includes other file", multiChunkContext.includes("src/b.ts"));
}

// ========================================
// deduplicateComments テスト
// ========================================

function testDeduplicateComments() {
  console.log("\n🔍 deduplicateComments テスト");

  // 重複なしのケース
  const uniqueComments: InlineComment[] = [
    createMockComment("a.ts", 10, "First comment", "CRITICAL", 10),
    createMockComment("b.ts", 20, "Second comment", "IMPORTANT", 8),
    createMockComment("c.ts", 30, "Third comment", "INFO", 6),
  ];

  const uniqueResult = deduplicateComments(uniqueComments);
  logTest("No duplicates: all kept", uniqueResult.comments.length === 3);
  logTest("No duplicates: duplicatesRemoved is 0", uniqueResult.duplicatesRemoved === 0);

  // 重複ありのケース（同じファイル、類似テキスト）
  const duplicateComments: InlineComment[] = [
    createMockComment("a.ts", 10, "This is a security vulnerability issue", "CRITICAL", 10),
    createMockComment("a.ts", 10, "This is a security vulnerability problem", "IMPORTANT", 8),
    createMockComment("b.ts", 20, "Different comment", "INFO", 6),
  ];

  const duplicateResult = deduplicateComments(duplicateComments);
  logTest("Duplicates: some removed", duplicateResult.comments.length < 3);
  logTest("Duplicates: duplicatesRemoved > 0", duplicateResult.duplicatesRemoved > 0);
  logTest("Duplicates: higher relevance kept", duplicateResult.comments.some(c => c.relevanceScore === 10));

  // 空配列のケース
  const emptyResult = deduplicateComments([]);
  logTest("Empty array: returns empty", emptyResult.comments.length === 0);
  logTest("Empty array: duplicatesRemoved is 0", emptyResult.duplicatesRemoved === 0);

  // 行オーバーラップのケース
  const overlappingComments: InlineComment[] = [
    createMockComment("a.ts", 10, "Comment about line 10-15", "CRITICAL", 9),
    createMockComment("a.ts", 12, "Comment about line 10-15 range", "IMPORTANT", 7),
  ];

  overlappingComments[0].startLine = 10;
  overlappingComments[1].startLine = 10;

  const overlapResult = deduplicateComments(overlappingComments);
  logTest("Overlapping lines: detected as duplicates", overlapResult.duplicatesRemoved >= 1);
}

// ========================================
// mergeChunkResults テスト
// ========================================

function testMergeChunkResults() {
  console.log("\n🔀 mergeChunkResults テスト");

  const files1 = [createMockFile("src/a.ts", 10, 5)];
  const files2 = [createMockFile("src/b.ts", 15, 8)];

  const chunk1: DiffChunk = {
    id: "chunk-0",
    index: 0,
    files: files1,
    diffContent: createMockDiff(files1),
    tokenCount: 100,
    isFirst: true,
    isLast: false,
    totalChunks: 2,
  };

  const chunk2: DiffChunk = {
    id: "chunk-1",
    index: 1,
    files: files2,
    diffContent: createMockDiff(files2),
    tokenCount: 120,
    isFirst: false,
    isLast: true,
    totalChunks: 2,
  };

  const result1: ReviewResult = {
    summary: "Changes to file A",
    walkthrough: [{ path: "src/a.ts", summary: "Modified A", changeType: "modify" }],
    comments: [createMockComment("src/a.ts", 5, "Issue in A", "CRITICAL", 10)],
  };

  const result2: ReviewResult = {
    summary: "Changes to file B",
    walkthrough: [{ path: "src/b.ts", summary: "Modified B", changeType: "modify" }],
    comments: [createMockComment("src/b.ts", 10, "Issue in B", "IMPORTANT", 8)],
  };

  const chunkResults: ChunkReviewResult[] = [
    { chunk: chunk1, result: result1 },
    { chunk: chunk2, result: result2 },
  ];

  const merged = mergeChunkResults(chunkResults);

  logTest("Merged summary not empty", merged.summary.length > 0);
  logTest("Merged walkthrough has all files", merged.walkthrough.length === 2);
  logTest("Merged comments has all comments", merged.comments.length === 2);
  logTest("Stats: totalChunks correct", merged.stats.totalChunks === 2);
  logTest("Stats: successfulChunks correct", merged.stats.successfulChunks === 2);
  logTest("Stats: failedChunks is 0", merged.stats.failedChunks === 0);

  // エラーありのケース
  const errorResults: ChunkReviewResult[] = [
    { chunk: chunk1, result: result1 },
    { chunk: chunk2, result: result2, error: new Error("Test error") },
  ];

  const mergedWithError = mergeChunkResults(errorResults);
  logTest("With error: successfulChunks is 1", mergedWithError.stats.successfulChunks === 1);
  logTest("With error: failedChunks is 1", mergedWithError.stats.failedChunks === 1);

  // 全て失敗のケース
  const allErrorResults: ChunkReviewResult[] = [
    { chunk: chunk1, result: result1, error: new Error("Error 1") },
    { chunk: chunk2, result: result2, error: new Error("Error 2") },
  ];

  const allFailed = mergeChunkResults(allErrorResults);
  logTest("All failed: summary indicates failure", allFailed.summary.includes("失敗"));
  logTest("All failed: no comments", allFailed.comments.length === 0);
}

// ========================================
// フォーマット・ユーティリティテスト
// ========================================

function testUtilities() {
  console.log("\n🛠️ ユーティリティテスト");

  // formatChunkingSummary
  const smallFiles = [createMockFile("a.ts", 10, 5)];
  const smallDiff = createMockDiff(smallFiles);
  const smallResult = createChunks(smallFiles, smallDiff);
  const smallSummary = formatChunkingSummary(smallResult);
  logTest("formatChunkingSummary: not needed case", smallSummary.includes("Not needed"));

  // formatMergeSummary
  const files = [createMockFile("a.ts", 10, 5)];
  const chunk: DiffChunk = {
    id: "chunk-0",
    index: 0,
    files,
    diffContent: createMockDiff(files),
    tokenCount: 100,
    isFirst: true,
    isLast: true,
    totalChunks: 1,
  };

  const result: ReviewResult = {
    summary: "Test",
    walkthrough: [],
    comments: [createMockComment("a.ts", 10, "Test", "INFO", 5)],
  };

  const merged = mergeChunkResults([{ chunk, result }]);
  const mergeSummary = formatMergeSummary(merged);
  logTest("formatMergeSummary: includes chunk count", mergeSummary.includes("1/1"));

  // shouldMergeResults
  logTest("shouldMergeResults: false for 1 chunk", shouldMergeResults(1) === false);
  logTest("shouldMergeResults: true for 2+ chunks", shouldMergeResults(2) === true);
}

// ========================================
// 統合テスト
// ========================================

function testIntegration() {
  console.log("\n🔗 統合テスト");

  // 完全なワークフローをシミュレート
  const files = Array(4).fill(null).map((_, i) =>
    createMockFile(`src/module${i}/file.ts`, 50, 25)
  );
  const diff = createMockDiff(files);

  // 低閾値でチャンキングを強制
  const config: Partial<ChunkConfig> = {
    maxTokensPerChunk: 100,
    minFilesForChunking: 2,
  };

  // チャンク作成
  const chunkResult = createChunks(files, diff, config);
  logTest("Integration: chunks created", chunkResult.chunks.length >= 1);

  // 各チャンクからレビュー結果を模擬
  const chunkReviewResults: ChunkReviewResult[] = chunkResult.chunks.map((chunk, idx) => ({
    chunk,
    result: {
      summary: `Review for chunk ${idx + 1}`,
      walkthrough: chunk.files.map(f => ({
        path: f.newPath,
        summary: `Changes to ${f.newPath}`,
        changeType: "modify" as const,
      })),
      comments: [
        createMockComment(chunk.files[0].newPath, 10, `Issue in chunk ${idx + 1}`, "IMPORTANT", 8),
      ],
    },
  }));

  // マージ
  const merged = mergeChunkResults(chunkReviewResults);

  logTest("Integration: all chunks successful", merged.stats.successfulChunks === chunkResult.chunks.length);
  logTest("Integration: walkthrough complete", merged.walkthrough.length === files.length);
  logTest("Integration: comments merged", merged.comments.length >= 1);

  // コメントのソート確認（深刻度→スコア順）
  const sortedCorrectly = merged.comments.every((c, i) => {
    if (i === 0) return true;
    const prev = merged.comments[i - 1];
    const severityOrder: Record<string, number> = { CRITICAL: 4, IMPORTANT: 3, INFO: 2, NITPICK: 1 };
    return (severityOrder[prev.severity] ?? 0) >= (severityOrder[c.severity] ?? 0);
  });
  logTest("Integration: comments sorted by severity", sortedCorrectly);
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Phase 5: マルチチャンク処理 テスト       ║");
  console.log("╚════════════════════════════════════════════╝");

  // 環境設定
  console.log("\n📋 環境設定:");
  console.log(`  - AI_CHUNKING_ENABLED: ${process.env.AI_CHUNKING_ENABLED ?? "(default: true)"}`);
  console.log(`  - AI_MAX_TOKENS_PER_CHUNK: ${process.env.AI_MAX_TOKENS_PER_CHUNK ?? "(default: 50000)"}`);
  console.log(`  - AI_PARALLEL_CHUNKS: ${process.env.AI_PARALLEL_CHUNKS ?? "(default: 3)"}`);

  testConfiguration();
  testNeedsChunking();
  testCreateChunks();
  testBuildChunkContext();
  testDeduplicateComments();
  testMergeChunkResults();
  testUtilities();
  testIntegration();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 5 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
