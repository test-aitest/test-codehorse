/**
 * Implementation Test Runner
 * Tests for pr-agent style improvements
 */

import { parseDiff, reconstructDiff, findDiffPosition, isLineInHunks } from '../../src/lib/diff/parser';
import { validateCommentPosition, getValidLineRanges } from '../../src/lib/diff/validation';
import { formatSuggestionBlock, formatInlineCommentWithSuggestion, getSeverityEmoji } from '../../src/lib/github/suggestion-formatter';
import { formatForGitHubReview, type GeneratedReview } from '../../src/lib/ai/review';

const sampleDiff = `diff --git a/src/lib/example.ts b/src/lib/example.ts
--- a/src/lib/example.ts
+++ b/src/lib/example.ts
@@ -1,5 +1,7 @@
 import { foo } from './foo';

+// 新しいコメント
 export function hello() {
-  console.log('hello');
+  console.log('Hello, World!');
+  return true;
 }
diff --git a/src/lib/new-file.ts b/src/lib/new-file.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/new-file.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 42;
+}
`;

// リネーム＆修正のDiffサンプル
const renameAndModifyDiff = `diff --git a/src/old-name.ts b/src/new-name.ts
rename from src/old-name.ts
rename to src/new-name.ts
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,4 @@
 export function renamed() {
+  // Modified after rename
   return true;
 }
`;

