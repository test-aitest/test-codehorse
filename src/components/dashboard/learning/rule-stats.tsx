"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CheckCircle, AlertTriangle, Clock } from "lucide-react";

interface RuleStatsProps {
  stats: {
    totalRules: number;
    activeRules: number;
    lowConfidenceRules: number;
    recentlyUsedRules: number;
  };
}

export function RuleStats({ stats }: RuleStatsProps) {
  const statCards = [
    {
      title: "Total Rules",
      value: stats.totalRules,
      icon: BookOpen,
      description: "All learning rules",
      color: "text-blue-500",
    },
    {
      title: "Active Rules",
      value: stats.activeRules,
      icon: CheckCircle,
      description: "Confidence >= 50%",
      color: "text-green-500",
    },
    {
      title: "Low Confidence",
      value: stats.lowConfidenceRules,
      icon: AlertTriangle,
      description: "May need review",
      color: "text-orange-500",
    },
    {
      title: "Recently Used",
      value: stats.recentlyUsedRules,
      icon: Clock,
      description: "Last 30 days",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
