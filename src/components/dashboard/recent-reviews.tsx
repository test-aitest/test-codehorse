"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

interface Review {
  id: string;
  status: string;
  summary: string | null;
  tokenCount: number | null;
  createdAt: Date;
  pullRequest: {
    number: number;
    title: string;
    repository: {
      owner: string;
      name: string;
    };
  };
}

interface RecentReviewsProps {
  reviews: Review[];
}

function getStatusIcon(status: string) {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "PROCESSING":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
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

export function RecentReviews({ reviews }: RecentReviewsProps) {
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Recent Reviews</CardTitle>
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-4"
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(review.status)}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`https://github.com/${review.pullRequest.repository.owner}/${review.pullRequest.repository.name}/pull/${review.pullRequest.number}`}
                        target="_blank"
                        className="font-medium hover:underline"
                      >
                        {review.pullRequest.repository.owner}/
                        {review.pullRequest.repository.name}#
                        {review.pullRequest.number}
                      </Link>
                      {getStatusBadge(review.status)}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {review.pullRequest.title}
                    </p>
                    {review.tokenCount && (
                      <p className="text-xs text-muted-foreground">
                        {review.tokenCount.toLocaleString()} tokens
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(review.createdAt), {
                    addSuffix: true,
                    locale: ja,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
