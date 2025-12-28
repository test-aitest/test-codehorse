"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { storeRule, deleteRule as deleteRuleFromStore } from "@/lib/learning/rule-store";
import type { RuleType, RuleSource, LearningRule } from "@prisma/client";

// 優先度レベルと信頼度のマッピング
const PRIORITY_CONFIDENCE_MAP = {
  high: 0.95,
  normal: 0.75,
  low: 0.5,
} as const;

export type Priority = keyof typeof PRIORITY_CONFIDENCE_MAP;

/**
 * ユーザーがアクセス可能なinstallationIdを取得
 */
async function getAccessibleInstallationIds(): Promise<number[]> {
  const repositories = await prisma.repository.findMany({
    select: { installationId: true },
    distinct: ["installationId"],
  });
  return repositories.map((r) => r.installationId);
}

/**
 * ルール一覧を取得
 */
export async function getRules(options?: {
  ruleType?: RuleType;
  language?: string;
  source?: RuleSource;
  sortBy?: "confidence" | "usageCount" | "createdAt";
  sortOrder?: "asc" | "desc";
}): Promise<LearningRule[]> {
  const installationIds = await getAccessibleInstallationIds();

  if (installationIds.length === 0) {
    return [];
  }

  const orderBy: Record<string, "asc" | "desc"> = {};
  if (options?.sortBy) {
    orderBy[options.sortBy] = options?.sortOrder || "desc";
  } else {
    orderBy.createdAt = "desc";
  }

  return prisma.learningRule.findMany({
    where: {
      installationId: { in: installationIds },
      ...(options?.ruleType && { ruleType: options.ruleType }),
      ...(options?.language && { language: options.language }),
      ...(options?.source && { source: options.source }),
    },
    orderBy,
  });
}

/**
 * ルール統計を取得
 */
