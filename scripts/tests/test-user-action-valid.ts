/**
 * 有効なoccurrenceIdを使用してHandle Comment User Actionをテスト
 */

import { PrismaClient } from "@prisma/client";
import { Inngest } from "inngest";

const prisma = new PrismaClient();
const inngest = new Inngest({ id: "test", eventKey: "test-key" });

async function main() {
  console.log("=== Handle Comment User Action Test ===\n");

  // 既存のoccurrenceを取得
  const occurrence = await prisma.commentOccurrence.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!occurrence) {
    console.log("❌ No occurrence found in database");
    return;
  }

  console.log(`Found occurrence: ${occurrence.id}`);

  // Inngestにイベントを送信
  const result = await inngest.send({
    name: "comment/user-action",
    data: {
      occurrenceId: occurrence.id,
      actionType: "ACKNOWLEDGED",
      userResponse: "Test acknowledgment with valid ID",
    },
  });

  console.log(`✅ Event sent: ${result.ids?.[0]}`);
  console.log("\nInngest Dev UIで結果を確認してください");

  await prisma.$disconnect();
}

main().catch(console.error);
