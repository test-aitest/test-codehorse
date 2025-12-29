/**
 * Inngest Functions Integration Test
 *
 * このスクリプトでInngest関数の動作を確認します
 * 実行: npx ts-node scripts/test-inngest-functions.ts
 */

import { Inngest } from "inngest";

// テスト用Inngestクライアント
const inngest = new Inngest({
  id: "codehorse-test",
  eventKey: process.env.INNGEST_EVENT_KEY || "test-key",
});

async function testCommentPersistence() {
  console.log("\n=== Phase 1: Comment Persistence テスト ===\n");

  // 1. コメント発生記録テスト
  console.log("1. Record Comment Occurrences テスト...");
  try {
    const recordResult = await inngest.send({
      name: "comment/record-occurrence",
      data: {
        repositoryId: "test-repo-id",
        reviewId: "test-review-id",
        pullRequestId: "test-pr-id",
        comments: [
          {
            filePath: "src/test.ts",
            lineNumber: 42,
            commentBody: "SQL Injection vulnerability detected",
            severity: "CRITICAL",
            category: "security",
          },
          {
            filePath: "src/api.ts",
            lineNumber: 100,
            commentBody: "Consider adding error handling",
            severity: "INFO",
          },
        ],
      },
    });
    console.log("   ✅ イベント送信成功:", recordResult);
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }

  // 2. ユーザーアクションテスト
  console.log("\n2. User Action テスト...");
  try {
    const actionResult = await inngest.send({
      name: "comment/user-action",
      data: {
        occurrenceId: "test-occurrence-id",
        actionType: "ADDRESSED",
        userResponse: "Fixed the issue",
      },
    });
    console.log("   ✅ イベント送信成功:", actionResult);
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }

  // 3. クリーンアップテスト
  console.log("\n3. Cleanup テスト...");
  try {
    const cleanupResult = await inngest.send({
      name: "comment/cleanup-expired",
      data: {
        repositoryId: "test-repo-id",
        expirationDays: 90,
      },
    });
    console.log("   ✅ イベント送信成功:", cleanupResult);
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }
}

async function testReviewPR() {
  console.log("\n=== Review PR テスト ===\n");

  console.log("PR Review イベント（テストデータ）...");
  try {
    const reviewResult = await inngest.send({
      name: "github/pull_request.opened",
      data: {
        owner: "test-owner",
        repo: "test-repo",
        prNumber: 1,
        headSha: "abc123",
        baseSha: "def456",
        installationId: 12345,
      },
    });
    console.log("   ✅ イベント送信成功:", reviewResult);
    console.log("   ℹ️  実際のGitHub連携がないためレビューは実行されません");
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }
}

async function testAnalysisFunctions() {
  console.log("\n=== Analysis Functions テスト ===\n");

  // Performance Analysis
  console.log("1. Performance Analysis テスト...");
  try {
    await inngest.send({
      name: "github/analyze-performance",
      data: {
        installationId: 12345,
        owner: "test-owner",
        repo: "test-repo",
        prNumber: 1,
        headSha: "abc123",
        reviewId: "test-review-id",
      },
    });
    console.log("   ✅ イベント送信成功");
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }

  // Security Scan
  console.log("\n2. Security Scan テスト...");
  try {
    await inngest.send({
      name: "github/scan-security",
      data: {
        installationId: 12345,
        owner: "test-owner",
        repo: "test-repo",
        prNumber: 1,
        headSha: "abc123",
        reviewId: "test-review-id",
      },
    });
    console.log("   ✅ イベント送信成功");
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }

  // Documentation Analysis
  console.log("\n3. Documentation Analysis テスト...");
  try {
    await inngest.send({
      name: "github/analyze-documentation",
      data: {
        installationId: 12345,
        owner: "test-owner",
        repo: "test-repo",
        prNumber: 1,
        headSha: "abc123",
        reviewId: "test-review-id",
      },
    });
    console.log("   ✅ イベント送信成功");
  } catch (error) {
    console.log("   ❌ エラー:", error);
  }
}

async function main() {
  console.log("========================================");
  console.log("  Inngest Functions Integration Test");
  console.log("========================================");
  console.log("\nInngest Dev Server: http://localhost:8288");
  console.log("Next.js App: http://localhost:3000\n");

  await testCommentPersistence();
  await testReviewPR();
  await testAnalysisFunctions();

  console.log("\n========================================");
  console.log("  テスト完了");
  console.log("========================================");
  console.log("\nInngest Dev UI (http://localhost:8288) で");
  console.log("Runs タブを確認してイベント処理状況を確認してください。");
}

main().catch(console.error);
