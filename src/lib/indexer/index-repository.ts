import { prisma } from "@/lib/prisma";
import { getRepositoryTree, getFileContent } from "@/lib/github/client";
import { chunkFile, createIndexableFile } from "./chunker";
import { upsertVectors, deleteNamespace, deleteByFilePath } from "@/lib/pinecone/client";
import { generateEmbeddings, formatChunkForEmbedding } from "@/lib/pinecone/embeddings";
import { generateVectorId } from "@/lib/pinecone/types";
import type { VectorRecord, CodeChunkMetadata } from "@/lib/pinecone/types";
import type { CodeChunk } from "./types";
import { shouldReviewFile } from "@/lib/diff/filter";
import { indexRepositoryDependencies } from "@/lib/analysis/dependency-indexer";

// インデックス対象の最大ファイルサイズ（バイト）
const MAX_FILE_SIZE = 100 * 1024; // 100KB

// バッチ処理のサイズ
const FILE_BATCH_SIZE = 10;
const EMBEDDING_BATCH_SIZE = 50;

export interface IndexRepositoryParams {
  repositoryId: string;
  owner: string;
  repo: string;
  installationId: number;
  branch?: string;
  commitSha?: string;
}

export interface IncrementalIndexParams {
  repositoryId: string;
  owner: string;
  repo: string;
  installationId: number;
  commitSha: string;
  changedFiles: string[];
}

export interface IndexRepositoryResult {
  success: boolean;
  filesProcessed: number;
  chunksIndexed: number;
  errors: string[];
}

/**
 * リポジトリ全体をインデックス化
 */
export async function indexRepository(
  params: IndexRepositoryParams
): Promise<IndexRepositoryResult> {
  const { repositoryId, owner, repo, installationId, branch = "main", commitSha } = params;

  const errors: string[] = [];
  let filesProcessed = 0;
  let chunksIndexed = 0;

  try {
    console.log(`[Indexer] Starting indexing for ${owner}/${repo}`);

    // ステータスを INDEXING に更新
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { indexStatus: "INDEXING" },
    });

    // 既存のベクトルを削除（フルリインデックス）
    await deleteNamespace(owner, repo);

    // リポジトリのファイルツリーを取得
    const tree = await getRepositoryTree(installationId, owner, repo, branch);

    // インデックス対象ファイルをフィルタリング
    const indexableFiles = tree.filter((item) => {
      if (item.type !== "blob") return false;
      if (!item.path) return false;
      if (item.size && item.size > MAX_FILE_SIZE) return false;
      return shouldReviewFile(item.path);
    });

    console.log(`[Indexer] Found ${indexableFiles.length} indexable files`);

    // 依存関係インデキシング用にファイル内容を収集
    const allFileContents: Array<{ path: string; content: string }> = [];

    // ファイルをバッチ処理
    for (let i = 0; i < indexableFiles.length; i += FILE_BATCH_SIZE) {
      const batch = indexableFiles.slice(i, i + FILE_BATCH_SIZE);

      // ファイル内容を並列取得
      const fileContents = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await getFileContent(
              installationId,
              owner,
              repo,
              file.path!,
              branch
            );
            return content ? { path: file.path!, content } : null;
          } catch (error) {
            errors.push(`Failed to fetch ${file.path}: ${error}`);
            return null;
          }
        })
      );

      // チャンク化
      const allChunks: CodeChunk[] = [];
      for (const file of fileContents) {
        if (!file) continue;

        // 依存関係インデキシング用に収集
        allFileContents.push(file);

        try {
          const indexableFile = createIndexableFile(file.path, file.content);
          const result = chunkFile(indexableFile);
          allChunks.push(...result.chunks);
          filesProcessed++;
        } catch (error) {
          errors.push(`Failed to chunk ${file.path}: ${error}`);
        }
      }

      // Embeddingを生成してPineconeにアップサート
      if (allChunks.length > 0) {
        const indexed = await indexChunks(
          allChunks,
          repositoryId,
          owner,
          repo,
          commitSha || branch
        );
        chunksIndexed += indexed;
      }

      console.log(
        `[Indexer] Progress: ${Math.min(i + FILE_BATCH_SIZE, indexableFiles.length)}/${indexableFiles.length} files`
      );
    }

    // 依存関係をインデキシング（Phase 3）
    if (allFileContents.length > 0) {
      try {
        const depResult = await indexRepositoryDependencies(
          repositoryId,
          allFileContents
        );
        console.log(
          `[Indexer] Dependencies indexed: ${depResult.totalFiles} files, ${depResult.totalImports} imports, ${depResult.totalExports} exports`
        );
        if (depResult.errors.length > 0) {
          errors.push(...depResult.errors.slice(0, 10)); // 最大10件のエラーを追加
        }
      } catch (depError) {
        console.error(`[Indexer] Dependency indexing failed:`, depError);
        errors.push(`Dependency indexing failed: ${depError}`);
      }
    }

    // ステータスを COMPLETED に更新
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        indexStatus: "COMPLETED",
        lastIndexedAt: new Date(),
        indexedCommitSha: commitSha || branch,
      },
    });

    console.log(
      `[Indexer] Completed: ${filesProcessed} files, ${chunksIndexed} chunks indexed`
    );

    return {
      success: true,
      filesProcessed,
      chunksIndexed,
      errors,
    };
  } catch (error) {
    console.error(`[Indexer] Failed:`, error);

    // ステータスを FAILED に更新
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { indexStatus: "FAILED" },
    });

    return {
      success: false,
      filesProcessed,
      chunksIndexed,
      errors: [...errors, String(error)],
    };
  }
}

