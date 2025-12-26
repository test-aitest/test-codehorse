"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExternalLink,
  FileCode,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
  GitPullRequest,
  Clock,
  Coins,
} from "lucide-react";
import { MermaidDiagram } from "./mermaid-diagram";

// Gemini 1.5 Flash の料金
const COST_PER_MILLION_TOKENS = 0.15;

interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number | null;
  body: string;
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK";
}

interface Review {
  id: string;
  commitSha: string;
  status: string;
  summary: string | null;
  walkthrough: string | null;
  diagram: string | null;
  tokenCount: number | null;
  createdAt: Date;
  pullRequest: {
    number: number;
    title: string;
    author: string;
    repository: {
      fullName: string;
      htmlUrl: string;
    };
  };
  comments: ReviewComment[];
}

interface ReviewDetailProps {
  review: Review;
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "IMPORTANT":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "INFO":
      return <Info className="h-4 w-4 text-blue-500" />;
    case "NITPICK":
      return <Sparkles className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Info className="h-4 w-4" />;
  }
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return <Badge variant="destructive">Critical</Badge>;
    case "IMPORTANT":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Important</Badge>;
    case "INFO":
      return <Badge variant="secondary">Info</Badge>;
    case "NITPICK":
      return <Badge variant="outline">Nitpick</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
}

interface WalkthroughItem {
  path: string;
  summary: string;
  changeType: string;
}

function parseWalkthrough(walkthrough: string | null): WalkthroughItem[] {
  if (!walkthrough) return [];
  try {
    return JSON.parse(walkthrough);
  } catch {
    return [];
  }
}

export function ReviewDetail({ review }: ReviewDetailProps) {
  const [activeTab, setActiveTab] = useState("summary");

  const walkthroughItems = parseWalkthrough(review.walkthrough);
  const cost = review.tokenCount
    ? (review.tokenCount / 1_000_000) * COST_PER_MILLION_TOKENS
    : 0;

  const criticalCount = review.comments.filter((c) => c.severity === "CRITICAL").length;
  const importantCount = review.comments.filter((c) => c.severity === "IMPORTANT").length;
  const infoCount = review.comments.filter((c) => c.severity === "INFO").length;
  const nitpickCount = review.comments.filter((c) => c.severity === "NITPICK").length;

  const prUrl = `${review.pullRequest.repository.htmlUrl}/pull/${review.pullRequest.number}`;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-xl font-semibold">
                  {review.pullRequest.title}
                </h2>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>by {review.pullRequest.author}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(review.createdAt), {
                    addSuffix: true,
                    locale: ja,
                  })}
                </span>
                <span>•</span>
                <span className="font-mono text-xs">{review.commitSha.slice(0, 7)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Coins className="h-3 w-3" />
                  {review.tokenCount?.toLocaleString() || 0} tokens (${cost.toFixed(4)})
                </span>
              </div>
            </div>
            <Button asChild>
              <Link href={prUrl} target="_blank">
                View on GitHub
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>

          {/* Comment Stats */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm">{criticalCount} Critical</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">{importantCount} Important</span>
            </div>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-sm">{infoCount} Info</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{nitpickCount} Nitpick</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="walkthrough">
            Walkthrough ({walkthroughItems.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            Comments ({review.comments.length})
          </TabsTrigger>
          {review.diagram && <TabsTrigger value="diagram">Diagram</TabsTrigger>}
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Review Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {review.summary || "No summary available."}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Walkthrough Tab */}
        <TabsContent value="walkthrough" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>File Changes Walkthrough</CardTitle>
            </CardHeader>
            <CardContent>
              {walkthroughItems.length === 0 ? (
                <p className="text-muted-foreground">No walkthrough available.</p>
              ) : (
                <div className="space-y-4">
                  {walkthroughItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <FileCode className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm truncate">
                            {item.path}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.changeType}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="mt-4">
          <div className="space-y-4">
            {review.comments.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground text-center">
                    No comments for this review.
                  </p>
                </CardContent>
              </Card>
            ) : (
              review.comments.map((comment) => (
                <Card key={comment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(comment.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-sm text-muted-foreground truncate">
                            {comment.filePath}
                            {comment.lineNumber && `:${comment.lineNumber}`}
                          </span>
                          {getSeverityBadge(comment.severity)}
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {comment.body}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Diagram Tab */}
        {review.diagram && (
          <TabsContent value="diagram" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Architecture Diagram</CardTitle>
              </CardHeader>
              <CardContent>
                <MermaidDiagram chart={review.diagram} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
