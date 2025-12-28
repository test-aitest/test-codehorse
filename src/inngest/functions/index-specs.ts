// 仕様書インデックス Inngest 関数
// 仕様書ファイルを検出してPineconeにインデックス

import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { getInstallationOctokit, getFileContent } from "@/lib/github/client";
import {
  ingestSpecification,
  isSpecificationFile,
  deleteSpecificationIndex,
} from "@/lib/learning/spec-ingester";

/**
 * リポジトリの仕様書をインデックス
 */
export const indexSpecsJob = inngest.createFunction(
  {
    id: "index-specs",
    concurrency: { limit: 1, key: "event.data.repositoryId" },
    retries: 2,
  },
  { event: "specs/index.requested" },
  async ({ event, step }) => {
    const { repositoryId, installationId, specificPaths } = event.data;

    // Step 1: リポジトリ情報を取得
    const repository = await step.run("load-repository", async () => {
      return prisma.repository.findUnique({
        where: { id: repositoryId },
      });
    });

    if (!repository) {
      return { error: "Repository not found" };
    }

    // Step 2: 仕様書ファイルを検出
    const specFiles = await step.run("detect-spec-files", async () => {
      // 特定のパスが指定されている場合はそれを使用
      if (specificPaths && specificPaths.length > 0) {
        return specificPaths.filter(isSpecificationFile);
      }

      // リポジトリ全体から仕様書ファイルを探す
      const octokit = await getInstallationOctokit(installationId);

      const files: string[] = [];

      // 一般的な仕様書の場所を探索
      const searchPaths = [
        "docs",
        "documentation",
        "api",
        "spec",
        "specs",
        "openapi",
        "swagger",
        "adr",
        "adrs",
        "architecture",
      ];

      for (const searchPath of searchPaths) {
        try {
          const { data: contents } = await octokit.rest.repos.getContent({
            owner: repository.owner,
            repo: repository.name,
            path: searchPath,
          });

          if (Array.isArray(contents)) {
            for (const item of contents) {
              if (item.type === "file" && isSpecificationFile(item.path)) {
                files.push(item.path);
              }
              // サブディレクトリの再帰探索（1レベルのみ）
              if (item.type === "dir") {
                try {
                  const { data: subContents } =
                    await octokit.rest.repos.getContent({
                      owner: repository.owner,
                      repo: repository.name,
                      path: item.path,
                    });
                  if (Array.isArray(subContents)) {
                    for (const subItem of subContents) {
                      if (
                        subItem.type === "file" &&
                        isSpecificationFile(subItem.path)
                      ) {
                        files.push(subItem.path);
                      }
                    }
                  }
                } catch {
                  // サブディレクトリが見つからない場合はスキップ
                }
              }
            }
          }
        } catch {
          // ディレクトリが存在しない場合はスキップ
        }
      }

      // ルートのREADMEとOpenAPIファイルも確認
      const rootFiles = [
        "README.md",
        "openapi.yaml",
        "openapi.json",
        "swagger.yaml",
        "swagger.json",
        "api-spec.yaml",
      ];

      for (const rootFile of rootFiles) {
        try {
          await octokit.rest.repos.getContent({
            owner: repository.owner,
            repo: repository.name,
            path: rootFile,
          });
          if (isSpecificationFile(rootFile)) {
            files.push(rootFile);
          }
        } catch {
          // ファイルが存在しない場合はスキップ
        }
      }

      return [...new Set(files)]; // 重複を除去
    });

    console.log(
      `[IndexSpecs] Found ${specFiles.length} specification files in ${repository.owner}/${repository.name}`
    );

    if (specFiles.length === 0) {
      return {
        repositoryId,
        filesIndexed: 0,
        message: "No specification files found",
      };
    }

    // Step 3: 各ファイルをインデックス
    const results = await step.run("index-files", async () => {
      const indexed: Array<{
        filePath: string;
        chunksIndexed: number;
        skipped: boolean;
      }> = [];

      for (const filePath of specFiles.slice(0, 20)) {
        // 最大20ファイル
        try {
          const content = await getFileContent(
            installationId,
            repository.owner,
            repository.name,
            filePath,
            "HEAD"
          );

          if (!content) {
            console.warn(`[IndexSpecs] Empty content for ${filePath}`);
            continue;
          }

          const result = await ingestSpecification(
            repositoryId,
            filePath,
            content
          );

          indexed.push({
            filePath,
            chunksIndexed: result.chunksIndexed,
            skipped: result.skipped,
          });

          console.log(
            `[IndexSpecs] Indexed ${filePath}: ${result.chunksIndexed} chunks`
          );
        } catch (error) {
          console.error(`[IndexSpecs] Failed to index ${filePath}:`, error);
        }
      }

      return indexed;
    });

    const totalChunks = results.reduce((sum, r) => sum + r.chunksIndexed, 0);
    const filesActuallyIndexed = results.filter((r) => !r.skipped).length;

    console.log(
      `[IndexSpecs] Completed: ${filesActuallyIndexed} files, ${totalChunks} chunks`
    );

    return {
      repositoryId,
      filesFound: specFiles.length,
      filesIndexed: filesActuallyIndexed,
      totalChunks,
      details: results,
    };
  }
);

