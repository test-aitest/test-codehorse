/**
 * Conversation Store
 *
 * 会話履歴の保存と取得を管理
 */

import { prisma } from "@/lib/prisma";
import type { ConversationType, ConversationRole, FeedbackType, InsightCategory } from "@prisma/client";
import type {
  ConversationEntry,
  ConversationMetadata,
  SaveConversationParams,
  GetConversationOptions,
  SaveFeedbackParams,
  FeedbackSummary,
  LearningInsightData,
  UpdateInsightParams,
} from "./types";

// ========================================
// 会話履歴の操作
// ========================================

/**
 * 会話エントリを保存
 */
export async function saveConversation(
  params: SaveConversationParams
): Promise<ConversationEntry> {
  const { pullRequestId, type, role, content, metadata } = params;

  const entry = await prisma.conversationHistory.create({
    data: {
      pullRequestId,
      type,
      role,
      content,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
    },
  });

  return {
    id: entry.id,
    type: entry.type as ConversationType,
    role: entry.role as ConversationRole,
    content: entry.content,
    metadata: entry.metadata as ConversationMetadata | undefined,
    createdAt: entry.createdAt,
  };
}

/**
 * 複数の会話エントリを一括保存
 */
export async function saveConversationBatch(
  entries: SaveConversationParams[]
): Promise<number> {
  const result = await prisma.conversationHistory.createMany({
    data: entries.map((entry) => ({
      pullRequestId: entry.pullRequestId,
      type: entry.type,
      role: entry.role,
      content: entry.content,
      metadata: entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : null,
    })),
  });

  return result.count;
}

/**
 * PR内の会話履歴を取得
 */
export async function getConversationHistory(
  options: GetConversationOptions
): Promise<ConversationEntry[]> {
  const { pullRequestId, limit = 50, types, since } = options;

  const entries = await prisma.conversationHistory.findMany({
    where: {
      pullRequestId,
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type as ConversationType,
    role: entry.role as ConversationRole,
    content: entry.content,
    metadata: entry.metadata as ConversationMetadata | undefined,
    createdAt: entry.createdAt,
  }));
}

/**
 * 最新の会話履歴を取得（新しい順）
 */
