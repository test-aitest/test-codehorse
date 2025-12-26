"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Terminal,
  Loader2,
  Copy,
  Check,
  FolderOpen,
} from "lucide-react";
import { MermaidDiagram } from "./mermaid-diagram";
import { generateReviewExportToken } from "@/app/(dashboard)/dashboard/reviews/actions";

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

// Local storage key for folder path
const FOLDER_PATH_KEY = "codehorse-folder-path";

export function ReviewDetail({ review }: ReviewDetailProps) {
  const [activeTab, setActiveTab] = useState("summary");
  const [isPending, startTransition] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);

  // Dialog state
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [generatedCommand, setGeneratedCommand] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const walkthroughItems = parseWalkthrough(review.walkthrough);

  // Load saved folder path from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(FOLDER_PATH_KEY);
    if (saved) {
      setFolderPath(saved);
    }
  }, []);

  // Handle "Apply with Claude Code" button click - open dialog
  const handleApplyWithClaude = () => {
    setApplyError(null);
    setGeneratedCommand(null);
    setGeneratedUrl(null);
    setCopied(false);
    setShowApplyDialog(true);
  };

  // Generate command and prepare for execution
  const handleGenerateCommand = () => {
    if (!folderPath.trim()) {
      setApplyError("Please enter the folder path");
      return;
    }

    // Save folder path to localStorage
    localStorage.setItem(FOLDER_PATH_KEY, folderPath);

    setApplyError(null);
    startTransition(async () => {
      const result = await generateReviewExportToken(review.id);
      if (result.success && result.token) {
        const apiUrl = typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        // Generate the URL and command
        const url = `codehorse://apply?reviewId=${review.id}&token=${result.token}&apiUrl=${encodeURIComponent(apiUrl)}&folderPath=${encodeURIComponent(folderPath)}`;
        const command = `cd "${folderPath}" && codehorse-handler "${url}"`;
        setGeneratedUrl(url);
        setGeneratedCommand(command);
      } else {
        setApplyError(result.error || "Failed to generate token");
      }
    });
  };

  // Open Terminal with the command
  const handleOpenTerminal = () => {
    if (generatedUrl) {
      // Open the URL scheme which will be caught by the macOS handler
      window.location.href = generatedUrl;
    }
  };

  // Copy command to clipboard
  const handleCopyCommand = async () => {
    if (generatedCommand) {
      await navigator.clipboard.writeText(generatedCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleApplyWithClaude}
                disabled={isPending || review.comments.length === 0}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Terminal className="h-4 w-4 mr-2" />
                )}
                Apply with Claude Code
              </Button>
              <Button asChild>
                <Link href={prUrl} target="_blank">
                  View on GitHub
                  <ExternalLink className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Apply Error */}
          {applyError && (
            <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {applyError}
            </div>
          )}

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

      {/* Apply with Claude Code Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Apply with Claude Code
            </DialogTitle>
            <DialogDescription>
              Enter the local folder path where your repository is cloned, then run the generated command in your terminal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Folder Path Input */}
            <div className="space-y-2">
              <Label htmlFor="folderPath" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Repository Path
              </Label>
              <Input
                id="folderPath"
                placeholder="/path/to/your/repository"
                value={folderPath}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFolderPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Example: /Users/username/projects/my-repo
              </p>
            </div>

            {/* Error Message */}
            {applyError && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {applyError}
              </div>
            )}

            {/* Generate Button */}
            {!generatedCommand && (
              <Button
                onClick={handleGenerateCommand}
                disabled={isPending || !folderPath.trim()}
                className="w-full"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Terminal className="h-4 w-4 mr-2" />
                )}
                Generate Command
              </Button>
            )}

            {/* Generated Command */}
            {generatedCommand && (
              <div className="space-y-2">
                <Label>Run this command in your terminal:</Label>
                <div className="relative">
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    {generatedCommand}
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2"
                    onClick={handleCopyCommand}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This command will launch Claude Code with the review content. The token expires in 5 minutes.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
              Close
            </Button>
            {generatedCommand && (
              <Button onClick={handleOpenTerminal}>
                <Terminal className="h-4 w-4 mr-2" />
                Open in Terminal
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
