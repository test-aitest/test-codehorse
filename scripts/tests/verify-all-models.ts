/**
 * 全Prismaモデルの動作確認スクリプト
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== All Prisma Models Verification ===\n");

  try {
    // Phase 1: Comment Persistence
    console.log("Phase 1: Comment Persistence");
    const fpCount = await prisma.commentFingerprint.count();
    console.log(`  ✅ commentFingerprint: ${fpCount} records`);
    const occCount = await prisma.commentOccurrence.count();
    console.log(`  ✅ commentOccurrence: ${occCount} records`);

    // Phase 3: Dependency Analysis
    console.log("\nPhase 3: Dependency Analysis");
    const depCount = await prisma.fileDependency.count();
    console.log(`  ✅ fileDependency: ${depCount} records`);
    const symCount = await prisma.exportedSymbol.count();
    console.log(`  ✅ exportedSymbol: ${symCount} records`);

    // Phase 4: Test Generation
    console.log("\nPhase 4: Test Generation");
    const testCount = await prisma.generatedTest.count();
    console.log(`  ✅ generatedTest: ${testCount} records`);

    // Phase 5: Documentation
    console.log("\nPhase 5: Documentation");
    const docGapCount = await prisma.documentationGap.count();
    console.log(`  ✅ documentationGap: ${docGapCount} records`);

    // Phase 8: Performance
    console.log("\nPhase 8: Performance Analysis");
    const perfCount = await prisma.performanceIssue.count();
    console.log(`  ✅ performanceIssue: ${perfCount} records`);

    // Phase 9: CI Analysis
    console.log("\nPhase 9: CI Analysis");
    const ciCount = await prisma.cIFailureAnalysis.count();
    console.log(`  ✅ ciFailureAnalysis: ${ciCount} records`);

    // Phase 10: Security
    console.log("\nPhase 10: Security");
    const secCount = await prisma.securityVulnerability.count();
    console.log(`  ✅ securityVulnerability: ${secCount} records`);

    // Core models
    console.log("\n=== Core Models ===");
    const repoCount = await prisma.repository.count();
    console.log(`  ✅ repository: ${repoCount} records`);
    const reviewCount = await prisma.review.count();
    console.log(`  ✅ review: ${reviewCount} records`);
    const prCount = await prisma.pullRequest.count();
    console.log(`  ✅ pullRequest: ${prCount} records`);

    console.log("\n✅ All Prisma models are accessible and operational!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
