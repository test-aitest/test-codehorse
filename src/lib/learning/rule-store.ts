// ルールストア
// 学習ルールのDB保存とPinecone連携

import { prisma } from "@/lib/prisma";
import { upsertRuleVectors, deleteRuleVector } from "@/lib/pinecone/client";
import {
  generateEmbedding,
  formatRuleForEmbedding,
} from "@/lib/pinecone/embeddings";
import { generateRuleVectorId } from "@/lib/pinecone/types";
import type { ExtractedRule, LEARNING_LIMITS } from "./types";
import type { LearningRule, RuleSource } from "@prisma/client";

/**
 * ルールをDBとPineconeに保存
 */
export async function storeRule(
  rule: ExtractedRule,
  installationId: number,
  source: RuleSource,
  repositoryId?: string,
  feedbackId?: string
): Promise<LearningRule> {
  // 1. DBレコードを作成
  const dbRule = await prisma.learningRule.create({
    data: {
      installationId,
      repositoryId,
      ruleText: rule.ruleText,
      ruleType: rule.ruleType,
      source,
      language: rule.language,
      category: rule.category,
      confidence: rule.confidence,
      feedbackId,
    },
  });

  // 2. Embeddingを生成
  const embeddingText = formatRuleForEmbedding({
    ruleText: rule.ruleText,
    ruleType: rule.ruleType,
    language: rule.language,
    category: rule.category,
  });

  const embedding = await generateEmbedding(embeddingText);

  // 3. PineconeにUpsert
  const vectorId = generateRuleVectorId(dbRule.id);

  await upsertRuleVectors(installationId, [
    {
      id: vectorId,
      values: embedding,
      metadata: {
        installationId,
        repositoryId,
        ruleId: dbRule.id,
        ruleType: dbRule.ruleType,
        source: dbRule.source,
        language: dbRule.language ?? undefined,
        category: dbRule.category ?? undefined,
        confidence: dbRule.confidence,
        createdAt: dbRule.createdAt.toISOString(),
      },
    },
  ]);

  // 4. DBにPinecone IDを保存
  const updatedRule = await prisma.learningRule.update({
    where: { id: dbRule.id },
    data: { pineconeId: vectorId },
  });

  console.log(`[RuleStore] Stored rule ${dbRule.id}: "${rule.ruleText.substring(0, 50)}..."`);

  return updatedRule;
}

/**
 * ルールを削除（DBとPinecone両方）
 */
export async function deleteRule(ruleId: string): Promise<void> {
  const rule = await prisma.learningRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    console.warn(`[RuleStore] Rule ${ruleId} not found`);
    return;
  }

  // Pineconeから削除
  if (rule.pineconeId) {
    await deleteRuleVector(rule.installationId, rule.pineconeId);
  }

  // DBから削除
  await prisma.learningRule.delete({
    where: { id: ruleId },
  });

  console.log(`[RuleStore] Deleted rule ${ruleId}`);
}

/**
 * ルールの信頼度を更新
 */