// 削除ファイルのDiffサンプル
const deletedFileDiff = `diff --git a/src/deprecated.ts b/src/deprecated.ts
deleted file mode 100644
--- a/src/deprecated.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldFunction() {
-  console.log('deprecated');
-  return false;
-}
-
`;

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error: unknown) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${(error as Error).message}`);
  }
}

console.log('\n========================================');
console.log('  Phase 1: Custom Diff Parser Tests');
console.log('========================================\n');

// Test 1: parseDiff基本機能
test('parseDiff: Parses unified diff correctly', () => {
  const result = parseDiff(sampleDiff);
  if (result.files.length !== 2) {
    throw new Error(`Expected 2 files, got ${result.files.length}`);
  }
  if (result.files[0].type !== 'modify') {
    throw new Error(`Expected 'modify', got '${result.files[0].type}'`);
  }
  if (result.files[1].type !== 'add') {
    throw new Error(`Expected 'add', got '${result.files[1].type}'`);
  }
});

// Test 2: 行番号の追跡
test('parseDiff: Tracks line numbers correctly', () => {
  const result = parseDiff(sampleDiff);
  const file = result.files[0];
  const hunk = file.hunks[0];

  // insert行にはnewLineNumberがある
  const insertChange = hunk.changes.find(c => c.type === 'insert' && c.content.includes('新しいコメント'));
  if (!insertChange || insertChange.newLineNumber !== 3) {
    throw new Error(`Expected newLineNumber 3 for insert, got ${insertChange?.newLineNumber}`);
  }

  // delete行にはoldLineNumberがある
  const deleteChange = hunk.changes.find(c => c.type === 'delete');
  if (!deleteChange || deleteChange.oldLineNumber === undefined) {
    throw new Error('Delete change should have oldLineNumber');
  }
});

// Test 3: 新規ファイルの検出
test('parseDiff: Detects new file mode', () => {
  const result = parseDiff(sampleDiff);
  const newFile = result.files.find(f => f.newPath === 'src/lib/new-file.ts');
  if (!newFile) {
    throw new Error('New file not found');
  }
  if (newFile.type !== 'add') {
    throw new Error(`Expected type 'add', got '${newFile.type}'`);
  }
});

// Test 4: additions/deletionsのカウント
test('parseDiff: Counts additions and deletions', () => {
  const result = parseDiff(sampleDiff);
  if (result.totalAdditions < 5) {
    throw new Error(`Expected at least 5 additions, got ${result.totalAdditions}`);
  }
  if (result.totalDeletions < 1) {
    throw new Error(`Expected at least 1 deletion, got ${result.totalDeletions}`);
  }
});

// Test 5: findDiffPosition
test('findDiffPosition: Finds correct position in diff', () => {
  const result = parseDiff(sampleDiff);
  const pos = findDiffPosition('src/lib/new-file.ts', 2, result, 'new');
  if (pos === null) {
    throw new Error('Position should not be null');
  }
});

// Test 6: isLineInHunks
test('isLineInHunks: Validates line is in hunks', () => {
  const result = parseDiff(sampleDiff);
  if (!isLineInHunks('src/lib/new-file.ts', 1, result)) {
    throw new Error('Line 1 should be in hunks');
  }
  if (!isLineInHunks('src/lib/new-file.ts', 3, result)) {
    throw new Error('Line 3 should be in hunks');
  }
});

// Test 7: reconstructDiff
test('reconstructDiff: Reconstructs diff correctly', () => {
  const result = parseDiff(sampleDiff);
  const reconstructed = reconstructDiff(result.files[1]);
  if (!reconstructed.includes('diff --git')) {
    throw new Error('Reconstructed diff should contain header');
  }
  if (!reconstructed.includes('new file mode')) {
    throw new Error('Reconstructed diff should contain new file mode');
  }
});

// Test 8: renameファイルの検出
test('parseDiff: Detects renamed file', () => {
  const result = parseDiff(renameAndModifyDiff);
  if (result.files.length !== 1) {
    throw new Error(`Expected 1 file, got ${result.files.length}`);
  }
  const file = result.files[0];
  if (file.type !== 'rename') {
    throw new Error(`Expected type 'rename', got '${file.type}'`);
  }
  if (file.oldPath !== 'src/old-name.ts') {
    throw new Error(`Expected oldPath 'src/old-name.ts', got '${file.oldPath}'`);
  }
  if (file.newPath !== 'src/new-name.ts') {
    throw new Error(`Expected newPath 'src/new-name.ts', got '${file.newPath}'`);
  }
});

// Test 9: renameファイルの変更内容を正しくパース
test('parseDiff: Parses rename file changes correctly', () => {
  const result = parseDiff(renameAndModifyDiff);
  const file = result.files[0];
  if (file.additions !== 1) {
    throw new Error(`Expected 1 addition, got ${file.additions}`);
  }
  const hunk = file.hunks[0];
  const insertChange = hunk.changes.find(c => c.type === 'insert');
  if (!insertChange) {
    throw new Error('Should have insert change');
  }
  if (!insertChange.content.includes('Modified after rename')) {
    throw new Error('Insert content should contain "Modified after rename"');
  }
});

// Test 10: 削除ファイルの検出
test('parseDiff: Detects deleted file', () => {
  const result = parseDiff(deletedFileDiff);
  if (result.files.length !== 1) {
    throw new Error(`Expected 1 file, got ${result.files.length}`);
  }
  const file = result.files[0];
  if (file.type !== 'delete') {
    throw new Error(`Expected type 'delete', got '${file.type}'`);
  }
});

// Test 11: 削除ファイルの行カウント
test('parseDiff: Counts deletions in deleted file', () => {
  const result = parseDiff(deletedFileDiff);
  const file = result.files[0];
  if (file.deletions < 4) {
    throw new Error(`Expected at least 4 deletions, got ${file.deletions}`);
  }
  if (file.additions !== 0) {
    throw new Error(`Expected 0 additions, got ${file.additions}`);
  }
});

// GitHub出力サンプル: リネームファイル
console.log('\n--- Rename File Diff Output ---');
const renameResult = parseDiff(renameAndModifyDiff);
console.log(`File: ${renameResult.files[0].oldPath} → ${renameResult.files[0].newPath}`);
console.log(`Type: ${renameResult.files[0].type}`);
console.log(`Changes: +${renameResult.files[0].additions} -${renameResult.files[0].deletions}`);

console.log('\n========================================');
console.log('  Phase 2: Comment Position Validation');
console.log('========================================\n');

// Test 12: validateCommentPosition - 有効な位置
test('validateCommentPosition: Valid position returns valid=true', () => {
  const result = parseDiff(sampleDiff);
  const validation = validateCommentPosition('src/lib/new-file.ts', 2, undefined, result);
  if (!validation.valid) {
    throw new Error(`Expected valid=true, got reason: ${validation.reason}`);
  }
});

// Test 13: validateCommentPosition - 無効な位置
test('validateCommentPosition: Invalid position returns valid=false', () => {
  const result = parseDiff(sampleDiff);
  const validation = validateCommentPosition('nonexistent.ts', 100, undefined, result);
  if (validation.valid) {
    throw new Error('Expected valid=false for nonexistent file');
  }
});

// Test 14: getValidLineRanges
test('getValidLineRanges: Returns correct ranges', () => {
  const result = parseDiff(sampleDiff);
  const ranges = getValidLineRanges('src/lib/new-file.ts', result);
  if (ranges.length === 0) {
    throw new Error('Expected at least one range');
  }
  if (ranges[0].start !== 1 || ranges[0].end !== 3) {
    throw new Error(`Expected range 1-3, got ${ranges[0].start}-${ranges[0].end}`);
  }
});

// Test 15: validateCommentPosition - 複数行コメント
test('validateCommentPosition: Multi-line comment validation', () => {
  const result = parseDiff(sampleDiff);
  // 行1-3は有効な範囲
  const validation = validateCommentPosition('src/lib/new-file.ts', 3, 1, result);
  if (!validation.valid) {
    throw new Error(`Expected valid=true, got reason: ${validation.reason}`);
  }
});

console.log('\n========================================');
console.log('  Phase 3: Suggestion Block Formatter');
console.log('========================================\n');

// Test 16: formatSuggestionBlock
test('formatSuggestionBlock: Creates GitHub suggestion block', () => {
  const result = formatSuggestionBlock('const x = 1;');
  if (!result.includes('```suggestion')) {
    throw new Error('Should contain suggestion block marker');
  }
  if (!result.includes('const x = 1;')) {
    throw new Error('Should contain the suggestion code');
  }
});

