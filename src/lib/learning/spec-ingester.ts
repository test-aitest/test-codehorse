// 仕様書インジェスター
// OpenAPI、Markdown仕様書を解析してPineconeにインデックス

import { prisma } from "@/lib/prisma";
import { getIndex } from "@/lib/pinecone/client";
import type { RecordMetadata } from "@pinecone-database/pinecone";
import {
  generateEmbedding,
  formatSpecChunkForEmbedding,
} from "@/lib/pinecone/embeddings";
import {
  getSpecsNamespace,
  generateSpecVectorId,
  type SpecificationChunkMetadata,
} from "@/lib/pinecone/types";
import type { SpecDocType } from "@prisma/client";
import { createHash } from "crypto";

/**
 * 仕様書チャンク
 */
export interface SpecChunk {
  content: string;
  section: string;
  chunkIndex: number;
  startLine?: number;
  endLine?: number;
}

/**
 * 仕様書解析結果
 */
export interface ParsedSpecification {
  documentType: SpecDocType;
  title: string;
  chunks: SpecChunk[];
  contentHash: string;
}

/**
 * インジェスト結果
 */
export interface IngestResult {
  documentId: string;
  chunksIndexed: number;
  skipped: boolean;
  skipReason?: string;
}

// チャンクサイズの設定
const MAX_CHUNK_SIZE = 1500; // トークン数の目安

/**
 * 仕様書をインジェスト
 */
export async function ingestSpecification(
  repositoryId: string,
  filePath: string,
  content: string,
  commitSha: string = "HEAD"
): Promise<IngestResult> {
  // コンテンツハッシュを計算
  const contentHash = createHash("sha256").update(content).digest("hex");

  // 既存のドキュメントをチェック
  const existingDoc = await prisma.specificationDocument.findFirst({
    where: { repositoryId, filePath },
  });

  if (existingDoc && existingDoc.contentHash === contentHash) {
    return {
      documentId: existingDoc.id,
      chunksIndexed: 0,
      skipped: true,
      skipReason: "Content unchanged",
    };
  }

  // ドキュメントタイプを検出
  const documentType = detectDocumentType(filePath, content);

  // ドキュメントを解析
  const parsed = parseSpecification(content, documentType, filePath);

  if (parsed.chunks.length === 0) {
    return {
      documentId: existingDoc?.id || "",
      chunksIndexed: 0,
      skipped: true,
      skipReason: "No meaningful content found",
    };
  }

  // リポジトリ情報を取得
  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
  });

  if (!repository) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // ドキュメントレコードを作成/更新
  const document = await prisma.specificationDocument.upsert({
    where: {
      repositoryId_filePath: { repositoryId, filePath },
    },
    create: {
      repositoryId,
      filePath,
      documentType,
      contentHash,
      chunkCount: parsed.chunks.length,
      lastSyncedAt: new Date(),
      lastSyncedSha: commitSha,
    },
    update: {
      documentType,
      contentHash,
      chunkCount: parsed.chunks.length,
      lastSyncedAt: new Date(),
      lastSyncedSha: commitSha,
    },
  });

  // チャンクをベクトル化してPineconeに保存
  const namespace = getSpecsNamespace(repository.owner, repository.name);
  const vectors: Array<{
    id: string;
    values: number[];
    metadata: SpecificationChunkMetadata;
  }> = [];

  for (const chunk of parsed.chunks) {
    const textForEmbedding = formatSpecChunkForEmbedding({
      content: chunk.content,
      section: chunk.section,
      documentType,
      filePath,
    });

    const embedding = await generateEmbedding(textForEmbedding);

    const vectorId = generateSpecVectorId(document.id, chunk.chunkIndex);

    vectors.push({
      id: vectorId,
      values: embedding,
      metadata: {
        repositoryId,
        documentId: document.id,
        documentType,
        filePath,
        section: chunk.section,
        chunkIndex: chunk.chunkIndex,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content.slice(0, 2000), // メタデータサイズ制限
      },
    });
  }

  // Pineconeにアップサート
  if (vectors.length > 0) {
    const index = await getIndex();
    const ns = index.namespace(namespace);

    // Pineconeは最大100件ずつアップサート
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize).map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata as unknown as RecordMetadata,
      }));
      await ns.upsert(batch);
    }
  }

  console.log(
    `[SpecIngester] Indexed ${vectors.length} chunks from ${filePath}`
  );

  return {
    documentId: document.id,
    chunksIndexed: vectors.length,
    skipped: false,
  };
}

/**
 * ドキュメントタイプを検出
 */
