/**
 * All Inngest Functions Integration Test
 *
 * すべてのInngest関数の動作を確認するスクリプト
 * 実行: npx ts-node scripts/test-all-inngest-functions.ts
 */

import { Inngest } from "inngest";

const inngest = new Inngest({
  id: "codehorse-test",
  eventKey: process.env.INNGEST_EVENT_KEY || "test-key",
});

interface TestResult {
  name: string;
  status: "success" | "error";
  eventId?: string;
  error?: string;
}

const results: TestResult[] = [];

async function sendEvent(name: string, eventName: string, data: Record<string, unknown>) {
  try {
    const result = await inngest.send({
      name: eventName,
      data,
    });
    results.push({
      name,
      status: "success",
      eventId: result.ids?.[0],
    });
    console.log(`  ✅ ${name}: イベント送信成功`);
    return true;
  } catch (error) {
    results.push({
      name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`  ❌ ${name}: ${error}`);
    return false;
  }
}

async function testPhase1CommentPersistence() {
  console.log("\n=== Phase 1: Comment Persistence ===\n");

  // recordCommentOccurrences
  await sendEvent("recordCommentOccurrences", "comment/record-occurrence", {
    repositoryId: "test-repo-id",
    reviewId: "test-review-id",
    pullRequestId: "test-pr-id",
    comments: [
      {
        filePath: "src/test.ts",
        lineNumber: 42,
        commentBody: "Test comment for verification",
        severity: "INFO",
        category: "test",
      },
    ],
  });

  // handleUserAction
  await sendEvent("handleUserAction", "comment/user-action", {
    occurrenceId: "test-occurrence-id",
    actionType: "ACKNOWLEDGED",
    userResponse: "Test acknowledgment",
  });

  // cleanupExpiredComments
  await sendEvent("cleanupExpiredComments", "comment/cleanup-expired", {
    repositoryId: "test-repo-id",
    expirationDays: 90,
  });

  // trackCommentResolution
  await sendEvent("trackCommentResolution", "review/comments-posted", {
    reviewId: "test-review-id",
    repositoryId: "test-repo-id",
    pullRequestId: "test-pr-id",
    comments: [
      {
        id: "comment-1",
        filePath: "src/test.ts",
        lineNumber: 10,
        body: "Test comment",
      },
    ],
  });
}

async function testPhase4TestGeneration() {
  console.log("\n=== Phase 4: Test Generation ===\n");

  await sendEvent("generateTestsForPR", "github/generate-tests", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    reviewId: "test-review-id",
  });
}

async function testPhase5Documentation() {
  console.log("\n=== Phase 5: Documentation Analysis ===\n");

  await sendEvent("analyzeDocumentationForPR", "github/analyze-documentation", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    reviewId: "test-review-id",
  });
}

async function testPhase8Performance() {
  console.log("\n=== Phase 8: Performance Analysis ===\n");

  await sendEvent("analyzePerformanceForPR", "github/analyze-performance", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    reviewId: "test-review-id",
  });
}

async function testPhase9CIAnalysis() {
  console.log("\n=== Phase 9: CI Failure Analysis ===\n");

  await sendEvent("analyzeCIFailure", "github/ci-failure", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    checkRunId: "check-123",
    conclusion: "failure",
  });

  await sendEvent("handleCheckRunCompleted", "github/check_run.completed", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    checkRunId: 123456,
    conclusion: "failure",
    name: "test-check",
  });
}

async function testPhase10Security() {
  console.log("\n=== Phase 10: Security Scan ===\n");

  await sendEvent("scanSecurityForPR", "github/scan-security", {
    installationId: 12345,
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    reviewId: "test-review-id",
  });
}

async function testCoreReviewFunctions() {
  console.log("\n=== Core: Review Functions ===\n");

  await sendEvent("reviewPR", "github/pull_request.opened", {
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    baseSha: "def456",
    installationId: 12345,
  });

  await sendEvent("reviewPRIncremental", "github/pull_request.synchronize", {
    owner: "test-owner",
    repo: "test-repo",
    prNumber: 1,
    headSha: "abc123",
    baseSha: "def456",
    installationId: 12345,
  });
}

async function testIndexingFunctions() {
  console.log("\n=== Core: Indexing Functions ===\n");

  await sendEvent("indexRepositoryJob", "github/index-repository", {
    repositoryId: "test-repo-id",
    owner: "test-owner",
    repo: "test-repo",
    installationId: 12345,
  });

  await sendEvent("incrementalIndexJob", "github/incremental-index", {
    repositoryId: "test-repo-id",
    owner: "test-owner",
    repo: "test-repo",
    installationId: 12345,
    changedFiles: ["src/test.ts"],
    commitSha: "abc123",
  });

  await sendEvent("deleteIndexJob", "github/delete-index", {
    repositoryId: "test-repo-id",
  });
}

async function testChatFunction() {
  console.log("\n=== Core: Chat Function ===\n");

  await sendEvent("chatResponseJob", "chat/message", {
    conversationId: "test-conversation-id",
    repositoryId: "test-repo-id",
    message: "Test message",
    userId: "test-user-id",
  });
}

async function main() {
  console.log("========================================");
  console.log("  All Inngest Functions Integration Test");
  console.log("========================================");
  console.log("\nInngest Dev Server: http://localhost:8288");
  console.log("Next.js App: http://localhost:3000\n");

  await testPhase1CommentPersistence();
  await testPhase4TestGeneration();
  await testPhase5Documentation();
  await testPhase8Performance();
  await testPhase9CIAnalysis();
  await testPhase10Security();
  await testCoreReviewFunctions();
  await testIndexingFunctions();
  await testChatFunction();

  // Summary
  console.log("\n========================================");
  console.log("  テスト結果サマリー");
  console.log("========================================\n");

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  console.log(`合計: ${results.length} 関数`);
  console.log(`成功: ${successCount} ✅`);
  console.log(`失敗: ${errorCount} ❌`);

  if (errorCount > 0) {
    console.log("\n失敗した関数:");
    results
      .filter((r) => r.status === "error")
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log("\n========================================");
  console.log("Inngest Dev UI (http://localhost:8288) で");
  console.log("Runs タブを確認してイベント処理状況を確認してください。");
  console.log("========================================");
}

main().catch(console.error);
