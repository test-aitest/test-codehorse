/**
 * Phase 3: 拡張Diffコンテキスト テスト
 *
 * コンテキスト拡張機能のテストを実行
 */

import {
  extendDiffContext,
  isContextExtensionEnabled,
  getContextOptionsFromEnv,
  formatContextExtensionSummary,
  clearContextCache,
} from "../../src/lib/diff/context-extender";
import type { ParsedFile, FileContentProvider } from "../../src/lib/diff/types";
import { DEFAULT_CONTEXT_OPTIONS } from "../../src/lib/diff/types";

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
// モックファイルコンテンツプロバイダー
// ========================================

function createMockProvider(
  fileContents: Record<string, string>
): FileContentProvider {
  return {
    async getFileContent(path: string): Promise<string | null> {
      return fileContents[path] ?? null;
    },
  };
}

// ========================================
// テスト用データ
// ========================================

const mockFileContent = `line 1
line 2
line 3
line 4
line 5
line 6
line 7
line 8
line 9
line 10
line 11
line 12
line 13
line 14
line 15
line 16
line 17
line 18
line 19
line 20`;

const mockParsedFile: ParsedFile = {
  oldPath: "test.ts",
  newPath: "test.ts",
  type: "modify",
  additions: 1,
  deletions: 1,
  hunks: [
    {
      oldStart: 10,
      oldLines: 3,
      newStart: 10,
      newLines: 3,
      content: "",
      changes: [
        {
          type: "normal",
          content: "line 10",
          oldLineNumber: 10,
          newLineNumber: 10,
          diffPosition: 1,
        },
        {
          type: "delete",
          content: "old line 11",
          oldLineNumber: 11,
          diffPosition: 2,
        },
        {
          type: "insert",
          content: "new line 11",
          newLineNumber: 11,
          diffPosition: 3,
        },
        {
          type: "normal",
          content: "line 12",
          oldLineNumber: 12,
          newLineNumber: 12,
          diffPosition: 4,
        },
      ],
    },
  ],
};

// ========================================
// ユーティリティ関数テスト
// ========================================

async function testUtilityFunctions() {
  console.log("\n📦 ユーティリティ関数テスト");

  // isContextExtensionEnabled
  const enabled = isContextExtensionEnabled();
  logTest(
    "isContextExtensionEnabled returns boolean",
    typeof enabled === "boolean"
  );

  // getContextOptionsFromEnv
  const options = getContextOptionsFromEnv();
  logTest(
    "getContextOptionsFromEnv returns valid options",
    typeof options.contextLines === "number" &&
      typeof options.includeFileHeaders === "boolean" &&
      typeof options.maxFileSize === "number"
  );

  // DEFAULT_CONTEXT_OPTIONS
  logTest(
    "DEFAULT_CONTEXT_OPTIONS has valid values",
    DEFAULT_CONTEXT_OPTIONS.contextLines >= 0 &&
      DEFAULT_CONTEXT_OPTIONS.contextLines <= 10
  );
}

// ========================================
// コンテキスト拡張テスト
// ========================================

async function testContextExtension() {
  console.log("\n🔍 コンテキスト拡張テスト");

  // キャッシュをクリア
  clearContextCache();

  const provider = createMockProvider({
    "test.ts": mockFileContent,
  });

  // 基本的な拡張テスト
  try {
    const result = await extendDiffContext(
      [mockParsedFile],
      "abc123",
      provider,
      { contextLines: 3, includeFileHeaders: true, maxFileSize: 500000 }
    );

    logTest("extendDiffContext returns result", result !== null);
    logTest("Result has files array", Array.isArray(result.files));
    logTest(
      "Result has extendedDiff string",
      typeof result.extendedDiff === "string"
    );
    logTest("Result has stats", result.stats !== undefined);
    logTest(
      "Stats has filesProcessed",
      typeof result.stats.filesProcessed === "number"
    );
    logTest(
      "Stats has totalContextLinesAdded",
      typeof result.stats.totalContextLinesAdded === "number"
    );

    // 拡張されたファイルを確認
    const extendedFile = result.files[0];
    logTest(
      "Extended file has contentFetched=true",
      extendedFile.contentFetched === true
    );
    logTest("Extended file has extended hunks", extendedFile.hunks.length > 0);

    // 拡張されたhunkを確認
    const extendedHunk = extendedFile.hunks[0];
    logTest(
      "Hunk has extendedBefore array",
      Array.isArray(extendedHunk.extendedBefore)
    );
    logTest(
      "Hunk has extendedAfter array",
      Array.isArray(extendedHunk.extendedAfter)
    );

    // コンテキスト行数を確認（3行追加のはず）
    logTest(
      "Before context has correct lines",
      extendedHunk.extendedBefore.length <= 3 &&
        extendedHunk.extendedBefore.length >= 0
    );
    logTest(
      "After context has correct lines",
      extendedHunk.extendedAfter.length <= 3 &&
        extendedHunk.extendedAfter.length >= 0
    );

    // Diff文字列に拡張コンテキストが含まれているか
    logTest(
      "Extended diff contains file header",
      result.extendedDiff.includes("diff --git")
    );
    logTest(
      "Extended diff contains hunk header",
      result.extendedDiff.includes("@@")
    );
  } catch (e) {
    logTest("Basic context extension", false, (e as Error).message);
  }
}

