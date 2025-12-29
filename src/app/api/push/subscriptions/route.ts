/**
 * ユーザーのPush通知サブスクリプション一覧取得API
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        userAgent: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 通知設定も取得
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      subscriptions,
      settings: settings || { chatResponseEnabled: true },
    });
  } catch (error) {
    console.error("[API] Failed to get subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to get subscriptions" },
      { status: 500 }
    );
  }
}
