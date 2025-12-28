/**
 * Phase 0: Conversation Memory & Adaptive Learning テスト
 */

import { prisma } from "./src/lib/prisma";
import {
  saveConversation,
  saveConversationBatch,
  getConversationHistory,
  getConversationCount,
  saveFeedback,
  getFeedbackSummary,
  updateLearningInsight,
  getLearningInsights,
  getLearningInsightByCategory,
  deleteLearningInsight,
  clearConversationHistory,
  clearRepositoryMemory,
} from "./src/lib/ai/memory/conversation-store";
import {
  buildAdaptiveContext,
  buildAdaptivePromptSection,
  hasValidContext,
  createEmptyAdaptiveContext,
  deserializeAdaptiveContext,
} from "./src/lib/ai/memory/context-builder";
import { analyzeBasicTrends } from "./src/lib/ai/memory/feedback-analyzer";

// テスト結果の追跡
let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  return { name, fn };
}

async function runTest(testCase: {
  name: string;
  fn: () => Promise<void> | void;
}) {
  try {
    await testCase.fn();
    console.log(`✅ ${testCase.name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${testCase.name}`);
    console.log(`   Error: ${(error as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

// テストデータのセットアップ
async function setupTestData() {
  // テスト用リポジトリを作成
  const repository = await prisma.repository.create({
    data: {
      githubRepoId: 999999,
      owner: "test-owner",
      name: "test-repo",
      fullName: "test-owner/test-repo",
      htmlUrl: "https://github.com/test-owner/test-repo",
      installationId: 12345,
    },
  });

  // テスト用PRを作成
  const pullRequest = await prisma.pullRequest.create({
    data: {
      repositoryId: repository.id,
      number: 1,
      title: "Test PR",
      author: "test-user",
      baseSha: "abc123",
      headSha: "def456",
    },
  });

  return { repository, pullRequest };
}

// テストデータのクリーンアップ
async function cleanupTestData(repositoryId: string) {
  await prisma.learningInsight.deleteMany({ where: { repositoryId } });
  await prisma.userFeedback.deleteMany({ where: { repositoryId } });
  await prisma.conversationHistory.deleteMany({
    where: { pullRequest: { repositoryId } },
  });
  await prisma.pullRequest.deleteMany({ where: { repositoryId } });
  await prisma.repository.delete({ where: { id: repositoryId } });
}

// ========================================
// テストケース
// ========================================

const tests = [
  // 会話履歴のテスト
  test("saveConversation: 会話エントリを保存できる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      const entry = await saveConversation({
        pullRequestId: pullRequest.id,
        type: "REVIEW",
        role: "AI",
        content: "This is a test review comment",
        metadata: { filePath: "src/test.ts", lineNumber: 10 },
      });

      assert(entry.id !== undefined, "ID should be defined");
      assertEqual(entry.type, "REVIEW", "Type should match");
      assertEqual(entry.role, "AI", "Role should match");
      assertEqual(
        entry.content,
        "This is a test review comment",
        "Content should match"
      );
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("saveConversationBatch: 複数の会話エントリを一括保存できる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      const count = await saveConversationBatch([
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Comment 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Comment 2",
        },
        {
          pullRequestId: pullRequest.id,
          type: "USER_COMMENT",
          role: "USER",
          content: "User reply",
        },
      ]);

      assertEqual(count, 3, "Should save 3 entries");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getConversationHistory: 会話履歴を取得できる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversationBatch([
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Review 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "USER_COMMENT",
          role: "USER",
          content: "Reply 1",
        },
      ]);

      const history = await getConversationHistory({
        pullRequestId: pullRequest.id,
      });
      assertEqual(history.length, 2, "Should have 2 entries");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getConversationHistory: タイプでフィルタリングできる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversationBatch([
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Review 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "USER_COMMENT",
          role: "USER",
          content: "Reply 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "CHAT_QUESTION",
          role: "USER",
          content: "Question",
        },
      ]);

      const reviews = await getConversationHistory({
        pullRequestId: pullRequest.id,
        types: ["REVIEW"],
      });
      assertEqual(reviews.length, 1, "Should have 1 review entry");
      assertEqual(reviews[0].type, "REVIEW", "Type should be REVIEW");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getConversationCount: 会話数をカウントできる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversationBatch([
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Review 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Review 2",
        },
      ]);

      const count = await getConversationCount(pullRequest.id);
      assertEqual(count, 2, "Should count 2 entries");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  // フィードバックのテスト
  test("saveFeedback: フィードバックを保存できる", async () => {
    const { repository } = await setupTestData();
    try {
      const feedbackId = await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "HELPFUL",
        originalContent: "This is a helpful comment",
        userComment: "Thanks!",
      });

      assert(feedbackId !== undefined, "Feedback ID should be defined");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getFeedbackSummary: フィードバックサマリーを取得できる", async () => {
    const { repository } = await setupTestData();
    try {
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "HELPFUL",
        originalContent: "Comment 1",
      });
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "TOO_STRICT",
        originalContent: "Comment 2",
      });
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "HELPFUL",
        originalContent: "Comment 3",
      });

      const summary = await getFeedbackSummary(repository.id);
      assertEqual(summary.totalCount, 3, "Should have 3 feedbacks");
      assertEqual(summary.byType.HELPFUL, 2, "Should have 2 HELPFUL");
      assertEqual(summary.byType.TOO_STRICT, 1, "Should have 1 TOO_STRICT");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  // 学習インサイトのテスト
  test("updateLearningInsight: 学習インサイトを作成・更新できる", async () => {
    const { repository } = await setupTestData();
    try {
      // 作成
      const insight1 = await updateLearningInsight({
        repositoryId: repository.id,
        category: "SEVERITY",
        insight: "ユーザーは厳しいレビューを好む",
        confidence: 0.8,
        sampleCount: 10,
      });

      assertEqual(insight1.category, "SEVERITY", "Category should match");
      assertEqual(insight1.confidence, 0.8, "Confidence should match");

      // 更新
      const insight2 = await updateLearningInsight({
        repositoryId: repository.id,
        category: "SEVERITY",
        insight: "ユーザーは非常に厳しいレビューを好む",
        confidence: 0.9,
        sampleCount: 20,
      });

      assertEqual(
        insight2.insight,
        "ユーザーは非常に厳しいレビューを好む",
        "Insight should be updated"
      );
      assertEqual(insight2.sampleCount, 20, "Sample count should be updated");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getLearningInsights: 全インサイトを取得できる", async () => {
    const { repository } = await setupTestData();
    try {
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "SEVERITY",
        insight: "Severity insight",
        confidence: 0.8,
        sampleCount: 10,
      });
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "STYLE",
        insight: "Style insight",
        confidence: 0.7,
        sampleCount: 5,
      });

      const insights = await getLearningInsights(repository.id);
      assertEqual(insights.length, 2, "Should have 2 insights");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("getLearningInsightByCategory: カテゴリで取得できる", async () => {
    const { repository } = await setupTestData();
    try {
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "FOCUS_AREA",
        insight: "Focus on security",
        confidence: 0.9,
        sampleCount: 15,
      });

      const insight = await getLearningInsightByCategory(
        repository.id,
        "FOCUS_AREA"
      );
      assert(insight !== null, "Insight should exist");
      assertEqual(
        insight!.insight,
        "Focus on security",
        "Insight should match"
      );
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("deleteLearningInsight: インサイトを削除できる", async () => {
    const { repository } = await setupTestData();
    try {
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "LANGUAGE",
        insight: "TypeScript preferences",
        confidence: 0.6,
        sampleCount: 8,
      });

      const deleted = await deleteLearningInsight(repository.id, "LANGUAGE");
      assert(deleted, "Should return true on successful delete");

      const insight = await getLearningInsightByCategory(
        repository.id,
        "LANGUAGE"
      );
      assert(insight === null, "Insight should be deleted");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  // コンテキストビルダーのテスト
  test("buildAdaptiveContext: 適応コンテキストを構築できる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversation({
        pullRequestId: pullRequest.id,
        type: "REVIEW",
        role: "AI",
        content: "Review comment",
      });
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "SEVERITY",
        insight: "Prefer strict reviews",
        confidence: 0.8,
        sampleCount: 10,
      });

      const context = await buildAdaptiveContext({
        pullRequestId: pullRequest.id,
        repositoryId: repository.id,
      });

      assertEqual(
        context.conversationHistory.length,
        1,
        "Should have 1 conversation"
      );
      assertEqual(context.learningInsights.length, 1, "Should have 1 insight");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("buildAdaptivePromptSection: プロンプトセクションを生成できる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversation({
        pullRequestId: pullRequest.id,
        type: "REVIEW",
        role: "AI",
        content: "Test review",
      });
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "STYLE",
        insight: "Prefers concise comments",
        confidence: 0.7,
        sampleCount: 5,
      });

      const context = await buildAdaptiveContext({
        pullRequestId: pullRequest.id,
        repositoryId: repository.id,
      });

      const promptSection = buildAdaptivePromptSection(context);
      assert(
        promptSection.includes("学習済みの傾向"),
        "Should include insights section"
      );
      assert(
        promptSection.includes("会話履歴"),
        "Should include conversation section"
      );
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("hasValidContext: コンテキストの有効性をチェックできる", () => {
    const emptyContext = createEmptyAdaptiveContext();
    assert(!hasValidContext(emptyContext), "Empty context should be invalid");

    const validContext = {
      conversationHistory: [
        {
          id: "1",
          type: "REVIEW" as const,
          role: "AI" as const,
          content: "Test",
          createdAt: new Date(),
        },
      ],
      learningInsights: [],
    };
    assert(
      hasValidContext(validContext),
      "Context with history should be valid"
    );
  }),

  test("deserializeAdaptiveContext: シリアライズされたコンテキストを復元できる", () => {
    const serialized = {
      conversationHistory: [
        {
          id: "1",
          type: "REVIEW",
          role: "AI",
          content: "Test",
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      learningInsights: [],
    };

    const deserialized = deserializeAdaptiveContext(serialized);
    assert(deserialized !== undefined, "Should deserialize successfully");
    assert(
      deserialized!.conversationHistory[0].createdAt instanceof Date,
      "createdAt should be Date"
    );
  }),

  // フィードバック分析のテスト
  test("analyzeBasicTrends: 基本的な傾向分析ができる", async () => {
    const { repository } = await setupTestData();
    try {
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "HELPFUL",
        originalContent: "Good comment",
      });
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "TOO_STRICT",
        originalContent: "Too strict comment",
      });

      const trends = await analyzeBasicTrends(repository.id);
      assertEqual(trends.totalFeedbacks, 2, "Should have 2 feedbacks");
      assertEqual(trends.helpfulRate, 0.5, "Helpful rate should be 0.5");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  // クリーンアップ関数のテスト
  test("clearConversationHistory: 会話履歴をクリアできる", async () => {
    const { repository, pullRequest } = await setupTestData();
    try {
      await saveConversationBatch([
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Comment 1",
        },
        {
          pullRequestId: pullRequest.id,
          type: "REVIEW",
          role: "AI",
          content: "Comment 2",
        },
      ]);

      const cleared = await clearConversationHistory(pullRequest.id);
      assertEqual(cleared, 2, "Should clear 2 entries");

      const count = await getConversationCount(pullRequest.id);
      assertEqual(count, 0, "Should have 0 entries after clear");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),

  test("clearRepositoryMemory: リポジトリメモリをクリアできる", async () => {
    const { repository } = await setupTestData();
    try {
      await saveFeedback({
        repositoryId: repository.id,
        feedbackType: "HELPFUL",
        originalContent: "Comment",
      });
      await updateLearningInsight({
        repositoryId: repository.id,
        category: "STYLE",
        insight: "Style insight",
        confidence: 0.8,
        sampleCount: 10,
      });

      const result = await clearRepositoryMemory(repository.id);
      assertEqual(result.feedbacksDeleted, 1, "Should delete 1 feedback");
      assertEqual(result.insightsDeleted, 1, "Should delete 1 insight");
    } finally {
      await cleanupTestData(repository.id);
    }
  }),
];

// テスト実行
async function runAllTests() {
  console.log("========================================");
  console.log("Phase 0: Conversation Memory テスト");
  console.log("========================================\n");

  for (const testCase of tests) {
    await runTest(testCase);
  }

  console.log("\n========================================");
  console.log(`結果: ${passed} passed, ${failed} failed`);
  console.log("========================================");

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(console.error);
