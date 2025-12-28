/**
 * 行番号検証テスト
 *
 * GitHub "Line could not be resolved" エラーの修正を検証
 */

import {
  validateCommentPosition,
  getCommentableLines,
  isCommentableLineInDiff,
} from "./src/lib/diff/validation";
import type { ParsedDiff, ParsedFile } from "./src/lib/diff/types";

// ========================================
// テスト結果トラッキング
// ========================================

let passedTests = 0;
let failedTests = 0;

function logTest(name: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`    ✅ ${name}`);
    passedTests++;
  } else {
    console.log(`    ❌ ${name}${detail ? `: ${detail}` : ""}`);
    failedTests++;
  }
}

// ========================================
// テストデータ作成ヘルパー
// ========================================

function createMockParsedDiff(files: ParsedFile[]): ParsedDiff {
  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}

function createMockFile(
  path: string,
  changes: Array<{
    type: "insert" | "delete" | "normal";
    oldLine?: number;
    newLine?: number;
    content: string;
  }>
): ParsedFile {
  return {
    oldPath: path,
    newPath: path,
    type: "modify",
    additions: changes.filter((c) => c.type === "insert").length,
    deletions: changes.filter((c) => c.type === "delete").length,
    hunks: [
      {
        oldStart: 1,
        oldLines: changes.filter((c) => c.type !== "insert").length,
        newStart: 1,
        newLines: changes.filter((c) => c.type !== "delete").length,
        content: "@@ -1 +1 @@",
        changes: changes.map((c, i) => ({
          type: c.type,
          content: c.content,
          oldLineNumber: c.oldLine,
          newLineNumber: c.newLine,
          diffPosition: i + 1,
        })),
      },
    ],
  };
}

// ========================================
// テスト1: getCommentableLines
// ========================================

function testGetCommentableLines() {
  console.log("\n📍 getCommentableLines テスト");

  // ケース1: insert行とnormal行はコメント可能
  const file1 = createMockFile("test.ts", [
    { type: "normal", oldLine: 1, newLine: 1, content: "const a = 1;" },
    { type: "insert", newLine: 2, content: "const b = 2;" },
    { type: "insert", newLine: 3, content: "const c = 3;" },
    { type: "delete", oldLine: 2, content: "old code" },
    { type: "normal", oldLine: 3, newLine: 4, content: "const d = 4;" },
  ]);

  const parsedDiff1 = createMockParsedDiff([file1]);
  const lines1 = getCommentableLines("test.ts", parsedDiff1);

  logTest("insert行がコメント可能", lines1.has(2));
  logTest("insert行がコメント可能 (2)", lines1.has(3));
  logTest("normal行がコメント可能", lines1.has(1));
  logTest("normal行がコメント可能 (2)", lines1.has(4));
  logTest("delete行はnewLineNumberを持たないため除外", !lines1.has(undefined as unknown as number));
  logTest("コメント可能な行数が正しい", lines1.size === 4);

  // ケース2: ファイルが見つからない場合
  const emptyLines = getCommentableLines("nonexistent.ts", parsedDiff1);
  logTest("存在しないファイルは空セット", emptyLines.size === 0);
}

// ========================================
// テスト2: validateCommentPosition - 有効な行
// ========================================

function testValidateCommentPositionValid() {
  console.log("\n✅ validateCommentPosition - 有効な行");

  const file = createMockFile("auth.ts", [
    { type: "normal", oldLine: 10, newLine: 10, content: "function login() {" },
    { type: "insert", newLine: 11, content: "  validateInput();" },
    { type: "insert", newLine: 12, content: "  checkAuth();" },
    { type: "delete", oldLine: 11, content: "  // old code" },
    { type: "normal", oldLine: 12, newLine: 13, content: "}" },
  ]);

  const parsedDiff = createMockParsedDiff([file]);

  // insert行へのコメント
  const result1 = validateCommentPosition("auth.ts", 11, undefined, parsedDiff);
  logTest("insert行への単一行コメントは有効", result1.valid === true);

  // normal行へのコメント
  const result2 = validateCommentPosition("auth.ts", 10, undefined, parsedDiff);
  logTest("normal行への単一行コメントは有効", result2.valid === true);

  // 複数行コメント（両端が有効）
  const result3 = validateCommentPosition("auth.ts", 12, 11, parsedDiff);
  logTest("両端が有効な複数行コメントは有効", result3.valid === true);
}

// ========================================
// テスト3: validateCommentPosition - 無効な行
// ========================================

function testValidateCommentPositionInvalid() {
  console.log("\n❌ validateCommentPosition - 無効な行");

  const file = createMockFile("api.ts", [
    { type: "normal", oldLine: 5, newLine: 5, content: "const api = {};" },
    { type: "insert", newLine: 6, content: "api.get = () => {};" },
  ]);

  const parsedDiff = createMockParsedDiff([file]);

  // diff範囲外の行
  const result1 = validateCommentPosition("api.ts", 100, undefined, parsedDiff);
  logTest("diff範囲外の行は無効", result1.valid === false);
  logTest("無効理由が記載されている", result1.reason !== undefined);

  // ファイルがdiffにない場合
  const result2 = validateCommentPosition("other.ts", 10, undefined, parsedDiff);
  logTest("diffにないファイルは無効", result2.valid === false);
  logTest("File not in diff理由", result2.reason === "File not in diff");
}

