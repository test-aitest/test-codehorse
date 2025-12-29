/**
 * Web Push通知送信ロジック
 */

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getOrCreateVapidKeys } from "./vapid";

export interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * ユーザーIDを指定してプッシュ通知を送信
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  const vapidKeys = await getOrCreateVapidKeys();

  webpush.setVapidDetails(
    vapidKeys.subject,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // アクティブなサブスクリプションを取得
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId,
      isActive: true,
    },
  });

  if (subscriptions.length === 0) {
    console.log(`[Push] No active subscriptions for user: ${userId}`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      console.log(`[Push] Sending to endpoint: ${sub.endpoint.substring(0, 60)}...`);
      const result = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 60 * 60, // 1時間
        }
      );
      console.log(`[Push] FCM response: ${result.statusCode} ${result.body || '(empty)'}`);

      // 送信成功: lastUsedAt更新、failCountリセット
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: {
          lastUsedAt: new Date(),
          failCount: 0,
        },
      });

      sent++;
      console.log(`[Push] Notification sent to subscription: ${sub.id}`);
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };

      // 410 Gone: サブスクリプションが無効化された
      if (err.statusCode === 410) {
        console.log(`[Push] Subscription expired, deleting: ${sub.id}`);
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      } else {
        // 連続失敗回数をインクリメント
        const newFailCount = sub.failCount + 1;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: {
            failCount: newFailCount,
            // 5回連続失敗で無効化
            isActive: newFailCount < 5,
          },
        });
        console.error(
          `[Push] Failed to send to ${sub.id}:`,
          err.message || error
        );
      }

      failed++;
    }
  }

  return { sent, failed };
}

/**
 * GitHubユーザーを特定してプッシュ通知を送信
 * @param githubUsername GitHubユーザー名（login）
 * @param githubUserId GitHubの数値ユーザーID
 * @param payload 通知ペイロード
 */
export async function sendPushNotificationByGitHubUser(
  githubUsername: string,
  githubUserId: number,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number } | null> {
  console.log(
    `[Push] Looking up user for GitHub: ${githubUsername} (ID: ${githubUserId})`
  );

  // AccountテーブルでGitHub数値IDを使って検索
  const account = await prisma.account.findFirst({
    where: {
      providerId: "github",
      accountId: String(githubUserId),
    },
    select: { userId: true },
  });

  let userId: string | null = null;

  if (account) {
    userId = account.userId;
    console.log(`[Push] Found user by GitHub ID: ${userId}`);
  } else {
    // フォールバック: User.nameで検索（レガシー対応）
    const user = await prisma.user.findFirst({
      where: {
        name: {
          equals: githubUsername,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (user) {
      userId = user.id;
      console.log(`[Push] Found user by name: ${userId}`);
    }
  }

  if (!userId) {
    console.log(
      `[Push] No user found for GitHub: ${githubUsername} (ID: ${githubUserId})`
    );
    return null;
  }

  // 通知設定を確認
  const settings = await prisma.notificationSettings.findUnique({
    where: { userId },
  });

  // チャット応答通知が無効の場合はスキップ
  if (settings && !settings.chatResponseEnabled) {
    console.log(`[Push] Chat notifications disabled for user: ${userId}`);
    return { sent: 0, failed: 0 };
  }

  return sendPushNotification(userId, payload);
}