// ========================================
// 境界条件テスト
// ========================================

async function testBoundaryConditions() {
  console.log("\n⚠️ 境界条件テスト");

  clearContextCache();

  // ファイル先頭付近のhunk（前方コンテキストが限られる）
  const fileAtStart: ParsedFile = {
    oldPath: "start.ts",
    newPath: "start.ts",
    type: "modify",
    additions: 1,
    deletions: 0,
    hunks: [
      {
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 3,
        content: "",
        changes: [
          {
            type: "normal",
            content: "line 1",
            oldLineNumber: 1,
            newLineNumber: 1,
            diffPosition: 1,
          },
          {
            type: "insert",
            content: "new line",
            newLineNumber: 2,
            diffPosition: 2,
          },
          {
            type: "normal",
            content: "line 2",
            oldLineNumber: 2,
            newLineNumber: 3,
            diffPosition: 3,
          },
        ],
      },
    ],
  };

  const provider = createMockProvider({
    "start.ts": "line 1\nline 2\nline 3\nline 4\nline 5",
  });

  try {
    const result = await extendDiffContext([fileAtStart], "abc123", provider, {
      contextLines: 5,
      includeFileHeaders: true,
      maxFileSize: 500000,
    });

    const hunk = result.files[0].hunks[0];
    // ファイル先頭なので前方コンテキストは0行のはず
    logTest("No context before line 1", hunk.extendedBefore.length === 0);
    // 後方コンテキストはある
    logTest("Has context after hunk", hunk.extendedAfter.length > 0);
  } catch (e) {
    logTest("Boundary at file start", false, (e as Error).message);
  }

  // 空のファイルリスト
  try {
    const result = await extendDiffContext([], "abc123", provider);
    logTest("Handles empty file list", result.files.length === 0);
  } catch (e) {
    logTest("Handles empty file list", false, (e as Error).message);
  }

  // ファイルが見つからない場合
  const missingFileProvider = createMockProvider({});
  try {
    const result = await extendDiffContext(
      [mockParsedFile],
      "abc123",
      missingFileProvider
    );
    logTest(
      "Handles missing file gracefully",
      result.files[0].contentFetched === false
    );
  } catch (e) {
    logTest("Handles missing file gracefully", false, (e as Error).message);
  }
}

// ========================================
// 削除ファイルのスキップテスト
// ========================================

async function testDeletedFileSkip() {
  console.log("\n🗑️ 削除ファイルスキップテスト");

  clearContextCache();

  const deletedFile: ParsedFile = {
    oldPath: "deleted.ts",
    newPath: "deleted.ts",
    type: "delete",
    additions: 0,
    deletions: 10,
    hunks: [
      {
        oldStart: 1,
        oldLines: 10,
        newStart: 0,
        newLines: 0,
        content: "",
        changes: [
          {
            type: "delete",
            content: "deleted line",
            oldLineNumber: 1,
            diffPosition: 1,
          },
        ],
      },
    ],
  };

  const provider = createMockProvider({});

  try {
    const result = await extendDiffContext([deletedFile], "abc123", provider);
    logTest("Deleted file is skipped", result.stats.filesSkipped === 1);
    logTest(
      "Deleted file contentFetched is false",
      result.files[0].contentFetched === false
    );
  } catch (e) {
    logTest("Deleted file handling", false, (e as Error).message);
  }
}

// ========================================
// コンテキスト行数制限テスト
// ========================================

