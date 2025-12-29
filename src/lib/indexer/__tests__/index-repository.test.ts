/**
 * Index Repository Tests
 *
 * リポジトリインデキシングの機能テスト
 * - ファイルツリーの取得とフィルタリング
 * - チャンク化とEmbedding生成
 * - 依存関係インデキシング統合
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { indexRepository, incrementalIndexRepository } from "../index-repository";

// 外部依存をモック
vi.mock("@/lib/prisma", () => ({
  prisma: {
    repository: {
      update: vi.fn().mockResolvedValue({}),
    },
    fileDependency: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
    exportedSymbol: {
      deleteMany: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/github/client", () => ({
  getRepositoryTree: vi.fn(),
  getFileContent: vi.fn(),
}));

vi.mock("@/lib/pinecone/client", () => ({
  deleteNamespace: vi.fn().mockResolvedValue(undefined),
  upsertVectors: vi.fn().mockResolvedValue(undefined),
  deleteByFilePath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pinecone/embeddings", () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  formatChunkForEmbedding: vi.fn().mockReturnValue("formatted chunk"),
}));

vi.mock("@/lib/analysis/dependency-indexer", () => ({
  indexRepositoryDependencies: vi.fn().mockResolvedValue({
    totalFiles: 2,
    totalImports: 5,
    totalExports: 3,
    errors: [],
  }),
}));

import { getRepositoryTree, getFileContent } from "@/lib/github/client";
import { indexRepositoryDependencies } from "@/lib/analysis/dependency-indexer";
import { prisma } from "@/lib/prisma";

describe("indexRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("レビュー対象のファイルをインデックス化する", async () => {
    // モックセットアップ
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/index.ts", size: 1000, sha: "abc123", mode: "100644" },
      { type: "blob", path: "src/utils.ts", size: 500, sha: "def456", mode: "100644" },
      { type: "tree", path: "src", sha: "dir123", mode: "040000" }, // ディレクトリはスキップ
      { type: "blob", path: "package-lock.json", size: 10000, sha: "lock123", mode: "100644" }, // フィルタで除外
    ]);

    vi.mocked(getFileContent)
      .mockResolvedValueOnce("export function hello() { return 'world'; }")
      .mockResolvedValueOnce("export const util = () => {};");

    const result = await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
      branch: "main",
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it("大きすぎるファイルをスキップする", async () => {
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/small.ts", size: 1000, sha: "abc123", mode: "100644" },
      { type: "blob", path: "src/large.ts", size: 200000, sha: "def456", mode: "100644" }, // 100KB超
    ]);

    vi.mocked(getFileContent).mockResolvedValue(
      "export function hello() { return 'world'; }"
    );

    const result = await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
  });

  it("依存関係インデキシングが統合されている", async () => {
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/index.ts", size: 1000, sha: "abc123", mode: "100644" },
    ]);

    vi.mocked(getFileContent).mockResolvedValue(
      `import { foo } from "./utils";
export function bar() { return foo(); }`
    );

    await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
    });

    // 依存関係インデキシングが呼ばれたことを確認
    expect(indexRepositoryDependencies).toHaveBeenCalledWith(
      "repo-1",
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/index.ts",
        }),
      ])
    );
  });

  it("依存関係インデキシングのエラーを処理する", async () => {
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/index.ts", size: 1000, sha: "abc123", mode: "100644" },
    ]);

    vi.mocked(getFileContent).mockResolvedValue(
      "export function hello() { return 'world'; }"
    );

    // 依存関係インデキシングがエラーを返す
    vi.mocked(indexRepositoryDependencies).mockResolvedValueOnce({
      totalFiles: 1,
      totalImports: 0,
      totalExports: 1,
      errors: ["Failed to parse import"],
    });

    const result = await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
    });

    // エラーがあっても成功
    expect(result.success).toBe(true);
    expect(result.errors).toContain("Failed to parse import");
  });

  it("ファイル取得エラーを処理する", async () => {
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/index.ts", size: 1000, sha: "abc123", mode: "100644" },
      { type: "blob", path: "src/broken.ts", size: 500, sha: "broken", mode: "100644" },
    ]);

    vi.mocked(getFileContent)
      .mockResolvedValueOnce("export function hello() {}")
      .mockRejectedValueOnce(new Error("File not found"));

    const result = await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
    expect(result.errors.some((e) => e.includes("Failed to fetch"))).toBe(true);
  });

  it("インデキシングステータスを更新する", async () => {
    vi.mocked(getRepositoryTree).mockResolvedValue([
      { type: "blob", path: "src/index.ts", size: 1000, sha: "abc123", mode: "100644" },
    ]);

    vi.mocked(getFileContent).mockResolvedValue("export const x = 1;");

    await indexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
      commitSha: "commit123",
    });

    // INDEXINGステータスに更新
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: "repo-1" },
      data: { indexStatus: "INDEXING" },
    });

    // COMPLETEDステータスに更新
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: "repo-1" },
      data: expect.objectContaining({
        indexStatus: "COMPLETED",
        indexedCommitSha: "commit123",
      }),
    });
  });
});

describe("incrementalIndexRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("変更されたファイルのみをインデックス化する", async () => {
    vi.mocked(getFileContent).mockResolvedValue(
      "export function updated() { return 'new'; }"
    );

    const result = await incrementalIndexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
      commitSha: "newcommit",
      changedFiles: ["src/updated.ts"],
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
  });

  it("レビュー対象外のファイルをスキップする", async () => {
    const result = await incrementalIndexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
      commitSha: "newcommit",
      changedFiles: ["package-lock.json", "node_modules/lib/index.js"],
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(0);
  });

  it("削除されたファイルを処理する", async () => {
    // ファイルが削除された場合はnullを返す
    vi.mocked(getFileContent).mockResolvedValue(null);

    const result = await incrementalIndexRepository({
      repositoryId: "repo-1",
      owner: "test-owner",
      repo: "test-repo",
      installationId: 12345,
      commitSha: "newcommit",
      changedFiles: ["src/deleted.ts"],
    });

    expect(result.success).toBe(true);
    expect(result.filesProcessed).toBe(1);
  });
});