export async function getRuleStats(): Promise<{
  totalRules: number;
  activeRules: number;
  lowConfidenceRules: number;
  recentlyUsedRules: number;
  byType: Record<RuleType, number>;
  bySource: Record<RuleSource, number>;
}> {
  const installationIds = await getAccessibleInstallationIds();

  if (installationIds.length === 0) {
    return {
      totalRules: 0,
      activeRules: 0,
      lowConfidenceRules: 0,
      recentlyUsedRules: 0,
      byType: {} as Record<RuleType, number>,
      bySource: {} as Record<RuleSource, number>,
    };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalRules,
    activeRules,
    lowConfidenceRules,
    recentlyUsedRules,
    typeGroups,
    sourceGroups,
  ] = await Promise.all([
    prisma.learningRule.count({
      where: { installationId: { in: installationIds } },
    }),
    prisma.learningRule.count({
      where: {
        installationId: { in: installationIds },
        confidence: { gte: 0.5 },
      },
    }),
    prisma.learningRule.count({
      where: {
        installationId: { in: installationIds },
        confidence: { lt: 0.3 },
      },
    }),
    prisma.learningRule.count({
      where: {
        installationId: { in: installationIds },
        lastUsedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.learningRule.groupBy({
      by: ["ruleType"],
      where: { installationId: { in: installationIds } },
      _count: true,
    }),
    prisma.learningRule.groupBy({
      by: ["source"],
      where: { installationId: { in: installationIds } },
      _count: true,
    }),
  ]);

  const byType = typeGroups.reduce(
    (acc, g) => {
      acc[g.ruleType] = g._count;
      return acc;
    },
    {} as Record<RuleType, number>
  );

  const bySource = sourceGroups.reduce(
    (acc, g) => {
      acc[g.source] = g._count;
      return acc;
    },
    {} as Record<RuleSource, number>
  );

  return {
    totalRules,
    activeRules,
    lowConfidenceRules,
    recentlyUsedRules,
    byType,
    bySource,
  };
}

/**
 * ルールを作成
 */
export async function createRule(data: {
  ruleText: string;
  ruleType: RuleType;
  language?: string;
  category?: string;
}): Promise<{ success: boolean; error?: string; rule?: LearningRule }> {
  try {
    const installationIds = await getAccessibleInstallationIds();
    if (installationIds.length === 0) {
      return { success: false, error: "No installation found" };
    }

    const installationId = installationIds[0];

    const rule = await storeRule(
      {
        ruleText: data.ruleText,
        ruleType: data.ruleType,
        confidence: 0.95, // 手動追加は高信頼度
        language: data.language,
        category: data.category,
        reasoning: "ユーザーが手動で追加したルール",
      },
      installationId,
      "EXPLICIT"
    );

    revalidatePath("/dashboard/learning");
    return { success: true, rule };
  } catch (error) {
    console.error("[Learning Actions] Failed to create rule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ルールを更新
 */
export async function updateRule(
  ruleId: string,
  data: {
    ruleText?: string;
    ruleType?: RuleType;
    language?: string | null;
    category?: string | null;
    confidence?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.learningRule.update({
      where: { id: ruleId },
      data: {
        ...(data.ruleText !== undefined && { ruleText: data.ruleText }),
        ...(data.ruleType !== undefined && { ruleType: data.ruleType }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.confidence !== undefined && { confidence: data.confidence }),
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/learning");
    return { success: true };
  } catch (error) {
    console.error("[Learning Actions] Failed to update rule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ルールを削除
 */
export async function deleteRule(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteRuleFromStore(ruleId);
    revalidatePath("/dashboard/learning");
    return { success: true };
  } catch (error) {
    console.error("[Learning Actions] Failed to delete rule:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * ルールの優先度を設定
 */
export async function setRulePriority(
  ruleId: string,
  priority: Priority
): Promise<{ success: boolean; error?: string }> {
  try {
    const confidence = PRIORITY_CONFIDENCE_MAP[priority];

    await prisma.learningRule.update({
      where: { id: ruleId },
      data: {
        confidence,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/learning");
    return { success: true };
  } catch (error) {
    console.error("[Learning Actions] Failed to set priority:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * フィードバック履歴を取得
 */
export async function getFeedbackHistory(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  feedbacks: Array<{
    id: string;
    type: string;
    userAction: string;
    aiSuggestion: string | null;
    userCode: string | null;
    filePath: string;
    language: string | null;
    createdAt: Date;
    processedAt: Date | null;
    extractedRules: Array<{ id: string; ruleText: string }>;
  }>;
  total: number;
}> {
  const installationIds = await getAccessibleInstallationIds();

  if (installationIds.length === 0) {
    return { feedbacks: [], total: 0 };
  }

  // リポジトリIDを取得
  const repositories = await prisma.repository.findMany({
    where: { installationId: { in: installationIds } },
    select: { id: true },
  });
  const repositoryIds = repositories.map((r) => r.id);

  const [feedbacks, total] = await Promise.all([
    prisma.reviewFeedback.findMany({
      where: {
        reviewComment: {
          review: {
            pullRequest: {
              repositoryId: { in: repositoryIds },
            },
          },
        },
      },
      include: {
        extractedRules: {
          select: { id: true, ruleText: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.reviewFeedback.count({
      where: {
        reviewComment: {
          review: {
            pullRequest: {
              repositoryId: { in: repositoryIds },
            },
          },
        },
      },
    }),
  ]);

  return {
    feedbacks: feedbacks.map((f) => ({
      id: f.id,
      type: f.type,
      userAction: f.userAction,
      aiSuggestion: f.aiSuggestion,
      userCode: f.userCode,
      filePath: f.filePath,
      language: f.language,
      createdAt: f.createdAt,
      processedAt: f.processedAt,
      extractedRules: f.extractedRules,
    })),
    total,
  };
}

/**
 * 利用可能な言語一覧を取得
 */
export async function getAvailableLanguages(): Promise<string[]> {
  const installationIds = await getAccessibleInstallationIds();

  if (installationIds.length === 0) {
    return [];
  }

  const languages = await prisma.learningRule.findMany({
    where: {
      installationId: { in: installationIds },
      language: { not: null },
    },
    select: { language: true },
    distinct: ["language"],
  });

  return languages
    .map((l) => l.language)
    .filter((l): l is string => l !== null);
}
