"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus, Coins, Zap } from "lucide-react";

interface UsageStatsProps {
  stats: {
    thisMonth: { tokens: number; reviews: number; cost: number };
    lastMonth: { tokens: number; reviews: number; cost: number };
    total: { tokens: number; reviews: number; cost: number };
    monthly: Array<{
      month: string;
      tokens: number;
      reviews: number;
      cost: number;
    }>;
    byRepository: Array<{ name: string; tokens: number; reviews: number }>;
    costPerMillionTokens: number;
  };
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getTrendIcon(current: number, previous: number) {
  if (current > previous) {
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  }
  if (current < previous) {
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function getPercentChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(0)}%`;
}

export function UsageStats({ stats }: UsageStatsProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  ${stats.thisMonth.cost.toFixed(4)}
                </span>
                <div className="flex items-center gap-1 text-sm">
                  {getTrendIcon(stats.thisMonth.cost, stats.lastMonth.cost)}
                  <span className="text-muted-foreground">
                    {getPercentChange(stats.thisMonth.cost, stats.lastMonth.cost)}
                  </span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatTokens(stats.thisMonth.tokens)} tokens •{" "}
                {stats.thisMonth.reviews} reviews
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                ${stats.lastMonth.cost.toFixed(4)}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatTokens(stats.lastMonth.tokens)} tokens •{" "}
                {stats.lastMonth.reviews} reviews
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">All Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                ${stats.total.cost.toFixed(4)}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatTokens(stats.total.tokens)} tokens •{" "}
                {stats.total.reviews} reviews
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Pricing Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Zap className="h-8 w-8 text-yellow-500" />
              <div>
                <div className="font-medium">Gemini 1.5 Flash</div>
                <div className="text-sm text-muted-foreground">
                  ${stats.costPerMillionTokens} / 1M tokens (estimated average)
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground mb-1">
                Average cost per review
              </div>
              <div className="text-xl font-bold">
                $
                {stats.total.reviews > 0
                  ? (stats.total.cost / stats.total.reviews).toFixed(4)
                  : "0.0000"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Usage (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Reviews</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.monthly.map((month) => (
                <TableRow key={month.month}>
                  <TableCell className="font-medium">{month.month}</TableCell>
                  <TableCell className="text-right">{month.reviews}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatTokens(month.tokens)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${month.cost.toFixed(4)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Usage by Repository */}
      {stats.byRepository.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage by Repository</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Repository</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byRepository.slice(0, 10).map((repo) => (
                  <TableRow key={repo.name}>
                    <TableCell className="font-medium">{repo.name}</TableCell>
                    <TableCell className="text-right">{repo.reviews}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatTokens(repo.tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      $
                      {(
                        (repo.tokens / 1_000_000) *
                        stats.costPerMillionTokens
                      ).toFixed(4)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