/**
 * PRで変更された仕様書を増分インデックス
 */
export const incrementalSpecsIndexJob = inngest.createFunction(
  {
    id: "index-specs-incremental",
    concurrency: { limit: 2, key: "event.data.repositoryId" },
    retries: 2,
  },
  { event: "specs/index.incremental" },
  async ({ event, step }) => {
    const { repositoryId, installationId, changedFiles } = event.data;

    // 仕様書ファイルのみフィルタ
    const specFiles = changedFiles.filter(isSpecificationFile);

    if (specFiles.length === 0) {
      return { skipped: true, reason: "No specification files in changes" };
    }

    // リポジトリ情報を取得
    const repository = await step.run("load-repository", async () => {
      return prisma.repository.findUnique({
        where: { id: repositoryId },
      });
    });

    if (!repository) {
      return { error: "Repository not found" };
    }

    // 変更されたファイルをインデックス
    const results = await step.run("index-changed-files", async () => {
      const indexed: Array<{
        filePath: string;
        chunksIndexed: number;
        skipped: boolean;
      }> = [];

      for (const filePath of specFiles) {
        try {
          const content = await getFileContent(
            installationId,
            repository.owner,
            repository.name,
            filePath,
            "HEAD"
          );

          if (!content) {
            // ファイルが削除された場合
            await deleteSpecificationIndex(repositoryId, filePath);
            indexed.push({ filePath, chunksIndexed: 0, skipped: false });
            console.log(`[IndexSpecs] Deleted index for ${filePath}`);
            continue;
          }

          const result = await ingestSpecification(
            repositoryId,
            filePath,
            content
          );

          indexed.push({
            filePath,
            chunksIndexed: result.chunksIndexed,
            skipped: result.skipped,
          });
        } catch (error) {
          console.error(
            `[IndexSpecs] Failed to index changed file ${filePath}:`,
            error
          );
        }
      }

      return indexed;
    });

    return {
      repositoryId,
      filesProcessed: results.length,
      details: results,
    };
  }
);

/**
 * 仕様書インデックスを削除
 */
export const deleteSpecsIndexJob = inngest.createFunction(
  {
    id: "delete-specs-index",
    retries: 1,
  },
  { event: "specs/index.delete" },
  async ({ event, step }) => {
    const { repositoryId } = event.data;

    const deletedCount = await step.run("delete-index", async () => {
      return deleteSpecificationIndex(repositoryId);
    });

    console.log(
      `[IndexSpecs] Deleted specs index for repository ${repositoryId}: ${deletedCount} documents`
    );

    return {
      repositoryId,
      documentsDeleted: deletedCount,
    };
  }
);
