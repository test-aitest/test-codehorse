/**
 * LeetCode Benchmark Callback API
 * GitHub Actionsからベンチマーク結果を受け取る
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { normalizeBenchmarkResult } from "@/lib/leetcode";
import type { BenchmarkResult } from "@/lib/leetcode";

/**
 * コールバックペイロードの型（solutionIndexを含む拡張版）
 */
interface BenchmarkCallbackPayload {
  evaluationId: string;
  language: string;
  result: unknown;
  solutionIndex?: number;
}

/**
 * ペイロードの検証
 */
function validatePayload(payload: unknown): payload is BenchmarkCallbackPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const p = payload as Record<string, unknown>;

  return (
    typeof p.evaluationId === 'string' &&
    typeof p.language === 'string' &&
    typeof p.result === 'object' &&
    p.result !== null
  );
}

/**
 * POST /api/leetcode/benchmark-callback
 * GitHub Actionsからのベンチマーク結果を受信
 */
export async function POST(request: NextRequest) {
  try {
    // 評価IDをヘッダーから取得（オプション）
    const headerEvaluationId = request.headers.get("X-Evaluation-ID");

    // リクエストボディをパース
    const body = await request.json();

    // ペイロードの検証
    if (!validatePayload(body)) {
      return NextResponse.json(
        { error: "Invalid callback payload" },
        { status: 400 }
      );
    }

    const { evaluationId, result, solutionIndex } = body;

    // ヘッダーとボディのevaluationIdが一致するか確認
    if (headerEvaluationId && headerEvaluationId !== evaluationId) {
      console.warn(
        `[LeetCode Callback] Evaluation ID mismatch: header=${headerEvaluationId}, body=${evaluationId}`
      );
    }

    // 評価レコードを取得（PRの情報も含む）
    const evaluation = await prisma.leetCodeEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
    });

    if (!evaluation) {
      return NextResponse.json(
        { error: "Evaluation not found" },
        { status: 404 }
      );
    }

    // PR情報を取得
    const prInfo = {
      owner: evaluation.pullRequest.repository.owner,
      repo: evaluation.pullRequest.repository.name,
      prNumber: evaluation.pullRequest.number,
    };

    // ベンチマーク結果を正規化
    const normalizedResult = normalizeBenchmarkResult(result);

    // 評価タイプを判定（ユーザーコード or 最適解）
    const isOptimalBenchmark = typeof solutionIndex === "number";

    if (isOptimalBenchmark) {
      // 最適解のベンチマーク結果
      const existingOptimalResults = (evaluation.optimalSolutions as unknown as Array<{
        index: number;
        benchmark?: BenchmarkResult;
      }>) || [];

      const updatedResults = existingOptimalResults.map((sol) => {
        if (sol.index === solutionIndex) {
          return { ...sol, benchmark: normalizedResult };
        }
        return sol;
      });

      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: {
          optimalSolutions: JSON.parse(JSON.stringify(updatedResults)),
        },
      });

      // すべての最適解がベンチマーク完了したかチェック
      const allBenchmarked = updatedResults.every((sol) => sol.benchmark);

      if (allBenchmarked) {
        // 最良の解を選出
        const benchmarkedResults = updatedResults
          .filter((sol) => sol.benchmark)
          .map((sol) => ({
            index: sol.index,
            result: sol.benchmark!,
          }));

        // 最も速い解を選出（正確な結果のみ）
        const correctResults = benchmarkedResults.filter((r) => r.result.allCorrect);
        let bestIndex = 0;

        if (correctResults.length > 0) {
          const best = correctResults.reduce((a, b) =>
            a.result.averageTimeMs < b.result.averageTimeMs ? a : b
          );
          bestIndex = best.index;
        }

        await prisma.leetCodeEvaluation.update({
          where: { id: evaluationId },
          data: {
            bestSolutionIndex: bestIndex,
            status: "COMPLETED",
          },
        });

        // 完了イベントを送信
        await inngest.send({
          name: "leetcode/all-benchmarks.completed",
          data: {
            evaluationId,
            owner: prInfo.owner,
            repo: prInfo.repo,
            prNumber: prInfo.prNumber,
            bestSolutionIndex: bestIndex,
          },
        });
      } else {
        // 個別の最適解ベンチマーク完了イベント
        await inngest.send({
          name: "leetcode/optimal-benchmark.completed",
          data: {
            evaluationId,
            owner: prInfo.owner,
            repo: prInfo.repo,
            prNumber: prInfo.prNumber,
            solutionIndex,
            result: {
              totalRuns: normalizedResult.totalRuns,
              successfulRuns: normalizedResult.successfulRuns,
              averageTimeMs: normalizedResult.averageTimeMs,
              allCorrect: normalizedResult.allCorrect,
            },
          },
        });
      }
    } else {
      // ユーザーコードのベンチマーク結果
      await prisma.leetCodeEvaluation.update({
        where: { id: evaluationId },
        data: {
          userBenchmark: JSON.parse(JSON.stringify(normalizedResult)),
          status: normalizedResult.allCorrect ? "ANALYZING" : "TEST_FAILED",
        },
      });

      // ユーザーベンチマーク完了イベントを送信
      await inngest.send({
        name: "leetcode/user-benchmark.completed",
        data: {
          evaluationId,
          owner: prInfo.owner,
          repo: prInfo.repo,
          prNumber: prInfo.prNumber,
          result: {
            totalRuns: normalizedResult.totalRuns,
            successfulRuns: normalizedResult.successfulRuns,
            averageTimeMs: normalizedResult.averageTimeMs,
            allCorrect: normalizedResult.allCorrect,
            failedTestCases: normalizedResult.failedTestCases,
          },
        },
      });
    }

    console.log(
      `[LeetCode Callback] Received benchmark result for evaluation ${evaluationId}`,
      {
        isOptimal: isOptimalBenchmark,
        solutionIndex,
        allCorrect: normalizedResult.allCorrect,
        averageTimeMs: normalizedResult.averageTimeMs,
      }
    );

    return NextResponse.json({
      success: true,
      evaluationId,
      processed: true,
    });
  } catch (error) {
    console.error("[LeetCode Callback] Error processing callback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leetcode/benchmark-callback
 * ヘルスチェック用
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "leetcode-benchmark-callback",
  });
}
