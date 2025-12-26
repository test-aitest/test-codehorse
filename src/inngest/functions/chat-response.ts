import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  getInstallationOctokit,
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
      });

      // スレッドのコンテキストを取得
      let threadContext: Array<{ author: string; body: string; isBot: boolean }> = [];

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

    // Step 4: AI応答を生成
    const response = await step.run("generate-response", async () => {
      const userMessage = extractMessageContent(commentBody, BOT_NAME);

      return generateChatResponse(userMessage, {
        prTitle: context.prTitle || undefined,
        prNumber: context.prNumber,
        previousMessages: context.threadContext,
        ragContext: ragContext ?? undefined,
      });
    });

    // Step 5: GitHubに返信を投稿
    await step.run("post-response", async () => {
      const octokit = await getInstallationOctokit(installationId);

      // 応答にボット署名を追加
      const responseBody = `${response.response}\n\n---\n*🐴 CodeHorse AI Assistant*`;

      if (inReplyToId) {
        // レビューコメントへの返信
        await createReviewCommentReply(
          installationId,
          owner,
          repo,
          prNumber,
          inReplyToId,
          responseBody
        );
      } else {
        // PRコメントへの返信
        await createIssueComment(installationId, owner, repo, prNumber, responseBody);
      }

      console.log("[Inngest] Response posted");
    });

    return {
      success: true,
      prNumber,
      commentId,
      responseTokens: response.tokenCount,
    };
  }
);
