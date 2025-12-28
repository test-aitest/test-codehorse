import type { SearchResult } from "./search";
import type { ParsedFile } from "@/lib/diff/types";
import { countTokens } from "@/lib/tokenizer";
import { getFileContent } from "@/lib/github/client";

// コンテキストの最大トークン数
const MAX_CONTEXT_TOKENS = 8000;

export interface ContextChunk {
  filePath: string;
  name: string;
  chunkType: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}

export interface BuiltContext {
  text: string;
  chunks: ContextChunk[];
  totalTokens: number;
}

/**
 * 検索結果からコンテキストテキストを構築
 */
export function buildContextFromSearchResults(
  results: SearchResult[],
  fileContents: Map<string, string>
): BuiltContext {
  const chunks: ContextChunk[] = [];
  let totalTokens = 0;

  for (const result of results) {
    const { metadata, score } = result;
    const fileContent = fileContents.get(metadata.filePath);

    if (!fileContent) continue;

    // ファイル内容から該当部分を抽出
    const lines = fileContent.split("\n");
    const chunkContent = lines
      .slice(metadata.startLine - 1, metadata.endLine)
      .join("\n");

    const chunkTokens = countTokens(chunkContent);

    // トークン制限チェック
    if (totalTokens + chunkTokens > MAX_CONTEXT_TOKENS) {
      break;
    }

    chunks.push({
      filePath: metadata.filePath,
      name: metadata.name,
      chunkType: metadata.chunkType,
      content: chunkContent,
      startLine: metadata.startLine,
      endLine: metadata.endLine,
      score,
    });

    totalTokens += chunkTokens;
  }

  // コンテキストテキストを生成
  const text = formatContextText(chunks);

  return {
    text,
    chunks,
    totalTokens,
  };
}

/**
 * チャンクをコンテキストテキストにフォーマット
 */
function formatContextText(chunks: ContextChunk[]): string {
  if (chunks.length === 0) return "";

  const sections = chunks.map((chunk, index) => {
    return `### Related Code ${index + 1}: ${chunk.name} (${chunk.chunkType})
**File:** \`${chunk.filePath}\` (lines ${chunk.startLine}-${chunk.endLine})
**Relevance:** ${(chunk.score * 100).toFixed(0)}%

\`\`\`
${chunk.content}
\`\`\``;
  });

  return sections.join("\n\n---\n\n");
}

/**
 * Diffに基づいてRAGコンテキストを取得
 */
export async function getRAGContextForDiff(
  owner: string,
  repo: string,
  installationId: number,
  files: ParsedFile[],
  searchResults: SearchResult[]
): Promise<BuiltContext | null> {
  if (searchResults.length === 0) {
    return null;
  }

  // 必要なファイル内容を取得
  const uniqueFilePaths = [...new Set(searchResults.map((r) => r.metadata.filePath))];
  const fileContents = new Map<string, string>();

  for (const filePath of uniqueFilePaths) {
    try {
      const content = await getFileContent(
        installationId,
        owner,
        repo,
        filePath,
        "HEAD"
      );
      if (content) {
        fileContents.set(filePath, content);
      }
    } catch (error) {
      console.warn(`[RAG] Failed to fetch file content: ${filePath}`, error);
    }
  }

  return buildContextFromSearchResults(searchResults, fileContents);
}

/**
 * 簡易的なRAGコンテキスト取得（ファイル内容なしで検索結果のメタデータのみ使用）
 */
export function buildSimpleContext(results: SearchResult[]): string {
  if (results.length === 0) return "";

  const lines = [
    "## Related Code Context",
    "",
    "The following code sections may be relevant to this change:",
    "",
  ];

  for (const result of results.slice(0, 10)) {
    const { metadata, score } = result;
    lines.push(
      `- **${metadata.name}** (${metadata.chunkType}) in \`${metadata.filePath}\` (lines ${metadata.startLine}-${metadata.endLine}) - ${(score * 100).toFixed(0)}% relevance`
    );
    if (metadata.signature) {
      lines.push(`  Signature: \`${metadata.signature}\``);
    }
  }

  return lines.join("\n");
}

// ========================================
// Enhanced Context with Learning Rules
// ========================================

/**
 * 拡張コンテキストの構築
 * コードコンテキストとルールコンテキストを統合
 */
export function buildEnhancedContext(params: {
  codeContext?: string;
  rulesContext?: string;
  specsContext?: string;
}): string {
  const sections: string[] = [];

  // ルールコンテキストを最初に配置（重要度が高い）
  if (params.rulesContext && params.rulesContext.trim()) {
    sections.push(params.rulesContext);
  }

  // 仕様書コンテキスト
  if (params.specsContext && params.specsContext.trim()) {
    sections.push(params.specsContext);
  }

  // コードコンテキスト
  if (params.codeContext && params.codeContext.trim()) {
    sections.push(params.codeContext);
  }

  if (sections.length === 0) {
    return "";
  }

  return sections.join("\n\n---\n\n");
}