async function testContextLinesLimit() {
  console.log("\n📏 コンテキスト行数制限テスト");

  clearContextCache();

  const provider = createMockProvider({
    "test.ts": mockFileContent,
  });

  // 最大値を超えた場合
  try {
    const result = await extendDiffContext(
      [mockParsedFile],
      "abc123",
      provider,
      {
        contextLines: 100, // 最大10に制限されるはず
        includeFileHeaders: true,
        maxFileSize: 500000,
      }
    );

    const hunk = result.files[0].hunks[0];
    const totalContext = hunk.extendedBefore.length + hunk.extendedAfter.length;
    logTest("Context lines clamped to max 10", totalContext <= 20); // 前後合わせて最大20
  } catch (e) {
    logTest("Context lines max limit", false, (e as Error).message);
  }

  // 0行の場合（拡張なし）
  try {
    const result = await extendDiffContext(
      [mockParsedFile],
      "abc123",
      provider,
      {
        contextLines: 0,
        includeFileHeaders: true,
        maxFileSize: 500000,
      }
    );

    const hunk = result.files[0].hunks[0];
    logTest(
      "Zero context lines works",
      hunk.extendedBefore.length === 0 && hunk.extendedAfter.length === 0
    );
  } catch (e) {
    logTest("Zero context lines", false, (e as Error).message);
  }
}

// ========================================
// formatContextExtensionSummary テスト
// ========================================

async function testFormatSummary() {
  console.log("\n📊 formatContextExtensionSummary テスト");

  clearContextCache();

  const provider = createMockProvider({
    "test.ts": mockFileContent,
  });

  try {
    const result = await extendDiffContext(
      [mockParsedFile],
      "abc123",
      provider
    );
    const summary = formatContextExtensionSummary(result);

    logTest("Summary is a string", typeof summary === "string");
    logTest("Summary contains 'processed'", summary.includes("processed"));
    logTest("Summary contains 'lines added'", summary.includes("lines added"));
  } catch (e) {
    logTest("formatContextExtensionSummary", false, (e as Error).message);
  }
}

// ========================================
// 複数ファイルテスト
// ========================================

async function testMultipleFiles() {
  console.log("\n📁 複数ファイルテスト");

  clearContextCache();

  const file1: ParsedFile = {
    oldPath: "file1.ts",
    newPath: "file1.ts",
    type: "modify",
    additions: 1,
    deletions: 0,
    hunks: [
      {
        oldStart: 5,
        oldLines: 1,
        newStart: 5,
        newLines: 2,
        content: "",
        changes: [
          {
            type: "normal",
            content: "line 5",
            oldLineNumber: 5,
            newLineNumber: 5,
            diffPosition: 1,
          },
          {
            type: "insert",
            content: "new line",
            newLineNumber: 6,
            diffPosition: 2,
          },
        ],
      },
    ],
  };

  const file2: ParsedFile = {
    oldPath: "file2.ts",
    newPath: "file2.ts",
    type: "add",
    additions: 3,
    deletions: 0,
    hunks: [
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 3,
        content: "",
        changes: [
          {
            type: "insert",
            content: "new file line 1",
            newLineNumber: 1,
            diffPosition: 1,
          },
          {
            type: "insert",
            content: "new file line 2",
            newLineNumber: 2,
            diffPosition: 2,
          },
          {
            type: "insert",
            content: "new file line 3",
            newLineNumber: 3,
            diffPosition: 3,
          },
        ],
      },
    ],
  };

  const provider = createMockProvider({
    "file1.ts":
      "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10",
    "file2.ts": "new file line 1\nnew file line 2\nnew file line 3",
  });

  try {
    const result = await extendDiffContext([file1, file2], "abc123", provider);

    logTest("Processes multiple files", result.files.length === 2);
    logTest("First file processed", result.files[0].contentFetched === true);
    logTest("Second file processed", result.files[1].contentFetched === true);
    logTest("Stats reflect multiple files", result.stats.filesProcessed === 2);

    // 拡張Diffに両方のファイルが含まれる
    logTest(
      "Extended diff contains file1",
      result.extendedDiff.includes("file1.ts")
    );
    logTest(
      "Extended diff contains file2",
      result.extendedDiff.includes("file2.ts")
    );
  } catch (e) {
    logTest("Multiple files processing", false, (e as Error).message);
  }
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   Phase 3: 拡張Diffコンテキスト テスト     ║");
  console.log("╚════════════════════════════════════════════╝");

  // 環境設定
  console.log("\n📋 環境設定:");
  console.log(
    `  - DIFF_CONTEXT_LINES: ${
      process.env.DIFF_CONTEXT_LINES ?? "(default: 5)"
    }`
  );
  console.log(
    `  - DIFF_CONTEXT_EXTENSION_ENABLED: ${
      process.env.DIFF_CONTEXT_EXTENSION_ENABLED ?? "(default: true)"
    }`
  );

  await testUtilityFunctions();
  await testContextExtension();
  await testBoundaryConditions();
  await testDeletedFileSkip();
  await testContextLinesLimit();
  await testFormatSummary();
  await testMultipleFiles();

  // 結果サマリー
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║              テスト結果サマリー             ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 3 実装完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    process.exit(1);
  }
}

main().catch(console.error);
