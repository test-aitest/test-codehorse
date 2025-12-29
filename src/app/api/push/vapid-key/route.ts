/**
 * VAPID公開鍵取得API
 * クライアントがPush通知の購読に使用する公開鍵を返す
 */

import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push/vapid";

export async function GET() {
  try {
    console.log("[API] Getting VAPID public key...");
    const publicKey = await getVapidPublicKey();
    console.log("[API] VAPID public key retrieved successfully");
    return NextResponse.json({ publicKey });
  } catch (error) {
    console.error("[API] Failed to get VAPID public key:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to get VAPID public key", details: errorMessage },
      { status: 500 }
    );
  }
}