// Test 17: getSeverityEmoji
test('getSeverityEmoji: Returns correct emoji for severity', () => {
  if (getSeverityEmoji('CRITICAL') !== '🔴') {
    throw new Error('CRITICAL should return 🔴');
  }
  if (getSeverityEmoji('IMPORTANT') !== '🟠') {
    throw new Error('IMPORTANT should return 🟠');
  }
  if (getSeverityEmoji('INFO') !== '🔵') {
    throw new Error('INFO should return 🔵');
  }
  if (getSeverityEmoji('NITPICK') !== '⚪') {
    throw new Error('NITPICK should return ⚪');
  }
});

// Test 18: formatInlineCommentWithSuggestion
test('formatInlineCommentWithSuggestion: Formats comment with suggestion', () => {
  const result = formatInlineCommentWithSuggestion({
    body: 'Consider using const',
    severity: 'INFO',
    suggestion: 'const x = 1;',
    relevanceScore: 7,
    relevanceCategory: 'MEDIUM',
  });
  if (!result.includes('[INFO]')) {
    throw new Error('Should contain severity marker');
  }
  if (!result.includes('```suggestion')) {
    throw new Error('Should contain suggestion block');
  }
});

// Test 19: formatInlineCommentWithSuggestion without suggestion
test('formatInlineCommentWithSuggestion: Works without suggestion', () => {
  const result = formatInlineCommentWithSuggestion({
    body: 'This is just a comment',
    severity: 'NITPICK',
    suggestion: '',
    relevanceScore: 5,
    relevanceCategory: 'LOW',
  });
  if (!result.includes('[NITPICK]')) {
    throw new Error('Should contain severity marker');
  }
  if (result.includes('```suggestion')) {
    throw new Error('Should NOT contain suggestion block');
  }
});

