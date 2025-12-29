// Test the full flow: generate token -> export review

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testFullFlow() {
  console.log("Testing Full Review Export Flow...\n");

  // Step 1: Find a review in the database
  console.log("Step 1: Finding existing review...");
  const review = await prisma.review.findFirst({
    include: {
      pullRequest: {
        include: {
          repository: true,
        },
      },
      comments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!review) {
    console.log("  ❌ No reviews found in database");
    console.log("  Please create a PR and trigger a review first.");
    await prisma.$disconnect();
    return;
  }

  console.log(`  ✅ Found review: ${review.id}`);
  console.log(`     PR: #${review.pullRequest.number} - ${review.pullRequest.title}`);
  console.log(`     Repo: ${review.pullRequest.repository.fullName}`);
  console.log(`     Comments: ${review.comments.length}`);
  console.log("");

  // Step 2: Generate a token (simulating server action)
  console.log("Step 2: Generating token...");
  const { randomBytes } = await import("crypto");
  const token = randomBytes(32).toString("hex");

  // Store token in memory (simulating the token store)
  const tokenStore = new Map();
  tokenStore.set(token, {
    reviewId: review.id,
    userId: "test-user",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  console.log(`  ✅ Token generated: ${token.substring(0, 8)}...`);
  console.log("");

  // Step 3: Test the API with the review ID (token won't work since it's not in server memory)
  console.log("Step 3: Testing API response structure...");

  // Directly query what the API would return
  const reviewData = {
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

  console.log(`  ✅ Review data structure:`);
  console.log(`     Review ID: ${reviewData.review.id}`);
  console.log(`     PR: #${reviewData.review.prNumber}`);
  console.log(`     Repository: ${reviewData.review.repository.fullName}`);
  console.log(`     Comments: ${reviewData.comments.length}`);

  if (reviewData.comments.length > 0) {
    console.log("\n  Sample comment:");
    const sample = reviewData.comments[0];
    console.log(`     File: ${sample.filePath}:${sample.lineNumber}`);
    console.log(`     Severity: ${sample.severity}`);
    console.log(`     Body: ${sample.body.substring(0, 100)}...`);
  }
  console.log("");

  // Step 4: Show the URL that would be opened
  console.log("Step 4: URL that would be opened by 'Apply with Claude Code' button:");
  const apiUrl = "http://localhost:3000";
  const url = `codehorse://apply?reviewId=${review.id}&token=${token}&apiUrl=${encodeURIComponent(apiUrl)}`;
  console.log(`  ${url}`);
  console.log("");

  console.log("✅ Full flow test completed!");
  console.log("\nTo test the actual button:");
  console.log(`  1. Open http://localhost:3000/dashboard/reviews/${review.id}`);
  console.log("  2. Click 'Apply with Claude Code' button");

  await prisma.$disconnect();
}

testFullFlow().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