/**
 * チャンクをEmbeddingしてPineconeにアップサート
 */
async function indexChunks(
  chunks: CodeChunk[],
  repositoryId: string,
  owner: string,
  repo: string,
  commitSha: string
): Promise<number> {
  if (chunks.length === 0) return 0;

  // Embedding用のテキストを準備
  const texts = chunks.map((chunk) =>
    formatChunkForEmbedding({
      content: chunk.content,
      filePath: chunk.filePath,
      language: chunk.language,
      chunkType: chunk.chunkType,
      name: chunk.name,
      signature: chunk.signature,
    })
  );

  // バッチでEmbeddingを生成
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await generateEmbeddings(batch);
    embeddings.push(...batchEmbeddings);
  }

  // VectorRecordを作成
  const vectors: VectorRecord[] = chunks.map((chunk, index) => {
    const metadata: CodeChunkMetadata = {
      repositoryId,
      owner,
      repo,
      filePath: chunk.filePath,
      language: chunk.language,
      chunkType: chunk.chunkType,
      name: chunk.name,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      parentName: chunk.parentName,
      signature: chunk.signature,
      commitSha,
      indexedAt: new Date().toISOString(),
    };

    return {
      id: generateVectorId(
        repositoryId,
        chunk.filePath,
        chunk.chunkType,
        chunk.name,
        chunk.startLine
      ),
      values: embeddings[index],
      metadata,
    };
  });

  // Pineconeにアップサート
  await upsertVectors(owner, repo, vectors);

  return vectors.length;
}

/**
 * 増分インデキシング - 変更されたファイルのみを再インデックス
 */
export async function incrementalIndexRepository(
  params: IncrementalIndexParams
): Promise<IndexRepositoryResult> {
  const { repositoryId, owner, repo, installationId, commitSha, changedFiles } = params;

  const errors: string[] = [];
  let filesProcessed = 0;
  let chunksIndexed = 0;

  try {
    console.log(`[Indexer] Starting incremental indexing for ${owner}/${repo}: ${changedFiles.length} files`);

    // インデックス対象ファイルをフィルタリング
    const indexableFiles = changedFiles.filter((filePath) => shouldReviewFile(filePath));

    if (indexableFiles.length === 0) {
      console.log("[Indexer] No indexable files in changed files");
      return {
        success: true,
        filesProcessed: 0,
        chunksIndexed: 0,
        errors: [],
      };
    }

    console.log(`[Indexer] ${indexableFiles.length} indexable files to process`);

    // ファイルをバッチ処理
    for (let i = 0; i < indexableFiles.length; i += FILE_BATCH_SIZE) {
      const batch = indexableFiles.slice(i, i + FILE_BATCH_SIZE);

      // 各ファイルの既存ベクトルを削除し、新しいコンテンツを取得
      for (const filePath of batch) {
        try {
          // 既存のベクトルを削除
          await deleteByFilePath(owner, repo, filePath);

          // 新しいファイル内容を取得
          const content = await getFileContent(
            installationId,
            owner,
            repo,
            filePath,
            commitSha
          );

          // ファイルが削除された場合はスキップ（ベクトル削除のみ）
          if (!content) {
            console.log(`[Indexer] File deleted: ${filePath}`);
            filesProcessed++;
            continue;
          }

          // チャンク化
          const indexableFile = createIndexableFile(filePath, content);
          const result = chunkFile(indexableFile);

          if (result.chunks.length > 0) {
            // Embeddingを生成してPineconeにアップサート
            const indexed = await indexChunks(
              result.chunks,
              repositoryId,
              owner,
              repo,
              commitSha
            );
            chunksIndexed += indexed;
          }

          filesProcessed++;
        } catch (error) {
          errors.push(`Failed to process ${filePath}: ${error}`);
        }
      }

      console.log(
        `[Indexer] Incremental progress: ${Math.min(i + FILE_BATCH_SIZE, indexableFiles.length)}/${indexableFiles.length} files`
      );
    }

    // インデックス済みコミットSHAを更新
    await prisma.repository.update({
      where: { id: repositoryId },
      data: {
        indexedCommitSha: commitSha,
        lastIndexedAt: new Date(),
      },
    });

    console.log(
      `[Indexer] Incremental indexing completed: ${filesProcessed} files, ${chunksIndexed} chunks indexed`
    );

    return {
      success: true,
      filesProcessed,
      chunksIndexed,
      errors,
    };
  } catch (error) {
    console.error(`[Indexer] Incremental indexing failed:`, error);

    return {
      success: false,
      filesProcessed,
      chunksIndexed,
      errors: [...errors, String(error)],
    };
  }
}
