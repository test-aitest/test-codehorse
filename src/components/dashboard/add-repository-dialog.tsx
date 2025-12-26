"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Loader2,
  GitBranch,
  Lock,
  Globe,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  fetchInstallations,
  fetchAvailableRepositories,
  addRepository,
} from "@/app/(dashboard)/dashboard/repositories/actions";

interface Installation {
  id: number;
  account: {
    login: string;
    avatar_url: string;
    type: string;
  };
  repository_selection: string;
}

interface AvailableRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  htmlUrl: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  isConnected: boolean;
}

export function AddRepositoryDialog() {
  const [open, setOpen] = useState(false);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedInstallation, setSelectedInstallation] =
    useState<Installation | null>(null);
  const [repositories, setRepositories] = useState<AvailableRepository[]>([]);
  const [loadingInstallations, setLoadingInstallations] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [addingRepo, setAddingRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // インストール情報を取得
  useEffect(() => {
    if (open && installations.length === 0) {
      loadInstallations();
    }
  }, [open]);

  const loadInstallations = async () => {
    setLoadingInstallations(true);
    setError(null);
    try {
      const result = await fetchInstallations();
      if (result.success && result.data) {
        setInstallations(result.data);
        // 1つだけの場合は自動選択
        if (result.data.length === 1) {
          handleSelectInstallation(result.data[0]);
        }
      } else {
        setError(result.error || "Failed to load installations");
      }
    } finally {
      setLoadingInstallations(false);
    }
  };

  const handleSelectInstallation = async (installation: Installation) => {
    setSelectedInstallation(installation);
    setLoadingRepos(true);
    setError(null);
    try {
      const result = await fetchAvailableRepositories(installation.id);
      if (result.success && result.data) {
        setRepositories(result.data);
      } else {
        setError(result.error || "Failed to load repositories");
      }
    } finally {
      setLoadingRepos(false);
    }
  };

  const handleAddRepository = async (repo: AvailableRepository) => {
    if (!selectedInstallation) return;

    setAddingRepo(repo.fullName);
    startTransition(async () => {
      const result = await addRepository(
        selectedInstallation.id,
        repo.fullName
      );
      if (result.success) {
        // リポジトリリストを更新
        setRepositories((prev) =>
          prev.map((r) =>
            r.fullName === repo.fullName ? { ...r, isConnected: true } : r
          )
        );
      } else {
        setError(result.error || "Failed to add repository");
      }
      setAddingRepo(null);
    });
  };

  const handleRefresh = () => {
    if (selectedInstallation) {
      handleSelectInstallation(selectedInstallation);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Repository
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Select a repository from your GitHub App installation to add.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        {loadingInstallations ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : installations.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              No GitHub App installations found.
            </p>
            <Button asChild>
              <a
                href={`https://github.com/apps/${
                  process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "codehorse"
                }/installations/new`}
                target="_blank"
              >
                Install GitHub App
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* インストール選択（複数ある場合） */}
            {installations.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {installations.map((installation) => (
                  <Button
                    key={installation.id}
                    variant={
                      selectedInstallation?.id === installation.id
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => handleSelectInstallation(installation)}
                  >
                    {installation.account.login}
                  </Button>
                ))}
              </div>
            )}

            {/* リポジトリリスト */}
            {selectedInstallation && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Repositories for {selectedInstallation.account.login}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={loadingRepos}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${
                        loadingRepos ? "animate-spin" : ""
                      }`}
                    />
                  </Button>
                </div>

                {loadingRepos ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : repositories.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No repositories found.
                  </p>
                ) : (
                  <ScrollArea className="h-100 pr-4">
                    <div className="space-y-2">
                      {repositories.map((repo) => (
                        <Card key={repo.id}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">
                                      {repo.name}
                                    </span>
                                    {repo.isPrivate ? (
                                      <Lock className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <Globe className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    {repo.language && (
                                      <Badge
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {repo.language}
                                      </Badge>
                                    )}
                                  </div>
                                  {repo.description && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {repo.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 ml-2">
                                {repo.isConnected ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Check className="h-3 w-3" />
                                    Connected
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddRepository(repo)}
                                    disabled={
                                      addingRepo === repo.fullName || isPending
                                    }
                                  >
                                    {addingRepo === repo.fullName ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Plus className="h-4 w-4" />
                                    )}
                                    Add
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
