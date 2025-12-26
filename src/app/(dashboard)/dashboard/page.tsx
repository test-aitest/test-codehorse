import { StatsGrid } from "@/components/dashboard/stats-grid";

export default function DashboardPage() {
  // TODO: サーバーサイドでデータ取得 (Phase 3.1で実装)
  const stats = {
    totalRepositories: 0,
    totalReviews: 0,
    thisMonth: 0,
    plan: "Free",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome to CodeHorse
        </h2>
        <p className="text-muted-foreground">
          AI-Powered Code Review Platform
        </p>
      </div>

      <StatsGrid stats={stats} />
    </div>
  );
}
