"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  GitBranch,
  ExternalLink,
  Database,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Loader2,
  Settings,
  AlertTriangle,
} from "lucide-react";
import {
  reindexRepository,
  disconnectRepository,
} from "@/app/(dashboard)/dashboard/repositories/actions";

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  indexStatus: string;
  installationId: number;
  lastIndexedAt: Date | null;
  createdAt: Date;
  _count: {
    pullRequests: number;
  };
}

interface RepositoryListProps {
  repositories: Repository[];
}

function getIndexStatusBadge(status: string) {
  switch (status) {
    case "COMPLETED":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Indexed
        </Badge>
      );
    case "INDEXING":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Indexing...
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          Not Indexed
        </Badge>
      );
  }
}

function RepositoryCard({ repo }: { repo: Repository }) {
  const [isReindexing, startReindexTransition] = useTransition();
  const [isDisconnecting, startDisconnectTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleReindex = () => {
    setError(null);
    startReindexTransition(async () => {
      const result = await reindexRepository(repo.id);
      if (!result.success) {
        setError(result.error || "Failed to start reindex");
      }
    });
  };

  const handleDisconnect = () => {
    setError(null);
    startDisconnectTransition(async () => {
      const result = await disconnectRepository(repo.id);
      if (!result.success) {
        setError(result.error || "Failed to disconnect repository");
      }
    });
  };

  const isIndexing = repo.indexStatus === "INDEXING";
  const hasValidInstallation = repo.installationId > 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link
                  href={repo.htmlUrl}
                  target="_blank"
                  className="font-medium hover:underline"
                >
                  {repo.fullName}
                </Link>
                {getIndexStatusBadge(repo.indexStatus)}
                {!hasValidInstallation && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Not Connected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{repo._count.pullRequests} PRs reviewed</span>
                {repo.lastIndexedAt && (
                  <span>
                    Last indexed:{" "}
                    {formatDistanceToNow(new Date(repo.lastIndexedAt), {
                      addSuffix: true,
                      locale: ja,
                    })}
                  </span>
                )}
              </div>
              {!hasValidInstallation && (
                <p className="text-sm text-amber-600">
                  This repository needs to be reconnected via the GitHub App.
                  Please use &quot;Add Repository&quot; to reconnect.
                </p>
              )}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/repositories/${repo.id}/settings`}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleReindex}
              disabled={isReindexing || isIndexing || !hasValidInstallation}
              title={!hasValidInstallation ? "Reconnect via Add Repository first" : undefined}
            >
              {isReindexing || isIndexing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isIndexing ? "Indexing..." : "Re-index"}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>リポジトリの連携を解除</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{repo.fullName}</strong> の連携を解除しますか？
                    <br />
                    <br />
                    この操作により、このリポジトリに関連するすべてのレビュー履歴が削除されます。
                    この操作は元に戻せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisconnect}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    連携を解除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="ghost" size="sm" asChild>
              <Link href={repo.htmlUrl} target="_blank">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RepositoryList({ repositories }: RepositoryListProps) {
  if (repositories.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Repositories</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Install the CodeHorse GitHub App on your repositories to start
            receiving AI code reviews.
          </p>
          <Button asChild className="mt-4">
            <Link
              href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "codehorse"}/installations/new`}
              target="_blank"
            >
              Install GitHub App
              <ExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {repositories.map((repo) => (
        <RepositoryCard key={repo.id} repo={repo} />
      ))}
    </div>
  );
}
