// フィードバック処理 Inngest 関数
// ユーザーのフィードバックを収集し、ルール抽出をトリガーする

import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { detectLanguage } from "@/lib/learning/types";
import type { FeedbackType, UserAction } from "@prisma/client";

/**
 * リアクションフィードバックを処理
 * ユーザーがレビューコメントに👎をつけた場合にルール抽出をトリガー
 */
export const processReactionFeedback = inngest.createFunction(
  {
    id: "process-reaction-feedback",
    concurrency: { limit: 5, key: "event.data.installationId" },
    retries: 3,
  },
  { event: "feedback/reaction.added" },
  async ({ event, step }) => {
    const { installationId, commentId, reaction } = event.data;

    // Step 1: コメントを特定してReviewCommentを取得
    const reviewComment = await step.run("find-review-comment", async () => {
      const comment = await prisma.reviewComment.findUnique({
        where: { githubCommentId: commentId },
        include: {
          review: {
            include: {
              pullRequest: {
                include: { repository: true },
              },
            },
          },
        },
      });

      if (!comment) {
        console.log(
          `[Feedback] Comment ${commentId} not found in database, might not be a CodeHorse comment`
        );
        return null;
      }

      return comment;
    });

    if (!reviewComment) {
      return { skipped: true, reason: "Comment not found" };
    }

    // Step 2: フィードバックの種類を判定
    const feedbackAction = await step.run("determine-action", async (): Promise<{
      action: UserAction;
      shouldExtractRules: boolean;
    }> => {
      if (reaction === "thumbs_down") {
        return { action: "REJECTED", shouldExtractRules: true };
      } else if (reaction === "thumbs_up") {
        return { action: "ACCEPTED", shouldExtractRules: false };
      } else if (reaction === "confused") {
        return { action: "REJECTED", shouldExtractRules: false };
      }

      return { action: "IGNORED", shouldExtractRules: false };
    });

    // Step 3: フィードバックをDBに保存
    const feedback = await step.run("save-feedback", async () => {
      const language = detectLanguage(reviewComment.filePath);

      return prisma.reviewFeedback.create({
        data: {
          reviewCommentId: reviewComment.id,
          type: "INLINE_COMMENT" as FeedbackType,
          userAction: feedbackAction.action,
          aiSuggestion: reviewComment.body,
          filePath: reviewComment.filePath,
          language,
          lineNumber: reviewComment.lineNumber,
        },
      });
    });

    // Step 4: 拒否の場合はルール抽出をトリガー
    if (feedbackAction.shouldExtractRules) {
      await step.sendEvent("trigger-rule-extraction", {
        name: "learning/rule.extract",
        data: {
          feedbackId: feedback.id,
          installationId,
          repositoryId: reviewComment.review.pullRequest.repository.id,
        },
      });

      console.log(
        `[Feedback] Triggered rule extraction for feedback ${feedback.id}`
      );
    }

    return {
      feedbackId: feedback.id,
      action: feedbackAction.action,
      ruleExtractionTriggered: feedbackAction.shouldExtractRules,
    };
  }
);

/**
 * 明示的なフィードバックコマンドを処理
 * "@codehorse prefer X" や "@codehorse add rule: Y" などを解析
 */