// GitHubコメント出力サンプル
console.log('\n========================================');
console.log('  GitHub Comment Output Examples');
console.log('========================================\n');

console.log('--- Example 1: CRITICAL with Suggestion ---');
console.log(formatInlineCommentWithSuggestion({
  body: 'セキュリティ上の問題: ユーザー入力をエスケープせずに使用しています。XSS攻撃の可能性があります。',
  severity: 'CRITICAL',
  suggestion: 'const sanitizedInput = escapeHtml(userInput);',
  relevanceScore: 10,
  relevanceCategory: 'HIGH',
}));

console.log('\n--- Example 2: IMPORTANT with Multi-line Suggestion ---');
console.log(formatInlineCommentWithSuggestion({
  body: 'エラーハンドリングが不足しています。try-catchで囲むことを推奨します。',
  severity: 'IMPORTANT',
  suggestion: `try {
  await fetchData();
} catch (error) {
  console.error('Failed to fetch:', error);
  throw error;
}`,
  relevanceScore: 8,
  relevanceCategory: 'MEDIUM',
}));

console.log('\n--- Example 3: INFO without Suggestion ---');
console.log(formatInlineCommentWithSuggestion({
  body: 'この関数は複雑なので、より小さな関数に分割することを検討してください。',
  severity: 'INFO',
  suggestion: '',
  relevanceScore: 6,
  relevanceCategory: 'LOW',
}));

console.log('\n--- Example 4: NITPICK ---');
console.log(formatInlineCommentWithSuggestion({
  body: '変数名`x`は意味が分かりにくいです。`userCount`のような説明的な名前を推奨します。',
  severity: 'NITPICK',
  suggestion: 'const userCount = users.length;',
  relevanceScore: 4,
  relevanceCategory: 'LOW',
}));

console.log('\n========================================');
console.log('  Phase 4: Multi-line Comments & endLine');
console.log('========================================\n');

// Test 20: formatForGitHubReview with endLine
test('formatForGitHubReview: Converts endLine to line for GitHub API', () => {
  const mockReview: GeneratedReview = {
    result: {
      summary: 'Test summary',
      walkthrough: [],
      comments: []
    },
    summaryComment: 'Test summary',
    inlineComments: [
      {
        path: 'test.ts',
        endLine: 10,
        startLine: 5,
        body: 'Test comment',
        severity: 'INFO'
      }
    ],
    tokenCount: 100,
    reflectionApplied: false
  };

  const result = formatForGitHubReview(mockReview);

  // GitHub APIは 'line' を期待
  if (result.comments[0].line !== 10) {
    throw new Error(`Expected line=10, got ${result.comments[0].line}`);
  }
  // 複数行コメントの場合 start_line が設定される
  if (result.comments[0].start_line !== 5) {
    throw new Error(`Expected start_line=5, got ${result.comments[0].start_line}`);
  }
});

// Test 21: formatForGitHubReview - 単一行コメント
test('formatForGitHubReview: Single line comment has no start_line', () => {
  const mockReview: GeneratedReview = {
    result: {
      summary: 'Test summary',
      walkthrough: [],
      comments: []
    },
    summaryComment: 'Test summary',
    inlineComments: [
      {
        path: 'test.ts',
        endLine: 10,
        body: 'Test comment',
        severity: 'INFO'
      }
    ],
    tokenCount: 100,
    reflectionApplied: false
  };

  const result = formatForGitHubReview(mockReview);

  if (result.comments[0].start_line !== undefined) {
    throw new Error('Single line comment should not have start_line');
  }
});

// Test 22: formatForGitHubReview - CRITICALでREQUEST_CHANGES
test('formatForGitHubReview: CRITICAL severity triggers REQUEST_CHANGES', () => {
  const mockReview: GeneratedReview = {
    result: {
      summary: 'Test summary',
      walkthrough: [],
      comments: []
    },
    summaryComment: 'Test summary',
    inlineComments: [
      {
        path: 'test.ts',
        endLine: 10,
        body: 'Security issue',
        severity: 'CRITICAL'
      }
    ],
    tokenCount: 100,
    reflectionApplied: false
  };

  const result = formatForGitHubReview(mockReview);

  if (result.event !== 'REQUEST_CHANGES') {
    throw new Error(`Expected REQUEST_CHANGES, got ${result.event}`);
  }
});