export async function getRecentConversations(
  pullRequestId: string,
  limit: number = 10
): Promise<ConversationEntry[]> {
  const entries = await prisma.conversationHistory.findMany({
    where: { pullRequestId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // 時系列順に戻す
  return entries.reverse().map((entry) => ({
    id: entry.id,
    type: entry.type as ConversationType,
    role: entry.role as ConversationRole,
    content: entry.content,
    metadata: entry.metadata as ConversationMetadata | undefined,
    createdAt: entry.createdAt,
  }));
}

/**
 * 会話履歴のカウントを取得
 */
export async function getConversationCount(pullRequestId: string): Promise<number> {
  return prisma.conversationHistory.count({
    where: { pullRequestId },
  });
}

// ========================================
// フィードバックの操作
// ========================================

/**
 * ユーザーフィードバックを保存
 */
export async function saveFeedback(params: SaveFeedbackParams): Promise<string> {
  const feedback = await prisma.userFeedback.create({
    data: {
      repositoryId: params.repositoryId,
      commentId: params.commentId,
      feedbackType: params.feedbackType,
      userComment: params.userComment,
      originalContent: params.originalContent,
    },
  });

  return feedback.id;
}

/**
 * リポジトリのフィードバックサマリーを取得
 */
export async function getFeedbackSummary(
  repositoryId: string,
  lookbackDays: number = 30
): Promise<FeedbackSummary> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const feedbacks = await prisma.userFeedback.findMany({
    where: {
      repositoryId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });

  // タイプ別にカウント
  const byType: Record<FeedbackType, number> = {
    HELPFUL: 0,
    NOT_HELPFUL: 0,
    INCORRECT: 0,
    TOO_STRICT: 0,
    TOO_LENIENT: 0,
  };

  for (const feedback of feedbacks) {
    byType[feedback.feedbackType as FeedbackType]++;
  }

  return {
    repositoryId,
    totalCount: feedbacks.length,
    byType,
    recentFeedbacks: feedbacks.slice(0, 10).map((f) => ({
      feedbackType: f.feedbackType as FeedbackType,
      userComment: f.userComment ?? undefined,
      originalContent: f.originalContent,
      createdAt: f.createdAt,
    })),
  };
}

/**
 * 分析用のフィードバックを取得
 */
export async function getFeedbacksForAnalysis(
  repositoryId: string,
  options: { lookbackDays?: number; limit?: number } = {}
): Promise<Array<{
  feedbackType: FeedbackType;
  userComment: string | null;
  originalContent: string;
  createdAt: Date;
}>> {
  const { lookbackDays = 30, limit = 100 } = options;

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  return prisma.userFeedback.findMany({
    where: {
      repositoryId,
      createdAt: { gte: since },
    },
    select: {
      feedbackType: true,
      userComment: true,
      originalContent: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ========================================
// 学習インサイトの操作
// ========================================

/**
 * 学習インサイトを更新（upsert）
 */
export async function updateLearningInsight(
  params: UpdateInsightParams
): Promise<LearningInsightData> {
  const insight = await prisma.learningInsight.upsert({
    where: {
      repositoryId_category: {
        repositoryId: params.repositoryId,
        category: params.category,
      },
    },
    update: {
      insight: params.insight,
      confidence: params.confidence,
      sampleCount: params.sampleCount,
    },
    create: {
      repositoryId: params.repositoryId,
      category: params.category,
      insight: params.insight,
      confidence: params.confidence,
      sampleCount: params.sampleCount,
    },
  });

  return {
    category: insight.category as InsightCategory,
    insight: insight.insight,
    confidence: insight.confidence,
    sampleCount: insight.sampleCount,
  };
}

/**
 * リポジトリの全学習インサイトを取得
 */
export async function getLearningInsights(
  repositoryId: string
): Promise<LearningInsightData[]> {
  const insights = await prisma.learningInsight.findMany({
    where: { repositoryId },
  });

  return insights.map((insight) => ({
    category: insight.category as InsightCategory,
    insight: insight.insight,
    confidence: insight.confidence,
    sampleCount: insight.sampleCount,
  }));
}

/**
 * 特定カテゴリの学習インサイトを取得
 */
export async function getLearningInsightByCategory(
  repositoryId: string,
  category: InsightCategory
): Promise<LearningInsightData | null> {
  const insight = await prisma.learningInsight.findUnique({
    where: {
      repositoryId_category: {
        repositoryId,
        category,
      },
    },
  });

  if (!insight) return null;

  return {
    category: insight.category as InsightCategory,
    insight: insight.insight,
    confidence: insight.confidence,
    sampleCount: insight.sampleCount,
  };
}

/**
 * 学習インサイトを削除
 */
export async function deleteLearningInsight(
  repositoryId: string,
  category: InsightCategory
): Promise<boolean> {
  try {
    await prisma.learningInsight.delete({
      where: {
        repositoryId_category: {
          repositoryId,
          category,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * PRの会話履歴を削除
 */
export async function clearConversationHistory(pullRequestId: string): Promise<number> {
  const result = await prisma.conversationHistory.deleteMany({
    where: { pullRequestId },
  });
  return result.count;
}

/**
 * リポジトリの全データをクリア（学習インサイト、フィードバック）
 */
export async function clearRepositoryMemory(repositoryId: string): Promise<{
  feedbacksDeleted: number;
  insightsDeleted: number;
}> {
  const [feedbacks, insights] = await Promise.all([
    prisma.userFeedback.deleteMany({ where: { repositoryId } }),
    prisma.learningInsight.deleteMany({ where: { repositoryId } }),
  ]);

  return {
    feedbacksDeleted: feedbacks.count,
    insightsDeleted: insights.count,
  };
}
