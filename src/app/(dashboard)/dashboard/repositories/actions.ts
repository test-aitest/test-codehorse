"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { IndexStatus } from "@prisma/client";

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
