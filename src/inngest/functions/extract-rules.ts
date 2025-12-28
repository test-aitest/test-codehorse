// ルール抽出 Inngest 関数
// フィードバックからルールを抽出してPineconeに保存

import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import {
  extractRulesFromFeedback,
  extractExplicitRule,
} from "@/lib/learning/rule-extractor";
import {
  storeRule,
  checkDailyRuleLimit,
  checkTotalRuleLimit,
  cleanupLowConfidenceRules,
  decayOldRules,
} from "@/lib/learning/rule-store";
import { detectLanguage, LEARNING_LIMITS } from "@/lib/learning/types";
import type { FeedbackContext } from "@/lib/learning/types";

/**
 * フィードバックからルールを抽出して保存
 */
export const extractRulesJob = inngest.createFunction(
  {
    id: "extract-rules",
    concurrency: { limit: 3, key: "event.data.installationId" },
    retries: 2,
  },
  { event: "learning/rule.extract" },
  async ({ event, step }) => {
    const { feedbackId, installationId, repositoryId } = event.data;

    // Step 1: レート制限をチェック
    const canProceed = await step.run("check-rate-limits", async () => {
      const dailyOk = await checkDailyRuleLimit(
        installationId,
        LEARNING_LIMITS.MAX_RULES_PER_DAY
      );
      const totalOk = await checkTotalRuleLimit(
        installationId,
        LEARNING_LIMITS.MAX_RULES_PER_ORG
      );

      return { dailyOk, totalOk };
    });

    if (!canProceed.dailyOk) {
      console.log(
        `[ExtractRules] Daily limit reached for installation ${installationId}`
      );
      return { skipped: true, reason: "Daily limit reached" };
    }

    if (!canProceed.totalOk) {
      console.log(
        `[ExtractRules] Total limit reached for installation ${installationId}`
      );
      return { skipped: true, reason: "Total limit reached" };
    }

    // Step 2: フィードバックを取得
    const feedback = await step.run("load-feedback", async () => {
      return prisma.reviewFeedback.findUnique({
        where: { id: feedbackId },
        include: {
          reviewComment: {
            include: {
              review: {
                include: {
                  pullRequest: {
                    include: { repository: true },
                  },
                },
              },
            },
          },
        },
      });
    });

    if (!feedback) {
      return { skipped: true, reason: "Feedback not found" };
    }

    // Step 3: コンテキストを構築
    const context = await step.run(
      "build-context",
      async (): Promise<FeedbackContext> => {
        const language = feedback.language || detectLanguage(feedback.filePath);

        return {
          aiSuggestion: feedback.aiSuggestion || feedback.reviewComment?.body || "",
          userCode: feedback.userCode || undefined,
          filePath: feedback.filePath,
          language: language || "unknown",
          prTitle: feedback.reviewComment?.review?.pullRequest?.title,
          userExplanation: feedback.userExplanation || undefined,
        };
      }
    );

    // Step 4: ルールを抽出
    const extractionResult = await step.run("extract-rules", async () => {
      // 明示的なルールの場合は直接抽出
      if (feedback.userExplanation && feedback.userAction === "MODIFIED") {
        const explicitRule = await extractExplicitRule(
          feedback.userExplanation,
          "OTHER",
          context.language
        );

        if (explicitRule) {
          return {
            rules: [explicitRule],
            skipped: false,
          };
        }
      }

      // AIで抽出
      return extractRulesFromFeedback(context);
    });

    if (extractionResult.skipped || extractionResult.rules.length === 0) {
      console.log(
        `[ExtractRules] No rules extracted for feedback ${feedbackId}: ${extractionResult.skipReason}`
      );

      // フィードバックを処理済みとしてマーク
      await step.run("mark-processed", async () => {
        await prisma.reviewFeedback.update({
          where: { id: feedbackId },
          data: { processedAt: new Date() },
        });
      });

      return {
        skipped: true,
        reason: extractionResult.skipReason || "No rules extracted",
      };
    }

    // Step 5: ルールを保存
    const storedRules = await step.run("store-rules", async () => {
      const stored = [];

      for (const rule of extractionResult.rules) {
        // 信頼度が低すぎるルールはスキップ
        if (rule.confidence < LEARNING_LIMITS.MIN_CONFIDENCE_THRESHOLD) {
          console.log(
            `[ExtractRules] Skipping low confidence rule: ${rule.ruleText.substring(0, 50)}...`
          );
          continue;
        }

        const source = feedback.userExplanation ? "EXPLICIT" : "IMPLICIT";

        const storedRule = await storeRule(
          rule,
          installationId,
          source,
          repositoryId,
          feedbackId
        );

        stored.push({
          id: storedRule.id,
          ruleText: storedRule.ruleText,
          ruleType: storedRule.ruleType,
          confidence: storedRule.confidence,
        });
      }

      return stored;
    });

    // Step 6: フィードバックを処理済みとしてマーク
    await step.run("mark-processed", async () => {
      await prisma.reviewFeedback.update({
        where: { id: feedbackId },
        data: { processedAt: new Date() },
      });
    });

    console.log(
      `[ExtractRules] Extracted ${storedRules.length} rules from feedback ${feedbackId}`
    );

    return {
      feedbackId,
      rulesExtracted: storedRules.length,
      rules: storedRules,
    };
  }
);

