/**
 * プッシュ通知テスト用API（開発環境専用）
 * POST /api/push/test
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sendPushNotification } from "@/lib/push/send";

export async function POST() {
  // 開発環境以外では無効
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "This endpoint is only available in development" },
      { status: 403 }
    );
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[Push Test] Sending test notification to user: ${session.user.id}`);

  const result = await sendPushNotification(session.user.id, {
    title: "テスト通知",
    body: "これはCodeHorseからのテスト通知です。",
    url: "https://github.com",
    tag: "test-notification",
  });

  console.log(`[Push Test] Result:`, result);

  return NextResponse.json({
    success: true,
    message: "Test notification sent",
    result,
  });
}
