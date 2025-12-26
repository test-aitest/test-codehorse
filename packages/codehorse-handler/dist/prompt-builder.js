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
 * Build a prompt for Claude Code from review data
 */
function buildPrompt(data) {
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
    prompt += `
## Instructions

1. Start with CRITICAL issues, then IMPORTANT, then INFO, then NITPICK
2. For each issue:
   - Read the file and understand the context
   - If a suggested fix is provided, apply it exactly
   - If no suggestion is provided, implement an appropriate fix based on the issue description
3. After applying all fixes, verify the code still compiles/runs
4. Provide a brief summary of what changes were made

Please proceed with applying these fixes.
`;
    return prompt;
}
//# sourceMappingURL=prompt-builder.js.map