function detectDocumentType(filePath: string, content: string): SpecDocType {
  const lowerPath = filePath.toLowerCase();

  // OpenAPI/Swagger
  if (
    lowerPath.includes("openapi") ||
    lowerPath.includes("swagger") ||
    lowerPath.endsWith(".yaml") ||
    lowerPath.endsWith(".yml")
  ) {
    if (
      content.includes("openapi:") ||
      content.includes('"openapi"') ||
      content.includes("swagger:")
    ) {
      return "OPENAPI";
    }
  }

  // JSON Schema
  if (content.includes('"$schema"') && content.includes('"properties"')) {
    return "OPENAPI"; // JSON Schemaもスキーマとして扱う
  }

  // Architecture Decision Records
  if (lowerPath.includes("/adr/") || lowerPath.includes("/adrs/")) {
    return "ARCHITECTURE";
  }

  // Architecture docs
  if (
    lowerPath.includes("architecture") ||
    lowerPath.includes("design") ||
    lowerPath.includes("system")
  ) {
    return "ARCHITECTURE";
  }

  // Default to Markdown
  return "MARKDOWN";
}

/**
 * 仕様書を解析してチャンクに分割
 */
function parseSpecification(
  content: string,
  documentType: SpecDocType,
  filePath: string
): ParsedSpecification {
  const contentHash = createHash("sha256").update(content).digest("hex");

  let chunks: SpecChunk[];

  switch (documentType) {
    case "OPENAPI":
      chunks = parseOpenAPI(content);
      break;
    case "ARCHITECTURE":
    case "MARKDOWN":
    default:
      chunks = parseMarkdown(content);
      break;
  }

  // タイトルを抽出
  const title = extractTitle(content, filePath);

  return {
    documentType,
    title,
    chunks,
    contentHash,
  };
}

/**
 * OpenAPI仕様書を解析
 */
function parseOpenAPI(content: string): SpecChunk[] {
  const chunks: SpecChunk[] = [];
  let chunkIndex = 0;

  try {
    // YAMLまたはJSONをパース
    const isJson = content.trim().startsWith("{");
    let spec: Record<string, unknown>;

    if (isJson) {
      spec = JSON.parse(content);
    } else {
      // 簡易YAMLパース（完全なパースにはjs-yamlが必要）
      // ここではセクション単位での分割のみ行う
      return parseOpenAPIAsText(content);
    }

    // Info section
    if (spec.info) {
      chunks.push({
        content: `API Info:\n${JSON.stringify(spec.info, null, 2)}`,
        section: "info",
        chunkIndex: chunkIndex++,
      });
    }

    // Paths
    if (spec.paths && typeof spec.paths === "object") {
      for (const [path, methods] of Object.entries(
        spec.paths as Record<string, unknown>
      )) {
        const pathContent = `Endpoint: ${path}\n${JSON.stringify(methods, null, 2)}`;

        // 大きすぎる場合は分割
        if (pathContent.length > MAX_CHUNK_SIZE * 4) {
          // 4文字/トークンの概算
          for (const [method, details] of Object.entries(
            methods as Record<string, unknown>
          )) {
            chunks.push({
              content: `${method.toUpperCase()} ${path}\n${JSON.stringify(details, null, 2)}`,
              section: `paths.${path}.${method}`,
              chunkIndex: chunkIndex++,
            });
          }
        } else {
          chunks.push({
            content: pathContent,
            section: `paths.${path}`,
            chunkIndex: chunkIndex++,
          });
        }
      }
    }

    // Components/Schemas
    if (spec.components && typeof spec.components === "object") {
      const components = spec.components as Record<string, unknown>;
      if (components.schemas && typeof components.schemas === "object") {
        for (const [name, schema] of Object.entries(
          components.schemas as Record<string, unknown>
        )) {
          chunks.push({
            content: `Schema: ${name}\n${JSON.stringify(schema, null, 2)}`,
            section: `components.schemas.${name}`,
            chunkIndex: chunkIndex++,
          });
        }
      }
    }
  } catch {
    // パース失敗時はテキストとして処理
    return parseOpenAPIAsText(content);
  }

  return chunks;
}

/**
 * OpenAPIをテキストとしてセクション分割
 */
