import { queryVectors } from "@/lib/pinecone/client";
import { generateEmbedding, formatQueryForEmbedding } from "@/lib/pinecone/embeddings";
import type { CodeChunkMetadata } from "@/lib/pinecone/types";
import type { ParsedFile } from "@/lib/diff/types";

export interface SearchResult {
  id: string;
  score: number;
  metadata: CodeChunkMetadata;
}

export interface SearchParams {
  owner: string;
  repo: string;
  query: string;
  language?: string;
  topK?: number;
  minScore?: number;
}

/**
 * 関連コードを検索
 */
export async function searchRelatedCode(params: SearchParams): Promise<SearchResult[]> {
  const { owner, repo, query, language, topK = 10, minScore = 0.5 } = params;

  // クエリをEmbedding化
  const queryText = formatQueryForEmbedding({
    query,
    language,
  });
  const queryVector = await generateEmbedding(queryText);

  // Pineconeで検索
  const results = await queryVectors(owner, repo, queryVector, topK);

  // スコアでフィルタリング
  return results.filter((r) => r.score >= minScore);
}

/**
 * Diffから検索クエリを生成
 */
export function generateQueriesFromDiff(files: ParsedFile[]): string[] {
  const queries: string[] = [];

  for (const file of files) {
    // ファイル名からコンテキストを抽出
    const fileName = file.newPath.split("/").pop() || "";
    const dirPath = file.newPath.split("/").slice(0, -1).join("/");

    // 変更内容から重要なキーワードを抽出
    for (const hunk of file.hunks) {
      const addedLines = hunk.changes
        .filter((c) => c.type === "insert")
        .map((c) => c.content);

      // 関数定義や重要なキーワードを検出
      const functionMatches = addedLines.join("\n").match(
        /(?:function|class|interface|type|const|let|var|def|fn|func)\s+(\w+)/g
      );

      if (functionMatches) {
        for (const match of functionMatches) {
          const name = match.split(/\s+/).pop();
          if (name && name.length > 2) {
            queries.push(`${name} in ${fileName}`);
          }
        }
      }

      // インポートされているモジュールを検出
      const importMatches = addedLines.join("\n").match(
        /(?:import|require|from)\s+['"]([@\w\/\-]+)['"]/g
      );

      if (importMatches) {
        for (const match of importMatches) {
          const moduleName = match.match(/['"](.+)['"]/)?.[1];
          if (moduleName && !moduleName.startsWith(".")) {
            queries.push(`usage of ${moduleName}`);
          }
        }
      }
    }

    // ファイルパスからコンテキストを生成
    if (dirPath) {
      queries.push(`files in ${dirPath}`);
    }
  }

  // 重複を除去して最大10クエリに制限
  return [...new Set(queries)].slice(0, 10);
}

/**
 * 複数クエリで検索して結果をマージ
 */
export async function searchWithMultipleQueries(
  owner: string,
  repo: string,
  queries: string[],
  language?: string
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    const results = await searchRelatedCode({
      owner,
      repo,
      query,
      language,
      topK: 5,
      minScore: 0.5,
    });

    for (const result of results) {
      if (!seenIds.has(result.id)) {
        seenIds.add(result.id);
        allResults.push(result);
      }
    }
  }

  // スコアでソートして上位を返す
  return allResults.sort((a, b) => b.score - a.score).slice(0, 15);
}