export async function updateRuleConfidence(
  ruleId: string,
  delta: number
): Promise<LearningRule | null> {
  const rule = await prisma.learningRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    return null;
  }

  // 信頼度を更新（0.0 - 1.0 の範囲に制限）
  const newConfidence = Math.max(0, Math.min(1, rule.confidence + delta));

  const updatedRule = await prisma.learningRule.update({
    where: { id: ruleId },
    data: {
      confidence: newConfidence,
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  // Pineconeのメタデータも更新（再Upsert）
  if (rule.pineconeId) {
    const embeddingText = formatRuleForEmbedding({
      ruleText: rule.ruleText,
      ruleType: rule.ruleType,
      language: rule.language ?? undefined,
      category: rule.category ?? undefined,
    });

    const embedding = await generateEmbedding(embeddingText);

    await upsertRuleVectors(rule.installationId, [
      {
        id: rule.pineconeId,
        values: embedding,
        metadata: {
          installationId: rule.installationId,
          repositoryId: rule.repositoryId ?? undefined,
          ruleId: rule.id,
          ruleType: rule.ruleType,
          source: rule.source,
          language: rule.language ?? undefined,
          category: rule.category ?? undefined,
          confidence: newConfidence,
          createdAt: rule.createdAt.toISOString(),
        },
      },
    ]);
  }

  return updatedRule;
}

/**
 * 日次のルール作成制限をチェック
 */
export async function checkDailyRuleLimit(
  installationId: number,
  maxRulesPerDay: number = 20
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayCount = await prisma.learningRule.count({
    where: {
      installationId,
      createdAt: { gte: today },
    },
  });

  return todayCount < maxRulesPerDay;
}

/**
 * 組織のルール総数をチェック
 */
export async function checkTotalRuleLimit(
  installationId: number,
  maxRulesPerOrg: number = 500
): Promise<boolean> {
  const totalCount = await prisma.learningRule.count({
    where: { installationId },
  });

  return totalCount < maxRulesPerOrg;
}

/**
 * 低信頼度のルールをクリーンアップ
 */
export async function cleanupLowConfidenceRules(
  installationId: number,
  minConfidence: number = 0.3
): Promise<number> {
  // 低信頼度のルールを取得
  const lowConfidenceRules = await prisma.learningRule.findMany({
    where: {
      installationId,
      confidence: { lt: minConfidence },
    },
  });

  // 各ルールを削除
  for (const rule of lowConfidenceRules) {
    await deleteRule(rule.id);
  }

  console.log(
    `[RuleStore] Cleaned up ${lowConfidenceRules.length} low confidence rules for installation ${installationId}`
  );

  return lowConfidenceRules.length;
}

/**
 * 古いルールの信頼度を減衰
 */
export async function decayOldRules(
  installationId: number,
  decayRate: number = 0.05,
  maxAgeDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // 最後に使用されてから一定期間経過したルールを取得
  const oldRules = await prisma.learningRule.findMany({
    where: {
      installationId,
      OR: [
        { lastUsedAt: { lt: cutoffDate } },
        { lastUsedAt: null, createdAt: { lt: cutoffDate } },
      ],
    },
  });

  let decayedCount = 0;

  for (const rule of oldRules) {
    const newConfidence = rule.confidence * (1 - decayRate);

    await prisma.learningRule.update({
      where: { id: rule.id },
      data: { confidence: newConfidence },
    });

    decayedCount++;
  }

  console.log(
    `[RuleStore] Decayed confidence for ${decayedCount} old rules for installation ${installationId}`
  );

  return decayedCount;
}

/**
 * 類似ルールをマージ
 */
export async function mergeSimilarRules(
  installationId: number,
  similarityThreshold: number = 0.8
): Promise<number> {
  // TODO: 実装
  // 1. 同じinstallationのルールを取得
  // 2. Embedding similarityで類似ルールを検出
  // 3. 類似ルールをマージ（信頼度を統合）
  // 4. 古いルールを削除

  console.log("[RuleStore] Rule merging not yet implemented");
  return 0;
}

/**
 * ルールの使用を追跡
 * レビュー時にルールが使用された場合に呼び出す
 */
export async function trackRuleUsage(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;

  // 一括更新：lastUsedAtとusageCountを更新
  await prisma.learningRule.updateMany({
    where: {
      id: { in: ruleIds },
    },
    data: {
      lastUsedAt: new Date(),
      // usageCountはupdateManyでは増分更新できないため、個別に処理
    },
  });

  // usageCountの増分更新（個別に実行）
  // パフォーマンスのため、バックグラウンドで処理することも検討
  for (const ruleId of ruleIds) {
    await prisma.learningRule.update({
      where: { id: ruleId },
      data: {
        usageCount: { increment: 1 },
      },
    });
  }
}

/**
 * ルール使用統計を取得
 */
export async function getRuleStats(installationId: number): Promise<{
  totalRules: number;
  activeRules: number;
  lowConfidenceRules: number;
  recentlyUsedRules: number;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalRules, activeRules, lowConfidenceRules, recentlyUsedRules] =
    await Promise.all([
      prisma.learningRule.count({
        where: { installationId },
      }),
      prisma.learningRule.count({
        where: {
          installationId,
          confidence: { gte: 0.5 },
        },
      }),
      prisma.learningRule.count({
        where: {
          installationId,
          confidence: { lt: 0.3 },
        },
      }),
      prisma.learningRule.count({
        where: {
          installationId,
          lastUsedAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

  return {
    totalRules,
    activeRules,
    lowConfidenceRules,
    recentlyUsedRules,
  };
}

/**
 * ルールの信頼度を強化
 * ポジティブなフィードバック時に呼び出す
 */
export async function reinforceRule(ruleId: string, boost: number = 0.1): Promise<void> {
  const rule = await prisma.learningRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) return;

  // 信頼度は最大1.0
  const newConfidence = Math.min(1.0, rule.confidence + boost);

  await prisma.learningRule.update({
    where: { id: ruleId },
    data: {
      confidence: newConfidence,
      lastUsedAt: new Date(),
      usageCount: { increment: 1 },
    },
  });
}

/**
 * ルールの信頼度を弱化
 * ネガティブなフィードバック時に呼び出す
 */
export async function weakenRule(ruleId: string, penalty: number = 0.15): Promise<void> {
  const rule = await prisma.learningRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) return;

  // 信頼度は最小0.0
  const newConfidence = Math.max(0.0, rule.confidence - penalty);

  await prisma.learningRule.update({
    where: { id: ruleId },
    data: {
      confidence: newConfidence,
    },
  });

  // 信頼度が閾値以下になったら削除
  if (newConfidence < 0.1) {
    await deleteRule(ruleId);
    console.log(`[RuleStore] Deleted rule ${ruleId} due to low confidence`);
  }
}
