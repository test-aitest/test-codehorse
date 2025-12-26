import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { RecentReviews } from "@/components/dashboard/recent-reviews";

// Gemini 1.5 Flash の料金（2024年12月時点）
// Input: $0.075 / 1M tokens, Output: $0.30 / 1M tokens
// 簡略化のため、平均として $0.15 / 1M tokens を使用
const COST_PER_MILLION_TOKENS = 0.15;

async function getDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRepositories,
    totalReviews,
    thisMonthReviews,
    totalTokens,
    thisMonthTokens,
    recentReviews,
  ] = await Promise.all([
    // リポジトリ数
    prisma.repository.count(),
    // 総レビュー数
    prisma.review.count(),
    // 今月のレビュー数
    prisma.review.count({
      where: {
        createdAt: { gte: startOfMonth },
      },
    }),
    // 総トークン数
    prisma.review.aggregate({
      _sum: { tokenCount: true },
    }),
    // 今月のトークン数
    prisma.review.aggregate({
      where: {
        createdAt: { gte: startOfMonth },
      },
      _sum: { tokenCount: true },
    }),
    // 最近のレビュー
    prisma.review.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        pullRequest: {
          include: {
            repository: true,
          },
        },
      },
    }),
  ]);

  const totalTokenCount = totalTokens._sum.tokenCount || 0;
  const thisMonthTokenCount = thisMonthTokens._sum.tokenCount || 0;

  return {
    totalRepositories,
    totalReviews,
    thisMonthReviews,
    totalTokens: totalTokenCount,
    thisMonthTokens: thisMonthTokenCount,
    totalCost: (totalTokenCount / 1_000_000) * COST_PER_MILLION_TOKENS,
    thisMonthCost: (thisMonthTokenCount / 1_000_000) * COST_PER_MILLION_TOKENS,
    recentReviews,
  };
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const stats = await getDashboardStats();

  return (
    <div className="flex flex-col">
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Welcome back, {session.user.name || "User"}!
          </h2>
          <p className="text-muted-foreground">
            Here&apos;s an overview of your AI code review activity.
          </p>
        </div>

        <StatsGrid stats={stats} />

        <div className="grid gap-6 lg:grid-cols-2">
          <RecentReviews reviews={stats.recentReviews} />
        </div>
      </div>
    </div>
  );
}
