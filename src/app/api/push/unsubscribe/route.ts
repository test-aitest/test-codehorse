/**
 * Push通知サブスクリプション解除API
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * 特定のサブスクリプションを削除
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscriptionId, endpoint } = await request.json();

    if (subscriptionId) {
      // IDで削除
      await prisma.pushSubscription.deleteMany({
        where: {
          id: subscriptionId,
          userId: session.user.id,
        },
      });
    } else if (endpoint) {
      // エンドポイントで削除
      await prisma.pushSubscription.deleteMany({
        where: {
          endpoint,
          userId: session.user.id,
        },
      });
    } else {
      return NextResponse.json(
        { error: "subscriptionId or endpoint required" },
        { status: 400 }
      );
    }

    console.log(`[Push] Subscription removed for user: ${session.user.id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to remove subscription:", error);
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}

/**
 * ユーザーの全サブスクリプションを無効化
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 全サブスクリプションを無効化
    await prisma.pushSubscription.updateMany({
      where: { userId: session.user.id },
      data: { isActive: false },
    });

    console.log(
      `[Push] All subscriptions disabled for user: ${session.user.id}`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to disable subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to disable subscriptions" },
      { status: 500 }
    );
  }
}
