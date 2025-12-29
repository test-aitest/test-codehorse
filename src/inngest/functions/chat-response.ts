import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  createReviewCommentReply,
  createIssueComment,
  getReviewCommentThread,
} from "@/lib/github/client";
import {
  generateChatResponse,
  detectMention,
  extractMessageContent,
} from "@/lib/ai/chat";
import { searchRelatedCode } from "@/lib/rag/search";
import { buildSimpleContext } from "@/lib/rag/context-builder";
import {
  buildAdaptiveContext,
  saveConversation,
  deserializeAdaptiveContext,
} from "@/lib/ai/memory";

// ボット名（環境変数から取得可能）
const BOT_NAME = process.env.GITHUB_APP_SLUG || "codehorse";

/**
 * PRコメントへの応答ジョブ
 */
export const chatResponseJob = inngest.createFunction(
  {
    id: "chat-response",
    concurrency: {
      limit: 2,
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/comment.created" },
  async ({ event, step }) => {
    const {
      installationId,
      owner,
      repo,
      prNumber,
      commentId,
      commentBody,
      commentAuthor,
      commentAuthorId,
      inReplyToId,
    } = event.data;

    console.log(`[Inngest] Processing comment on ${owner}/${repo}#${prNumber}`);

    // Step 1: メンションチェック
    const shouldRespond = await step.run("check-mention", async () => {
      // ボット自身のコメントには反応しない
      if (commentAuthor.toLowerCase().includes(BOT_NAME)) {
        return false;
      }

      // メンションされているか確認
      return detectMention(commentBody, BOT_NAME);
    });

    if (!shouldRespond) {
      console.log("[Inngest] No mention detected, skipping");
      return { skipped: true, reason: "No mention" };
    }

    // Step 2: コンテキストを収集
    const context = await step.run("gather-context", async () => {
      // PRタイトルを取得
      const pr = await prisma.pullRequest.findFirst({
        where: {
          repository: { owner, name: repo },
          number: prNumber,
        },
        include: {
          repository: { select: { id: true } },
        },
      });

      // スレッドのコンテキストを取得
      const threadContext: Array<{ author: string; body: string; isBot: boolean }> = [];

      if (inReplyToId) {
        try {
          const parentComment = await getReviewCommentThread(
            installationId,
            owner,
            repo,
            inReplyToId
          );
          threadContext.push({
            author: parentComment.user?.login || "unknown",
            body: parentComment.body || "",
            isBot: parentComment.user?.login?.toLowerCase().includes(BOT_NAME) || false,
          });
        } catch (error) {
          console.warn("[Inngest] Failed to fetch thread context:", error);
        }
      }

      return {
        prTitle: pr?.title,
        prNumber,
        threadContext,
        pullRequestId: pr?.id,
        repositoryId: pr?.repository?.id,
      };
    });

    // Step 3: RAGコンテキストを取得
    const ragContext = await step.run("fetch-rag-context", async (): Promise<string | null> => {
      try {
        const userMessage = extractMessageContent(commentBody, BOT_NAME);

        // ユーザーメッセージで検索
        const searchResults = await searchRelatedCode({
          owner,
          repo,
          query: userMessage,
          topK: 5,
          minScore: 0.5,
        });

        if (searchResults.length === 0) {
          return null;
        }

        return buildSimpleContext(searchResults);
      } catch (error) {
        console.warn("[Inngest] RAG search failed:", error);
        return null;
      }
    });

    // Step 4: 適応コンテキストを構築
    const adaptiveContext = await step.run("build-adaptive-context", async () => {
      if (!context.pullRequestId || !context.repositoryId) {
        return undefined;
      }

      try {
        return await buildAdaptiveContext({
          pullRequestId: context.pullRequestId,
          repositoryId: context.repositoryId,
          maxConversationEntries: 20,
          includeLearningInsights: true,
        });
      } catch (error) {
        console.warn("[Inngest] Failed to build adaptive context:", error);
        return undefined;
      }
    });

    // Step 5: ユーザーの質問を会話履歴に保存
    await step.run("save-user-question", async () => {
      if (!context.pullRequestId) return;

      try {
        const userMessage = extractMessageContent(commentBody, BOT_NAME);
        await saveConversation({
          pullRequestId: context.pullRequestId,
          type: "CHAT_QUESTION",
          role: "USER",
          content: userMessage,
          metadata: {
            commentId: commentId.toString(),
          },
        });
      } catch (error) {
        console.warn("[Inngest] Failed to save user question:", error);
      }
    });

    // Step 6: AI応答を生成
    const response = await step.run("generate-response", async () => {
      const userMessage = extractMessageContent(commentBody, BOT_NAME);

      return generateChatResponse(userMessage, {
        prTitle: context.prTitle || undefined,
        prNumber: context.prNumber,
        previousMessages: context.threadContext,
        ragContext: ragContext ?? undefined,
        adaptiveContext: deserializeAdaptiveContext(adaptiveContext),
      });
    });

    // Step 7: GitHubに返信を投稿
    const postResult = await step.run("post-response", async () => {
      // 応答にボット署名を追加
      const responseBody = `${response.response}\n\n---\n*🐴 CodeHorse AI Assistant*`;

      let result;
      if (inReplyToId) {
        // レビューコメントへの返信
        result = await createReviewCommentReply(
          installationId,
          owner,
          repo,
          prNumber,
          inReplyToId,
          responseBody
        );
      } else {
        // PRコメントへの返信
        result = await createIssueComment(installationId, owner, repo, prNumber, responseBody);
      }

      console.log("[Inngest] Response posted");

      // コメントURLを返す
      return {
        commentId: result.data.id,
        htmlUrl: result.data.html_url,
      };
    });

    // Step 8: AI応答を会話履歴に保存
    await step.run("save-ai-response", async () => {
      if (!context.pullRequestId) return;

      try {
        await saveConversation({
          pullRequestId: context.pullRequestId,
          type: "CHAT_RESPONSE",
          role: "AI",
          content: response.response,
          metadata: {
            commentId: commentId.toString(),
          },
        });
        console.log("[Inngest] Saved chat conversation to history");
      } catch (error) {
        console.warn("[Inngest] Failed to save AI response:", error);
      }
    });

    // Step 9: プッシュ通知イベントを発火
    await step.run("send-push-notification-event", async () => {
      try {
        // 応答のプレビュー（先頭100文字）
        const responsePreview =
          response.response.length > 100
            ? response.response.substring(0, 100) + "..."
            : response.response;

        await inngest.send({
          name: "push/notification.chat-response",
          data: {
            commentAuthor,
            commentAuthorId,
            owner,
            repo,
            prNumber,
            responsePreview,
            commentUrl: postResult.htmlUrl,
          },
        });
        console.log("[Inngest] Push notification event sent");
      } catch (error) {
        // プッシュ通知の失敗はエラーとして扱わない
        console.warn("[Inngest] Failed to send push notification event:", error);
      }
    });

    return {
      success: true,
      prNumber,
      commentId,
      responseTokens: response.tokenCount,
    };
  }
);
