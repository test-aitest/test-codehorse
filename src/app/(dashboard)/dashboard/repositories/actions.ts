"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { IndexStatus } from "@prisma/client";
import {
  getAppInstallations,
  getInstallationRepositories,
  getRepository,
} from "@/lib/github/client";

/**
 * リポジトリのRe-indexをトリガー
 */
export async function reindexRepository(repositoryId: string) {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repository) {
    return { success: false, error: "Repository not found" };
  }

  // インデックス中の場合はスキップ
  if (repository.indexStatus === "INDEXING") {
    return { success: false, error: "Repository is already being indexed" };
  }

  // ステータスをINDEXINGに更新
  await prisma.repository.update({
    where: { id: repositoryId },
    data: { indexStatus: IndexStatus.INDEXING },
  });

  // Inngestイベントを送信（repository/index.requestedを使用）
  await inngest.send({
    name: "repository/index.requested",
    data: {
      repositoryId: repository.id,
      owner: repository.owner,
      repo: repository.name,
      installationId: repository.installationId,
      branch: "main", // デフォルトブランチ
    },
  });

  revalidatePath("/dashboard/repositories");

  return { success: true };
}

/**
 * リポジトリの連携を解除（DBから削除）
 */
export async function disconnectRepository(repositoryId: string) {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    include: {
      pullRequests: {
        include: {
          reviews: true,
        },
      },
    },
  });

  if (!repository) {
    return { success: false, error: "Repository not found" };
  }

  // 関連するレビューコメントを削除
  for (const pr of repository.pullRequests) {
    for (const review of pr.reviews) {
      await prisma.reviewComment.deleteMany({
        where: { reviewId: review.id },
      });
    }
  }

  // レビューを削除
  for (const pr of repository.pullRequests) {
    await prisma.review.deleteMany({
      where: { pullRequestId: pr.id },
    });
  }

  // プルリクエストを削除
  await prisma.pullRequest.deleteMany({
    where: { repositoryId },
  });

  // リポジトリを削除
  await prisma.repository.delete({
    where: { id: repositoryId },
  });

  revalidatePath("/dashboard/repositories");

  return { success: true };
}

/**
 * GitHub Appのインストール情報一覧を取得
 */
export async function fetchInstallations() {
  try {
    const installations = await getAppInstallations();
    return { success: true, data: installations };
  } catch (error) {
    console.error("Failed to fetch installations:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch installations",
    };
  }
}

/**
 * インストールで利用可能なリポジトリ一覧を取得
 */
export async function fetchAvailableRepositories(installationId: number) {
  try {
    const repositories = await getInstallationRepositories(installationId);

    // 既に登録済みのリポジトリを取得
    const existingRepos = await prisma.repository.findMany({
      where: {
        fullName: {
          in: repositories.map((r) => r.fullName),
        },
      },
      select: { fullName: true },
    });

    const existingFullNames = new Set(existingRepos.map((r) => r.fullName));

    // 登録済みかどうかのフラグを追加
    const reposWithStatus = repositories.map((repo) => ({
      ...repo,
      isConnected: existingFullNames.has(repo.fullName),
    }));

    return { success: true, data: reposWithStatus };
  } catch (error) {
    console.error("Failed to fetch repositories:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch repositories",
    };
  }
}

/**
 * リポジトリを追加（データベースに登録してインデキシング開始）
 */
export async function addRepository(installationId: number, fullName: string) {
  try {
    const [owner, name] = fullName.split("/");

    // GitHubからリポジトリ詳細を取得
    const repoDetails = await getRepository(installationId, owner, name);

    // 既存チェック
    const existing = await prisma.repository.findFirst({
      where: { fullName },
    });

    if (existing) {
      // 既存の場合はinstallationIdを更新
      await prisma.repository.update({
        where: { id: existing.id },
        data: { installationId },
      });

      // インデキシングを開始
      await inngest.send({
        name: "repository/index.requested",
        data: {
          repositoryId: existing.id,
          owner,
          repo: name,
          installationId,
          branch: existing.defaultBranch,
        },
      });

      revalidatePath("/dashboard/repositories");
      return { success: true, repositoryId: existing.id };
    }

    // 新規作成
    const repository = await prisma.repository.create({
      data: {
        githubRepoId: repoDetails.id,
        owner,
        name,
        fullName,
        htmlUrl: repoDetails.htmlUrl,
        isPrivate: repoDetails.isPrivate,
        defaultBranch: repoDetails.defaultBranch,
        description: repoDetails.description,
        language: repoDetails.language,
        installationId,
        indexStatus: IndexStatus.INDEXING,
      },
    });

    // インデキシングを開始
    await inngest.send({
      name: "repository/index.requested",
      data: {
        repositoryId: repository.id,
        owner,
        repo: name,
        installationId,
        branch: repository.defaultBranch,
      },
    });

    revalidatePath("/dashboard/repositories");
    return { success: true, repositoryId: repository.id };
  } catch (error) {
    console.error("Failed to add repository:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add repository",
    };
  }
}

/**
 * リポジトリのステータスを取得（ポーリング用）
 */
export async function getRepositoryStatus(repositoryId: string) {
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: {
      indexStatus: true,
      lastIndexedAt: true,
    },
  });

  if (!repository) {
    return { success: false, error: "Repository not found" };
  }

  return {
    success: true,
    data: {
      indexStatus: repository.indexStatus,
      lastIndexedAt: repository.lastIndexedAt,
    },
  };
}

/**
 * 既存リポジトリのinstallationIdを更新
 */
export async function updateRepositoryInstallation(
  repositoryId: string,
  installationId: number
) {
  try {
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      return { success: false, error: "Repository not found" };
    }

    await prisma.repository.update({
      where: { id: repositoryId },
      data: { installationId },
    });

    revalidatePath("/dashboard/repositories");
    return { success: true };
  } catch (error) {
    console.error("Failed to update repository installation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update",
    };
  }
}
