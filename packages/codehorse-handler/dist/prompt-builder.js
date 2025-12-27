"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
/**
 * Group comments by file path
 */
function groupCommentsByFile(comments) {
    const grouped = new Map();
    for (const comment of comments) {
        const existing = grouped.get(comment.filePath) || [];
        existing.push(comment);
        grouped.set(comment.filePath, existing);
    }
    return grouped;
}
/**
 * Get severity order for sorting (CRITICAL first)
 */
function getSeverityOrder(severity) {
    switch (severity) {
        case "CRITICAL":
            return 0;
        case "IMPORTANT":
            return 1;
        case "INFO":
            return 2;
        case "NITPICK":
            return 3;
        default:
            return 4;
    }
}
/**
 * Format test cases as a markdown table for the prompt
 */
function formatTestCasesTable(testCases) {
    if (testCases.length === 0) {
        return "*テストケースはまだ登録されていません。*";
    }
    let table = "| ID | テスト名 | 説明 | 期待結果 | ステータス | 優先度 | 関連コード |\n";
    table += "|-----|---------|------|---------|-----------|--------|------------|\n";
    for (const tc of testCases) {
        const relatedCode = tc.relatedCode || "-";
        table += `| ${tc.id} | ${tc.name} | ${tc.description} | ${tc.expectedResult} | ${tc.status} | ${tc.priority} | ${relatedCode} |\n`;
    }
    return table;
}
/**
 * Build a prompt for Claude Code from review data
 * @param data Review data with comments
 * @param testCases Optional test cases from Google Sheets
 */
function buildPrompt(data, testCases) {
    const { review, comments } = data;
    // Sort comments by severity
    const sortedComments = [...comments].sort((a, b) => getSeverityOrder(a.severity) - getSeverityOrder(b.severity));
    let prompt = `# CodeHorse Review - Apply Fixes

You are applying AI-generated code review suggestions to this repository.
Please read each issue carefully and apply the appropriate fixes.

## Pull Request Information
- **PR**: #${review.prNumber} - ${review.prTitle}
- **Repository**: ${review.repository.fullName}
- **Commit**: ${review.commitSha}

## Review Summary
${review.summary || "No summary available."}

## Issues to Fix

The following issues were identified during code review. Please apply fixes for each one.
`;
    // Group comments by file
    const commentsByFile = groupCommentsByFile(sortedComments);
    for (const [filePath, fileComments] of commentsByFile) {
        prompt += `\n### File: \`${filePath}\`\n\n`;
        for (const comment of fileComments) {
            prompt += `#### Line ${comment.lineNumber} [${comment.severity}]\n`;
            prompt += `**Issue**: ${comment.body}\n`;
            if (comment.suggestion) {
                prompt += `\n**Suggested Fix**:\n\`\`\`\n${comment.suggestion}\n\`\`\`\n`;
            }
            if (comment.category) {
                prompt += `\n*Category: ${comment.category}*\n`;
            }
            prompt += "\n---\n";
        }
    }
    // Add test case section if test cases are provided
    if (testCases && testCases.length >= 0) {
        prompt += `
## 現在のテストケース

以下はGoogle Sheetsのテスト概要設計書に登録されているテストケースです：

${formatTestCasesTable(testCases)}

## テストケース更新指示

コード修正を行った後、テストケースの追加・修正が必要な場合は、以下のJSON形式で出力してください。
テストケースの更新が不要な場合は、このセクションを出力する必要はありません。

\`\`\`json:test-updates
[
  {
    "action": "add",
    "testCase": {
      "id": "TC00X",
      "name": "テスト名",
      "description": "テストの説明",
      "expectedResult": "期待される結果",
      "status": "Pending",
      "priority": "Medium",
      "relatedCode": "path/to/modified/file.ts"
    }
  },
  {
    "action": "update",
    "testCase": {
      "id": "TC001",
      "name": "更新後のテスト名",
      "description": "更新後の説明",
      "expectedResult": "更新後の期待結果",
      "status": "Pending",
      "priority": "High",
      "relatedCode": "path/to/file.ts"
    }
  }
]
\`\`\`

**action の種類:**
- \`add\`: 新しいテストケースを追加
- \`update\`: 既存のテストケースを更新（ID で特定）
- \`delete\`: テストケースを削除（ID のみ必要）

`;
    }
    prompt += `
## Instructions

1. Start with CRITICAL issues, then IMPORTANT, then INFO, then NITPICK
2. For each issue:
   - Read the file and understand the context
   - If a suggested fix is provided, apply it exactly
   - If no suggestion is provided, implement an appropriate fix based on the issue description
3. After applying all fixes, verify the code still compiles/runs
4. Provide a brief summary of what changes were made
${testCases ? "5. If test cases need to be added or updated, output the JSON in the format specified above" : ""}

Please proceed with applying these fixes.
`;
    return prompt;
}
//# sourceMappingURL=prompt-builder.js.map