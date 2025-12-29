/**
 * Prismaモデルの動作確認スクリプト
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Prisma Models Verification ===\n");

  try {
    // Phase 1: Comment Persistence Models
    console.log("Phase 1: Comment Persistence Models");
    const fpCount = await prisma.commentFingerprint.count();
    console.log(`  ✅ commentFingerprint: ${fpCount} records`);

    const occCount = await prisma.commentOccurrence.count();
    console.log(`  ✅ commentOccurrence: ${occCount} records`);

    // Phase 3: Dependency Models
    console.log("\nPhase 3: Dependency Models");
    const depCount = await prisma.fileDependency.count();
    console.log(`  ✅ fileDependency: ${depCount} records`);

    const symCount = await prisma.exportedSymbol.count();
    console.log(`  ✅ exportedSymbol: ${symCount} records`);

    console.log("\n✅ All Prisma models are accessible!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
