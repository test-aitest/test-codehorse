/**
 * LeetCode Evaluation Debug API
 * デバッグ用：評価データをDBから取得
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leetcode/debug-evaluation?id=xxx
 * 評価IDから評価データを取得
 */
export async function GET(request: NextRequest) {
  try {
    const evaluationId = request.nextUrl.searchParams.get("id");

    if (!evaluationId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const evaluation = await prisma.leetCodeEvaluation.findUnique({
      where: { id: evaluationId },
      select: {
        id: true,
        status: true,
        language: true,
        problemUrl: true,
        userBenchmark: true,
        optimalSolutions: true,
        bestSolutionIndex: true,
        timeComplexity: true,
        spaceComplexity: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: "Evaluation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        ...evaluation,
        // userBenchmarkの詳細を明示的に表示
        userBenchmarkDetails: evaluation.userBenchmark
          ? {
              raw: evaluation.userBenchmark,
              parsed: {
                totalRuns: (evaluation.userBenchmark as Record<string, unknown>)?.totalRuns,
                successfulRuns: (evaluation.userBenchmark as Record<string, unknown>)?.successfulRuns,
                averageTimeMs: (evaluation.userBenchmark as Record<string, unknown>)?.averageTimeMs,
                minTimeMs: (evaluation.userBenchmark as Record<string, unknown>)?.minTimeMs,
                maxTimeMs: (evaluation.userBenchmark as Record<string, unknown>)?.maxTimeMs,
                stdDevMs: (evaluation.userBenchmark as Record<string, unknown>)?.stdDevMs,
                allCorrect: (evaluation.userBenchmark as Record<string, unknown>)?.allCorrect,
              },
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[Debug Evaluation] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch evaluation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
