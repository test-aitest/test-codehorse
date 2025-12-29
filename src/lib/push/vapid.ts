/**
 * VAPID鍵管理
 * Web Pushの認証に必要なVAPID鍵を自動生成・管理する
 */

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * VAPID鍵を取得（なければ自動生成してDBに保存）
 */
export async function getOrCreateVapidKeys(): Promise<VapidKeys> {
  try {
    console.log("[VAPID] Checking for existing keys...");

    // DBから既存の鍵を取得
    const existing = await prisma.vapidKeys.findUnique({
      where: { id: "singleton" },
    });

    if (existing) {
      console.log("[VAPID] Found existing keys");
      return {
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        subject: existing.subject,
      };
    }

    // 鍵がなければ新規生成
    console.log("[VAPID] No existing keys, generating new VAPID keys...");
    const vapidKeys = webpush.generateVAPIDKeys();
    console.log("[VAPID] Keys generated, saving to DB...");

    // DBに保存
    const created = await prisma.vapidKeys.create({
      data: {
        id: "singleton",
        publicKey: vapidKeys.publicKey,
        privateKey: vapidKeys.privateKey,
        subject: "mailto:admin@codehorse.app",
      },
    });

    console.log("[VAPID] New VAPID keys generated and saved");

    return {
      publicKey: created.publicKey,
      privateKey: created.privateKey,
      subject: created.subject,
    };
  } catch (error) {
    console.error("[VAPID] Error in getOrCreateVapidKeys:", error);
    throw error;
  }
}

/**
 * VAPID公開鍵のみを取得（クライアントに渡す用）
 */
export async function getVapidPublicKey(): Promise<string> {
  const keys = await getOrCreateVapidKeys();
  return keys.publicKey;
}