// Test 23: formatForGitHubReview - side is always RIGHT
test('formatForGitHubReview: Side is always RIGHT', () => {
  const mockReview: GeneratedReview = {
    result: {
      summary: 'Test summary',
      walkthrough: [],
      comments: []
    },
    summaryComment: 'Test summary',
    inlineComments: [
      {
        path: 'test.ts',
        endLine: 10,
        body: 'Test',
        severity: 'INFO'
      }
    ],
    tokenCount: 100,
    reflectionApplied: false
  };

  const result = formatForGitHubReview(mockReview);

  if (result.comments[0].side !== 'RIGHT') {
    throw new Error(`Expected side=RIGHT, got ${result.comments[0].side}`);
  }
});

// フルレビュー出力サンプル
console.log('\n========================================');
console.log('  Full GitHub Review Output Example');
console.log('========================================\n');

const fullReviewExample: GeneratedReview = {
  result: {
    summary: 'このPRはユーザー認証機能を追加しています。全体的に良い実装ですが、いくつかのセキュリティ上の懸念点があります。',
    walkthrough: [
      { path: 'src/auth/login.ts', summary: 'ログイン処理の実装', changeType: 'add' as const },
      { path: 'src/auth/session.ts', summary: 'セッション管理の追加', changeType: 'add' as const }
    ],
    comments: []
  },
  summaryComment: `## 📝 AI Code Review Summary

このPRはユーザー認証機能を追加しています。全体的に良い実装ですが、いくつかのセキュリティ上の懸念点があります。

### 📁 変更ファイル概要
| ファイル | 変更内容 |
|---------|---------|
| src/auth/login.ts | ログイン処理の実装 |
| src/auth/session.ts | セッション管理の追加 |

### 🔍 レビュー結果
- 🔴 CRITICAL: 1件
- 🟠 IMPORTANT: 1件
- 🔵 INFO: 1件
`,
  inlineComments: [
    {
      path: 'src/auth/login.ts',
      endLine: 25,
      startLine: 20,
      body: 'パスワードを平文でログに出力しています。セキュリティ上の重大な問題です。',
      severity: 'CRITICAL'
    },
    {
      path: 'src/auth/login.ts',
      endLine: 42,
      body: 'ログイン試行回数の制限がありません。ブルートフォース攻撃に脆弱です。',
      severity: 'IMPORTANT'
    },
    {
      path: 'src/auth/session.ts',
      endLine: 15,
      body: 'セッションの有効期限を設定することを推奨します。',
      severity: 'INFO'
    }
  ],
  tokenCount: 1500,
  reflectionApplied: false
};

const formattedReview = formatForGitHubReview(fullReviewExample);

console.log('--- Review Body (PR Summary Comment) ---');
console.log(formattedReview.body);
console.log('\n--- Review Event ---');
console.log(`Event: ${formattedReview.event}`);
console.log('\n--- Inline Comments (GitHub API Format) ---');
formattedReview.comments.forEach((comment, index) => {
  console.log(`\n[Comment ${index + 1}]`);
  console.log(`  path: ${comment.path}`);
  console.log(`  line: ${comment.line}`);
  if (comment.start_line) {
    console.log(`  start_line: ${comment.start_line}`);
  }
  console.log(`  side: ${comment.side}`);
  if (comment.start_side) {
    console.log(`  start_side: ${comment.start_side}`);
  }
  console.log(`  body:`);
  console.log('  ' + comment.body.split('\n').join('\n  '));
});

console.log('\n========================================');
console.log('  Test Results Summary');
console.log('========================================\n');

console.log(`Total: ${passed + failed} tests`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
