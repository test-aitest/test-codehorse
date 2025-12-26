import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { UsageStats } from "@/components/dashboard/usage-stats";

// Gemini 1.5 Flash の料金
const COST_PER_MILLION_TOKENS = 0.15;

async function getUsageStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // 月別の統計を取得（過去6ヶ月）
  const monthlyStats = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const stats = await prisma.review.aggregate({
      where: {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      _sum: { tokenCount: true },
      _count: true,
    });

    monthlyStats.push({
      month: monthStart.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
      }),
      tokens: stats._sum.tokenCount || 0,
      reviews: stats._count,
      cost: ((stats._sum.tokenCount || 0) / 1_000_000) * COST_PER_MILLION_TOKENS,
    });
  }

  // 今月と先月の詳細
  const [thisMonth, lastMonth, total] = await Promise.all([
    prisma.review.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { tokenCount: true },
      _count: true,
    }),
    prisma.review.aggregate({
      where: {
        createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
      },
      _sum: { tokenCount: true },
      _count: true,
    }),
    prisma.review.aggregate({
      _sum: { tokenCount: true },
      _count: true,
    }),
  ]);

  // リポジトリ別の使用量
  const byRepository = await prisma.review.groupBy({
    by: ["pullRequestId"],
    _sum: { tokenCount: true },
    _count: true,
  });

  const repoDetails = await prisma.pullRequest.findMany({
    where: {
      id: { in: byRepository.map((r) => r.pullRequestId) },
    },
    include: { repository: true },
  });

  const repoUsage = new Map<
    string,
    { name: string; tokens: number; reviews: number }
  >();

  byRepository.forEach((item) => {
    const pr = repoDetails.find((p) => p.id === item.pullRequestId);
    if (pr) {
      const repoName = pr.repository.fullName;
      const existing = repoUsage.get(repoName) || {
        name: repoName,
        tokens: 0,
        reviews: 0,
      };
      existing.tokens += item._sum.tokenCount || 0;
      existing.reviews += item._count;
      repoUsage.set(repoName, existing);
    }
  });

  return {
    thisMonth: {
      tokens: thisMonth._sum.tokenCount || 0,
      reviews: thisMonth._count,
      cost:
        ((thisMonth._sum.tokenCount || 0) / 1_000_000) * COST_PER_MILLION_TOKENS,
    },
    lastMonth: {
      tokens: lastMonth._sum.tokenCount || 0,
      reviews: lastMonth._count,
      cost:
        ((lastMonth._sum.tokenCount || 0) / 1_000_000) * COST_PER_MILLION_TOKENS,
    },
    total: {
      tokens: total._sum.tokenCount || 0,
      reviews: total._count,
      cost: ((total._sum.tokenCount || 0) / 1_000_000) * COST_PER_MILLION_TOKENS,
    },
    monthly: monthlyStats,
    byRepository: Array.from(repoUsage.values()).sort(
      (a, b) => b.tokens - a.tokens
    ),
    costPerMillionTokens: COST_PER_MILLION_TOKENS,
  };
}

export default async function UsagePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const stats = await getUsageStats();

  return (
    <div className="flex flex-col">
      <Header
        title="Usage & Cost"
        description="Track your token usage and estimated costs"
      />
      <div className="p-6">
        <UsageStats stats={stats} />
      </div>
    </div>
  );
}