function parseOpenAPIAsText(content: string): SpecChunk[] {
  const chunks: SpecChunk[] = [];
  const lines = content.split("\n");
  let chunkIndex = 0;

  let currentSection = "root";
  let currentContent: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // セクションの検出（インデントなしのキー）
    const sectionMatch = line.match(/^([a-zA-Z]+):/);

    if (sectionMatch && !line.startsWith(" ")) {
      // 前のセクションを保存
      if (currentContent.length > 0) {
        chunks.push({
          content: currentContent.join("\n"),
          section: currentSection,
          chunkIndex: chunkIndex++,
          startLine,
          endLine: i,
        });
      }

      currentSection = sectionMatch[1];
      currentContent = [line];
      startLine = i + 1;
    } else {
      currentContent.push(line);

      // チャンクが大きくなりすぎたら分割
      if (currentContent.join("\n").length > MAX_CHUNK_SIZE * 4) {
        chunks.push({
          content: currentContent.join("\n"),
          section: currentSection,
          chunkIndex: chunkIndex++,
          startLine,
          endLine: i + 1,
        });
        currentContent = [];
        startLine = i + 2;
      }
    }
  }

  // 最後のセクション
  if (currentContent.length > 0) {
    chunks.push({
      content: currentContent.join("\n"),
      section: currentSection,
      chunkIndex: chunkIndex++,
      startLine,
      endLine: lines.length,
    });
  }

  return chunks;
}

/**
 * Markdownを解析
 */
function parseMarkdown(content: string): SpecChunk[] {
  const chunks: SpecChunk[] = [];
  const lines = content.split("\n");
  let chunkIndex = 0;

  let currentSection = "root";
  let currentContent: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ヘッダーの検出
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headerMatch) {
      // 前のセクションを保存
      if (currentContent.length > 0) {
        const contentText = currentContent.join("\n").trim();
        if (contentText.length > 0) {
          chunks.push({
            content: contentText,
            section: currentSection,
            chunkIndex: chunkIndex++,
            startLine,
            endLine: i,
          });
        }
      }

      currentSection = headerMatch[2];
      currentContent = [line];
      startLine = i + 1;
    } else {
      currentContent.push(line);

      // チャンクが大きくなりすぎたら分割
      const currentText = currentContent.join("\n");
      if (currentText.length > MAX_CHUNK_SIZE * 4) {
        chunks.push({
          content: currentText,
          section: currentSection,
          chunkIndex: chunkIndex++,
          startLine,
          endLine: i + 1,
        });
        currentContent = [];
        startLine = i + 2;
      }
    }
  }

  // 最後のセクション
  if (currentContent.length > 0) {
    const contentText = currentContent.join("\n").trim();
    if (contentText.length > 0) {
      chunks.push({
        content: contentText,
        section: currentSection,
        chunkIndex: chunkIndex++,
        startLine,
        endLine: lines.length,
      });
    }
  }

  return chunks;
}

/**
 * ドキュメントのタイトルを抽出
 */
function extractTitle(content: string, filePath: string): string {
  // Markdownの場合は最初のH1を探す
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) {
    return h1Match[1];
  }

  // OpenAPIの場合はtitleを探す
  const titleMatch = content.match(/title:\s*["']?([^"'\n]+)/);
  if (titleMatch) {
    return titleMatch[1];
  }

  // ファイル名から生成
  const fileName = filePath.split("/").pop() || filePath;
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
}

/**
 * 仕様書インデックスを削除
 */
export async function deleteSpecificationIndex(
  repositoryId: string,
  filePath?: string
): Promise<number> {
  const where = filePath ? { repositoryId, filePath } : { repositoryId };

  const documents = await prisma.specificationDocument.findMany({
    where,
  });

  if (documents.length === 0) {
    return 0;
  }

  // TODO: Pineconeからベクトルを削除（namespace.deleteByPrefix等）
  // 現状はDBレコードのみ削除

  await prisma.specificationDocument.deleteMany({ where });

  console.log(
    `[SpecIngester] Deleted ${documents.length} specification documents`
  );

  return documents.length;
}

/**
 * 仕様書ファイルかどうかを判定
 */
export function isSpecificationFile(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();

  // OpenAPI/Swagger
  if (
    lowerPath.includes("openapi") ||
    lowerPath.includes("swagger") ||
    lowerPath.includes("api-spec")
  ) {
    return true;
  }

  // ADR
  if (lowerPath.includes("/adr/") || lowerPath.includes("/adrs/")) {
    return true;
  }

  // Architecture/Design docs
  if (
    lowerPath.includes("architecture") ||
    lowerPath.includes("/docs/") ||
    lowerPath.includes("design")
  ) {
    if (lowerPath.endsWith(".md") || lowerPath.endsWith(".mdx")) {
      return true;
    }
  }

  // README in important directories
  if (lowerPath.includes("readme.md")) {
    return true;
  }

  return false;
}
