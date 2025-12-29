/**
 * Push通知サブスクリプション登録API
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { endpoint, keys } = await request.json();

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    const userAgent = request.headers.get("user-agent") || null;

    // Upsert: 同一エンドポイントなら更新、なければ作成
    const subscription = await prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId: session.user.id,
          endpoint,
        },
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        isActive: true,
        failCount: 0,
      },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    });

    // 通知設定がなければ作成
    await prisma.notificationSettings.upsert({
      where: { userId: session.user.id },
      update: {},
      create: { userId: session.user.id },
    });

    console.log(`[Push] Subscription registered for user: ${session.user.id}`);

    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    console.error("[API] Failed to register subscription:", error);
    return NextResponse.json(
      { error: "Failed to register subscription" },
      { status: 500 }
    );
  }
}