/**
 * 低信頼度ルールのクリーンアップ（定期実行）
 */
export const cleanupRulesJob = inngest.createFunction(
  {
    id: "cleanup-rules",
    retries: 1,
  },
  { event: "learning/rules.cleanup" },
  async ({ event, step }) => {
    const { installationId, minConfidence = 0.3 } = event.data;

    // Step 1: 古いルールの信頼度を減衰
    const decayedCount = await step.run("decay-old-rules", async () => {
      return decayOldRules(
        installationId,
        LEARNING_LIMITS.CONFIDENCE_DECAY_RATE,
        30 // 30日以上未使用
      );
    });

    // Step 2: 低信頼度ルールを削除
    const deletedCount = await step.run("cleanup-low-confidence", async () => {
      return cleanupLowConfidenceRules(installationId, minConfidence);
    });

    console.log(
      `[CleanupRules] Installation ${installationId}: decayed ${decayedCount}, deleted ${deletedCount}`
    );

    return {
      installationId,
      decayedCount,
      deletedCount,
    };
  }
);

/**
 * 全インストールのルールを定期的にクリーンアップ（週次cron）
 */
export const scheduledRulesCleanupJob = inngest.createFunction(
  {
    id: "scheduled-rules-cleanup",
    retries: 1,
  },
  { cron: "0 3 * * 0" }, // 毎週日曜日の午前3時（UTC）
  async ({ step }) => {
    // Step 1: アクティブなインストールを取得
    const installations = await step.run("get-installations", async () => {
      const repos = await prisma.repository.findMany({
        select: { installationId: true },
        distinct: ["installationId"],
      });
      return repos.map((r) => r.installationId);
    });

    console.log(
      `[ScheduledCleanup] Processing ${installations.length} installations`
    );

    // Step 2: 各インストールをクリーンアップ
    const results = await step.run("cleanup-all", async () => {
      const cleanupResults: Array<{
        installationId: number;
        decayed: number;
        deleted: number;
      }> = [];

      for (const installationId of installations) {
        const decayed = await decayOldRules(
          installationId,
          LEARNING_LIMITS.CONFIDENCE_DECAY_RATE,
          30
        );
        const deleted = await cleanupLowConfidenceRules(installationId, 0.3);

        cleanupResults.push({
          installationId,
          decayed,
          deleted,
        });
      }

      return cleanupResults;
    });

    const totalDecayed = results.reduce((sum, r) => sum + r.decayed, 0);
    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);

    console.log(
      `[ScheduledCleanup] Completed: decayed ${totalDecayed}, deleted ${totalDeleted} rules`
    );

    return {
      installationsProcessed: installations.length,
      totalDecayed,
      totalDeleted,
      details: results,
    };
  }
);
