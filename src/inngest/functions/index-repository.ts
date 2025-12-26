import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { indexRepository, incrementalIndexRepository } from "@/lib/indexer/index-repository";
import { deleteNamespace } from "@/lib/pinecone/client";

/**
 * リポジトリインデキシングジョブ
 * - GitHub App インストール時に実行
 * - ユーザーがRe-indexをリクエスト時に実行
 */
export const indexRepositoryJob = inngest.createFunction(
  {
    id: "index-repository",
    // リポジトリ単位で同時実行を1に制限
    concurrency: {
      limit: 1,
      key: "event.data.repositoryId",
    },
    retries: 2,
  },
  { event: "repository/index.requested" },
  async ({ event, step }) => {
    const { repositoryId, owner, repo, installationId, branch, commitSha } =
      event.data;

    console.log(`[Inngest] Starting repository indexing: ${owner}/${repo}`);

    // Step 1: リポジトリ情報を確認
    const repository = await step.run("verify-repository", async () => {
      const repo = await prisma.repository.findUnique({
        where: { id: repositoryId },
      });

      if (!repo) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      return repo;
    });

    // Step 2: インデキシングを実行
    const result = await step.run("index-repository", async () => {
      return indexRepository({
        repositoryId,
        owner,
        repo,
        installationId,
        branch: branch || repository.defaultBranch,
        commitSha,
      });
    });

    // Step 3: 結果をログ
    console.log(`[Inngest] Indexing completed:`, {
      repositoryId,
      success: result.success,
      filesProcessed: result.filesProcessed,
      chunksIndexed: result.chunksIndexed,
      errors: result.errors.length,
    });

    return result;
  }
);

/**
 * 増分インデキシングジョブ（プッシュ時に変更ファイルのみ更新）
 */
export const incrementalIndexJob = inngest.createFunction(
  {
    id: "incremental-index",
    concurrency: {
      limit: 1,
      key: "event.data.repositoryId",
    },
    retries: 2,
  },
  { event: "repository/push" },
  async ({ event, step }) => {
    const { repositoryId, owner, repo, installationId, commitSha, changedFiles } =
      event.data;

    console.log(
      `[Inngest] Starting incremental indexing: ${owner}/${repo} (${changedFiles?.length || 0} files)`
    );

    // 変更ファイルがない場合、またはリポジトリが未インデックスの場合はフルインデックスを実行
    const repository = await step.run("check-repository", async () => {
      return prisma.repository.findUnique({
        where: { id: repositoryId },
      });
    });

    if (!repository || repository.indexStatus !== "COMPLETED" || !changedFiles || changedFiles.length === 0) {
      // フルインデックスを実行
      console.log("[Inngest] Performing full reindex");
      const result = await step.run("full-reindex", async () => {
        return indexRepository({
          repositoryId,
          owner,
          repo,
          installationId,
          commitSha,
        });
      });
      return result;
    }

    // 増分インデキシングを実行
    const result = await step.run("incremental-index", async () => {
      return incrementalIndexRepository({
        repositoryId,
        owner,
        repo,
        installationId,
        commitSha,
        changedFiles,
      });
    });

    return result;
  }
);

/**
 * GitHub Appインストール時のリポジトリインデキシング
 */
export const indexOnInstallJob = inngest.createFunction(
  {
    id: "index-on-install",
    concurrency: {
      limit: 2, // インストール時は複数リポジトリを並列処理
      key: "event.data.installationId",
    },
    retries: 2,
  },
  { event: "github/repository.index" },
  async ({ event, step }) => {
    const { installationId, owner, repo, fullName } = event.data;

    console.log(`[Inngest] Indexing repository on install: ${fullName}`);

    // Step 1: リポジトリをDBに作成または取得
    const repository = await step.run("ensure-repository", async () => {
      let existing = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (!existing) {
        existing = await prisma.repository.create({
          data: {
            githubRepoId: 0, // Webhookからは取得できないのでプレースホルダー
            owner,
            name: repo,
            fullName,
            htmlUrl: `https://github.com/${fullName}`,
            installationId,
            indexStatus: "NOT_INDEXED",
          },
        });
      }

      return existing;
    });

    // Step 2: インデキシングを実行
    const result = await step.run("index-repository", async () => {
      return indexRepository({
        repositoryId: repository.id,
        owner,
        repo,
        installationId,
      });
    });

    console.log(`[Inngest] Install indexing completed for ${fullName}:`, {
      success: result.success,
      filesProcessed: result.filesProcessed,
      chunksIndexed: result.chunksIndexed,
    });

    return result;
  }
);

/**
 * リポジトリ削除時のインデックス削除ジョブ
 */
export const deleteIndexJob = inngest.createFunction(
  {
    id: "delete-index",
    retries: 2,
  },
  { event: "github/repository.delete-index" },
  async ({ event, step }) => {
    const { owner, repo, fullName } = event.data;

    console.log(`[Inngest] Deleting index for removed repository: ${fullName}`);

    // Step 1: Pineconeからベクトルを削除
    await step.run("delete-vectors", async () => {
      await deleteNamespace(owner, repo);
    });

    // Step 2: DBからリポジトリを削除（オプション）
    await step.run("cleanup-db", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      });

      if (repository) {
        // 関連データを削除
        await prisma.review.deleteMany({
          where: { pullRequest: { repositoryId: repository.id } },
        });
        await prisma.pullRequest.deleteMany({
          where: { repositoryId: repository.id },
        });
        await prisma.repository.delete({
          where: { id: repository.id },
        });
      }
    });

    console.log(`[Inngest] Index deleted for ${fullName}`);

    return { success: true, repository: fullName };
  }
);