// ========================================
// テスト4: validateCommentPosition - 行の調整
// ========================================

function testValidateCommentPositionAdjustment() {
  console.log("\n🔧 validateCommentPosition - 行の調整");

  const file = createMockFile("utils.ts", [
    { type: "normal", oldLine: 1, newLine: 1, content: "line 1" },
    { type: "insert", newLine: 2, content: "line 2" },
    { type: "insert", newLine: 3, content: "line 3" },
    { type: "normal", oldLine: 2, newLine: 4, content: "line 4" },
    { type: "normal", oldLine: 3, newLine: 5, content: "line 5" },
  ]);

  const parsedDiff = createMockParsedDiff([file]);

  // 近くの行への調整（許容範囲内）
  // 行6は存在しないが、許容範囲内に行5がある
  const result1 = validateCommentPosition("utils.ts", 6, undefined, parsedDiff);
  if (result1.valid && result1.adjustedLine) {
    logTest("許容範囲内の行は調整される", result1.adjustedLine === 5);
  } else {
    logTest("許容範囲外は無効として処理", !result1.valid);
  }

  // 複数行コメントでstartLineが無効な場合の調整
  const result2 = validateCommentPosition("utils.ts", 3, 0, parsedDiff);
  logTest("無効なstartLineは調整される", result2.valid === true);
  if (result2.adjustedStartLine !== undefined) {
    logTest("startLineが有効な行に調整される", result2.adjustedStartLine >= 1);
  }
}

// ========================================
// テスト5: isCommentableLineInDiff
// ========================================

function testIsCommentableLineInDiff() {
  console.log("\n🔍 isCommentableLineInDiff テスト");

  const file = createMockFile("model.ts", [
    { type: "insert", newLine: 10, content: "new code" },
    { type: "normal", oldLine: 10, newLine: 11, content: "unchanged" },
    { type: "delete", oldLine: 11, content: "removed" },
  ]);

  const parsedDiff = createMockParsedDiff([file]);

  logTest("insert行はコメント可能", isCommentableLineInDiff("model.ts", 10, parsedDiff) === true);
  logTest("normal行はコメント可能", isCommentableLineInDiff("model.ts", 11, parsedDiff) === true);
  logTest("diff外の行はコメント不可", isCommentableLineInDiff("model.ts", 50, parsedDiff) === false);
  logTest("存在しないファイルはコメント不可", isCommentableLineInDiff("other.ts", 10, parsedDiff) === false);
}

// ========================================
// テスト6: 実際のシナリオ
// ========================================

function testRealWorldScenarios() {
  console.log("\n🌍 実際のシナリオテスト");

  // シナリオ1: AIが削除行の行番号を返した場合
  const file1 = createMockFile("handler.ts", [
    { type: "normal", oldLine: 1, newLine: 1, content: "import { x } from 'y';" },
    { type: "delete", oldLine: 2, content: "const OLD = 1;" },  // 削除行
    { type: "insert", newLine: 2, content: "const NEW = 2;" },
    { type: "normal", oldLine: 3, newLine: 3, content: "export { x };" },
  ]);

  const parsedDiff1 = createMockParsedDiff([file1]);

  // 削除行（oldLine: 2）にはnewLineNumberがないため、コメント不可
  const deletedLineResult = validateCommentPosition("handler.ts", 2, undefined, parsedDiff1);
  // 行2はinsert行として存在するので有効
  logTest("insert行（同じ番号）はコメント可能", deletedLineResult.valid === true);

  // シナリオ2: 大きなギャップがあるhunk
  const file2 = createMockFile("config.ts", [
    { type: "insert", newLine: 100, content: "config = {};" },
    { type: "insert", newLine: 101, content: "export config;" },
  ]);

  const parsedDiff2 = createMockParsedDiff([file2]);

  const gapResult1 = validateCommentPosition("config.ts", 100, undefined, parsedDiff2);
  logTest("hunk内の行はコメント可能", gapResult1.valid === true);

  const gapResult2 = validateCommentPosition("config.ts", 50, undefined, parsedDiff2);
  logTest("hunk外の行はコメント不可", gapResult2.valid === false);

  // シナリオ3: AIがhunk境界を超えた行番号を返した場合
  const result3 = validateCommentPosition("config.ts", 110, undefined, parsedDiff2);
  if (result3.valid && result3.adjustedLine) {
    logTest("境界外の行は近くの有効な行に調整", result3.adjustedLine === 101);
  } else {
    logTest("調整不可能な場合は無効", !result3.valid);
  }
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   行番号検証テスト                               ║");
  console.log("╚══════════════════════════════════════════════════╝");

  testGetCommentableLines();
  testValidateCommentPositionValid();
  testValidateCommentPositionInvalid();
  testValidateCommentPositionAdjustment();
  testIsCommentableLineInDiff();
  testRealWorldScenarios();

  // 結果サマリー
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                 テスト結果サマリー                ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全ての行番号検証テストが成功しました！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。");
    process.exit(1);
  }
}

main().catch(console.error);
