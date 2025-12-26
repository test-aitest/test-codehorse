import type { ChunkingResult, IndexableFile } from "./types";
import { chunkTypeScriptFile } from "./ast-chunker";
import { chunkGenericFile } from "./generic-chunker";
import { detectLanguage } from "../diff/filter";

/**
 * ファイルを言語に応じたチャンカーで分割
 */
export function chunkFile(file: IndexableFile): ChunkingResult {
  const { path, content, language } = file;

  // 言語別のチャンカーを選択
  switch (language) {
    case "typescript":
    case "javascript":
      return chunkTypeScriptFile(path, content);

    case "python":
    case "go":
    case "rust":
    case "java":
    case "kotlin":
    case "swift":
    case "c":
    case "cpp":
    case "csharp":
    case "php":
    case "ruby":
      return chunkGenericFile(path, content, language);

    default:
      // サポートされていない言語はファイル全体を1チャンクに
      return {
        filePath: path,
        chunks: [
          {
            filePath: path,
            language,
            chunkType: "other",
            name: path.split("/").pop() || path,
            content,
            startLine: 1,
            endLine: content.split("\n").length,
          },
        ],
        totalLines: content.split("\n").length,
        totalChunks: 1,
      };
  }
}

/**
 * 複数ファイルをチャンク化
 */
export function chunkFiles(files: IndexableFile[]): ChunkingResult[] {
  return files.map(chunkFile);
}

/**
 * ファイルパスから IndexableFile を作成
 */
export function createIndexableFile(path: string, content: string): IndexableFile {
  return {
    path,
    content,
    language: detectLanguage(path),
  };
}
