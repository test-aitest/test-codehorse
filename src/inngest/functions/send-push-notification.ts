/**
 * プッシュ通知送信ジョブ
 * AIからの返信時にコメント投稿者に通知を送信
 */

import { inngest } from "../client";
import { sendPushNotificationByGitHubUser } from "@/lib/push/send";

/**
 * チャット応答通知送信ジョブ
 * AIがGitHubコメントに返信した際に、元のコメント投稿者に通知を送信
 */
export const sendChatResponseNotificationJob = inngest.createFunction(
  {
    id: "send-chat-response-notification",
    retries: 3,
  },
  { event: "push/notification.chat-response" },
  async ({ event, step }) => {
    const {
      commentAuthor,
      commentAuthorId,
      owner,
      repo,
      prNumber,
      responsePreview,
      commentUrl,
    } = event.data;

    const result = await step.run("send-notification", async () => {
      return sendPushNotificationByGitHubUser(commentAuthor, commentAuthorId, {
        title: `CodeHorse replied on ${owner}/${repo}#${prNumber}`,
        body: responsePreview,
        url: commentUrl,
        tag: `chat-${owner}-${repo}-${prNumber}`,
      });
    });

    if (result === null) {
      console.log(
        `[Push] User not found or not registered: ${commentAuthor} (ID: ${commentAuthorId})`
      );
      return { success: false, reason: "user_not_found" };
    }

    console.log(
      `[Push] Notification sent to ${commentAuthor}: ${result.sent} sent, ${result.failed} failed`
    );

    return { success: true, ...result };
  }
);
