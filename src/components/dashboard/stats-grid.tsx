"use client";

interface StatsCardProps {
  title: string;
  value: string | number;
}

function StatsCard({ title, value }: StatsCardProps) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

interface StatsGridProps {
  stats: {
    totalRepositories: number;
    totalReviews: number;
    thisMonth: number;
    plan: string;
  };
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard title="Total Repositories" value={stats.totalRepositories} />
      <StatsCard title="Total Reviews" value={stats.totalReviews} />
      <StatsCard title="This Month" value={stats.thisMonth} />
      <StatsCard title="Plan" value={stats.plan} />
    </div>
  );
}
