"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, MessageSquare } from "lucide-react";

interface Review {
  id: string;
  status: string;
  summary: string | null;
  tokenCount: number | null;
  cost: number;
  createdAt: Date;
  pullRequest: {
    number: number;
    title: string;
    repository: {
      owner: string;
      name: string;
      htmlUrl: string;
    };
  };
  comments: Array<{
    id: string;
    severity: string;
  }>;
}

interface ReviewsTableProps {
  reviews: Review[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="default">Completed</Badge>;
    case "PROCESSING":
      return <Badge variant="secondary">Processing</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getSeverityCounts(comments: Array<{ severity: string }>) {
  const counts = { CRITICAL: 0, IMPORTANT: 0, INFO: 0, NITPICK: 0 };
  comments.forEach((c) => {
    if (c.severity in counts) {
      counts[c.severity as keyof typeof counts]++;
    }
  });
  return counts;
}

export function ReviewsTable({ reviews }: ReviewsTableProps) {
  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No Reviews Yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Open a pull request on a connected repository to receive your first
          AI code review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pull Request</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Comments</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Date</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => {
            const severity = getSeverityCounts(review.comments);
            const prUrl = `${review.pullRequest.repository.htmlUrl}/pull/${review.pullRequest.number}`;

            return (
              <TableRow key={review.id}>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {review.pullRequest.repository.owner}/
                      {review.pullRequest.repository.name}#
                      {review.pullRequest.number}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-1 max-w-xs">
                      {review.pullRequest.title}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{getStatusBadge(review.status)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {severity.CRITICAL > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {severity.CRITICAL} Critical
                      </Badge>
                    )}
                    {severity.IMPORTANT > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {severity.IMPORTANT} Important
                      </Badge>
                    )}
                    {review.comments.length === 0 && (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {review.tokenCount?.toLocaleString() || "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  ${review.cost.toFixed(4)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(review.createdAt), "MM/dd HH:mm", {
                    locale: ja,
                  })}
                </TableCell>
                <TableCell>
                  <Link
                    href={prUrl}
                    target="_blank"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
