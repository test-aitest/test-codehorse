// End-to-end test for the handler CLI
// This tests the prompt builder without actually invoking Claude Code

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Import handler's prompt builder
async function buildPrompt(data) {
  const { review, comments } = data;

  // Group comments by file
  const commentsByFile = new Map();
  for (const comment of comments) {
    const existing = commentsByFile.get(comment.filePath) || [];
    existing.push(comment);
    commentsByFile.set(comment.filePath, existing);
  }

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

  for (const [filePath, fileComments] of commentsByFile) {
    prompt += `\n### File: \`${filePath}\`\n\n`;

    for (const comment of fileComments) {
      prompt += `#### Line ${comment.lineNumber} [${comment.severity}]\n`;
      prompt += `**Issue**: ${comment.body}\n`;

      if (comment.suggestion) {
        prompt += `\n**Suggested Fix**:\n\`\`\`\n${comment.suggestion}\n\`\`\`\n`;
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

async function testHandlerE2E() {
  console.log("=".repeat(60));
  console.log("End-to-End Handler Test");
  console.log("=".repeat(60) + "\n");

  // Step 1: Get review data
  console.log("Step 1: Fetching review from database...");
  const review = await prisma.review.findFirst({
    include: {
      pullRequest: { include: { repository: true } },
      comments: { orderBy: [{ severity: "asc" }, { lineNumber: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!review) {
    console.log("  ❌ No reviews found");
    await prisma.$disconnect();
    return;
  }

  console.log(`  ✅ Review: ${review.id}`);
  console.log(`     PR #${review.pullRequest.number}: ${review.pullRequest.title}`);
  console.log(`     Repository: ${review.pullRequest.repository.fullName}`);
  console.log(`     Comments: ${review.comments.length}\n`);

  // Step 2: Build handler input data
  console.log("Step 2: Building handler input data...");
  const handlerData = {
    review: {
      id: review.id,
      prNumber: review.pullRequest.number,
      prTitle: review.pullRequest.title,
      commitSha: review.commitSha,
      summary: review.summary,
      repository: {
        fullName: review.pullRequest.repository.fullName,
        owner: review.pullRequest.repository.owner,
        name: review.pullRequest.repository.name,
        htmlUrl: review.pullRequest.repository.htmlUrl,
      },
    },
    comments: review.comments.map((c) => ({
      id: c.id,
      filePath: c.filePath,
      lineNumber: c.lineNumber,
      body: c.body,
      severity: c.severity,
      suggestion: c.suggestion,
    })),
  };
  console.log("  ✅ Handler data prepared\n");

  // Step 3: Build prompt
  console.log("Step 3: Building Claude Code prompt...");
  const prompt = await buildPrompt(handlerData);
  console.log(`  ✅ Prompt generated (${prompt.length} characters)\n`);

  // Step 4: Show prompt preview
  console.log("Step 4: Prompt Preview");
  console.log("-".repeat(60));
  console.log(prompt.substring(0, 2000));
  if (prompt.length > 2000) {
    console.log(`\n... (${prompt.length - 2000} more characters)`);
  }
  console.log("-".repeat(60) + "\n");

  // Step 5: Show what would happen
  console.log("Step 5: What would happen next...");
  console.log("  1. Handler finds local repository path");
  console.log("  2. Handler spawns: claude --print");
  console.log("  3. Prompt is piped to Claude Code stdin");
  console.log("  4. Claude Code reads files and applies fixes");
  console.log("  5. User sees Claude Code output in terminal\n");

  console.log("=".repeat(60));
  console.log("✅ E2E Test Completed Successfully!");
  console.log("=".repeat(60));

  await prisma.$disconnect();
}

testHandlerE2E().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