export const processExplicitFeedback = inngest.createFunction(
  {
    id: "process-explicit-feedback",
    concurrency: { limit: 3, key: "event.data.installationId" },
    retries: 2,
  },
  { event: "feedback/explicit.received" },
  async ({ event, step }) => {
    const { installationId, owner, repo, commentBody, contextCommentId } =
      event.data;

    // Step 1: コマンドを解析
    const parsedCommand = await step.run("parse-command", async () => {
      return parseExplicitCommand(commentBody);
    });

    if (!parsedCommand) {
      return { skipped: true, reason: "No valid command found" };
    }

    // Step 2: リポジトリを取得
    const repository = await step.run("get-repository", async () => {
      return prisma.repository.findFirst({
        where: { owner, name: repo, installationId },
      });
    });

    if (!repository) {
      return { skipped: true, reason: "Repository not found" };
    }

    // Step 3: 関連するコメントを取得（もしあれば）
    let relatedComment = null;
    if (contextCommentId) {
      relatedComment = await step.run("get-context-comment", async () => {
        return prisma.reviewComment.findUnique({
          where: { githubCommentId: contextCommentId },
        });
      });
    }

    // Step 4: フィードバックを保存
    const feedback = await step.run("save-explicit-feedback", async () => {
      return prisma.reviewFeedback.create({
        data: {
          reviewCommentId: relatedComment?.id ?? "",
          type: "SUGGESTION" as FeedbackType,
          userAction: "MODIFIED",
          userExplanation: parsedCommand.ruleText,
          filePath: relatedComment?.filePath ?? "",
          language: relatedComment ? detectLanguage(relatedComment.filePath) : undefined,
          lineNumber: relatedComment?.lineNumber ?? 0,
        },
      });
    });

    // Step 5: ルール抽出をトリガー（明示的なルールなので高信頼度）
    await step.sendEvent("trigger-explicit-rule", {
      name: "learning/rule.extract",
      data: {
        feedbackId: feedback.id,
        installationId,
        repositoryId: repository.id,
      },
    });

    return {
      feedbackId: feedback.id,
      parsedRule: parsedCommand.ruleText,
      ruleType: parsedCommand.ruleType,
    };
  }
);

/**
 * 明示的なコマンドを解析
 */
function parseExplicitCommand(
  body: string
): { ruleText: string; ruleType: string } | null {
  // パターン: @codehorse prefer X over Y
  const preferMatch = body.match(/@codehorse\s+prefer\s+(.+?)\s+over\s+(.+)/i);
  if (preferMatch) {
    return {
      ruleText: `${preferMatch[1]} の使用を ${preferMatch[2]} よりも優先する`,
      ruleType: "STYLE",
    };
  }

  // パターン: @codehorse add rule: X
  const addRuleMatch = body.match(/@codehorse\s+add\s+rule:\s*(.+)/i);
  if (addRuleMatch) {
    return {
      ruleText: addRuleMatch[1].trim(),
      ruleType: "OTHER",
    };
  }

  // パターン: @codehorse always use X
  const alwaysMatch = body.match(/@codehorse\s+always\s+use\s+(.+)/i);
  if (alwaysMatch) {
    return {
      ruleText: `常に ${alwaysMatch[1]} を使用する`,
      ruleType: "PATTERN",
    };
  }

  // パターン: @codehorse never use X
  const neverMatch = body.match(/@codehorse\s+never\s+use\s+(.+)/i);
  if (neverMatch) {
    return {
      ruleText: `${neverMatch[1]} は使用しない`,
      ruleType: "PATTERN",
    };
  }

  return null;
}

/**
 * ルールの信頼度を更新
 */
export const updateRuleConfidence = inngest.createFunction(
  {
    id: "update-rule-confidence",
    retries: 2,
  },
  { event: "learning/rule.update-confidence" },
  async ({ event, step }) => {
    const { ruleId, delta } = event.data;

    const updatedRule = await step.run("update-confidence", async () => {
      const rule = await prisma.learningRule.findUnique({
        where: { id: ruleId },
      });

      if (!rule) {
        throw new Error(`Rule ${ruleId} not found`);
      }

      // 信頼度を更新（0.0 - 1.0 の範囲に制限）
      const newConfidence = Math.max(0, Math.min(1, rule.confidence + delta));

      return prisma.learningRule.update({
        where: { id: ruleId },
        data: {
          confidence: newConfidence,
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    });

    console.log(
      `[Learning] Updated rule ${ruleId} confidence: ${updatedRule.confidence}`
    );

    return { ruleId, newConfidence: updatedRule.confidence };
  }
);
