// 仕様書検索
// Pineconeから仕様書チャンクを検索してコンテキストを構築

import { getIndex } from "@/lib/pinecone/client";
import {
  generateEmbedding,
  formatSpecQueryForEmbedding,
} from "@/lib/pinecone/embeddings";
import {
  getSpecsNamespace,
  type SpecificationChunkMetadata,
} from "@/lib/pinecone/types";
import type { ParsedFile } from "@/lib/diff/types";
import type { SpecDocType } from "@prisma/client";

/**
 * 仕様書検索結果
 */
export interface SpecSearchResult {
  id: string;
  score: number;
  metadata: SpecificationChunkMetadata;
}

/**
 * 取得した仕様書チャンク
 */
export interface RetrievedSpec {
  documentId: string;
  filePath: string;
  documentType: SpecDocType;
  section: string;
  content: string;
  score: number;
}

/**
 * 仕様書検索パラメータ
 */
export interface SpecSearchParams {
  owner: string;
  repo: string;
  files: ParsedFile[];
  topK?: number;
  documentTypes?: SpecDocType[];
}

/**
 * 仕様書検索結果
 */
export interface SpecSearchResponse {
  specs: RetrievedSpec[];
  totalFound: number;
}

/**
 * PRの変更内容に関連する仕様書を検索
 */
export async function searchRelevantSpecs(
  params: SpecSearchParams
): Promise<SpecSearchResponse> {
  const { owner, repo, files, topK = 5, documentTypes } = params;

  if (files.length === 0) {
    return { specs: [], totalFound: 0 };
  }

  // 変更ファイルからコンテキストを生成
  const codeContext = generateCodeContextForSpecSearch(files);

  // クエリテキストを生成
  const queryText = formatSpecQueryForEmbedding({
    context: codeContext,
  });

  // Embeddingを生成
  const queryVector = await generateEmbedding(queryText);

  // Pineconeで検索
  const namespace = getSpecsNamespace(owner, repo);
  const index = await getIndex();
  const ns = index.namespace(namespace);

  // フィルタを構築
  type FilterType = { documentType?: { $in: SpecDocType[] } };
  const filter: FilterType = {};
  if (documentTypes && documentTypes.length > 0) {
    filter.documentType = { $in: documentTypes };
  }

  const results = await ns.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  if (!results.matches || results.matches.length === 0) {
    return { specs: [], totalFound: 0 };
  }

  // 結果を変換
  const specs: RetrievedSpec[] = results.matches
    .filter((match) => match.metadata && match.score && match.score > 0.3)
    .map((match) => {
      const metadata = match.metadata as unknown as SpecificationChunkMetadata;
      return {
        documentId: metadata.documentId,
        filePath: metadata.filePath,
        documentType: metadata.documentType,
        section: metadata.section,
        content: metadata.content || "",
        score: match.score || 0,
      };
    });

  return {
    specs,
    totalFound: specs.length,
  };
}

/**
 * 変更ファイルから仕様書検索用のコンテキストを生成
 */
function generateCodeContextForSpecSearch(files: ParsedFile[]): string {
  const sections: string[] = [];

  // ファイルパスと変更の概要
  sections.push("変更されたファイル:");
  for (const file of files.slice(0, 10)) {
    sections.push(`- ${file.newPath}`);
  }

  // 変更内容のキーワードを抽出
  const keywords = new Set<string>();

  for (const file of files.slice(0, 5)) {
    for (const hunk of file.hunks.slice(0, 3)) {
      for (const change of hunk.changes) {
        if (change.type === "insert" || change.type === "delete") {
          // 関数名やクラス名を抽出
          const funcMatch = change.content.match(
            /(?:function|def|class|interface|type)\s+(\w+)/
          );
          if (funcMatch) {
            keywords.add(funcMatch[1]);
          }

          // API関連のキーワードを抽出
          const apiMatch = change.content.match(
            /(?:\/api\/|endpoint|route|path).*?["']([^"']+)["']/i
          );
          if (apiMatch) {
            keywords.add(apiMatch[1]);
          }

          // HTTPメソッドを抽出
          const httpMatch = change.content.match(
            /(?:GET|POST|PUT|DELETE|PATCH)\s*["']?([^"'\s,]+)/i
          );
          if (httpMatch) {
            keywords.add(httpMatch[0]);
          }
        }
      }
    }
  }

  if (keywords.size > 0) {
    sections.push("");
    sections.push("関連キーワード:");
    sections.push([...keywords].slice(0, 20).join(", "));
  }

  return sections.join("\n");
}

/**
 * 仕様書をコンテキスト文字列に変換
 */
export function buildSpecsContext(specs: RetrievedSpec[]): string {
  if (specs.length === 0) {
    return "";
  }

  const lines = [
    "## 関連仕様書・ドキュメント",
    "",
    "この変更に関連する仕様書の情報:",
    "",
  ];

  // ドキュメントタイプでグループ化
  const grouped = new Map<SpecDocType, RetrievedSpec[]>();

  for (const spec of specs) {
    const existing = grouped.get(spec.documentType) || [];
    existing.push(spec);
    grouped.set(spec.documentType, existing);
  }

  // OpenAPIを先に
  const typeOrder: SpecDocType[] = ["OPENAPI", "ARCHITECTURE", "MARKDOWN"];

  for (const docType of typeOrder) {
    const specsOfType = grouped.get(docType);
    if (!specsOfType || specsOfType.length === 0) continue;

    const typeName = getDocTypeName(docType);
    lines.push(`### ${typeName}`);
    lines.push("");

    for (const spec of specsOfType) {
      lines.push(`**${spec.section}** (from \`${spec.filePath}\`)`);

      // コンテンツを適度に切り詰め
      const content = spec.content.slice(0, 500);
      const truncated = spec.content.length > 500 ? "..." : "";

      lines.push("```");
      lines.push(content + truncated);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push(
    "※ 仕様書に記載された設計意図や制約に従ってレビューを行ってください。"
  );

  return lines.join("\n");
}

/**
 * ドキュメントタイプの表示名を取得
 */
function getDocTypeName(docType: SpecDocType): string {
  switch (docType) {
    case "OPENAPI":
      return "API仕様 (OpenAPI/Swagger)";
    case "ARCHITECTURE":
      return "アーキテクチャ・設計ドキュメント";
    case "MARKDOWN":
      return "ドキュメント";
    default:
      return "その他";
  }
}
