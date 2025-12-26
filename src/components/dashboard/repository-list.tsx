"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  ExternalLink,
  Database,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react";

interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  indexStatus: string;
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
          <Clock className="h-3 w-3" />
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
    case "PENDING":
      return (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
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
        <Card key={repo.id}>
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
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-index
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={repo.htmlUrl} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
