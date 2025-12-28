// ルール検索
// 学習ルールをPineconeから検索してレビューに活用

import { prisma } from "@/lib/prisma";
import { queryRules } from "@/lib/pinecone/client";
import {
  generateEmbedding,
  formatRuleQueryForEmbedding,
} from "@/lib/pinecone/embeddings";
import { trackRuleUsage } from "@/lib/learning/rule-store";
import type { RetrievedRule } from "@/lib/learning/types";
import type { ParsedFile } from "@/lib/diff/types";

/**
 * ルール検索結果
 */
export interface RuleSearchResult {
  rules: RetrievedRule[];
  totalFound: number;
}

/**
 * PRの変更内容に関連するルールを検索
 */
export async function searchRelevantRules(params: {
  installationId: number;
  repositoryId?: string;
  files: ParsedFile[];
  topK?: number;
}): Promise<RuleSearchResult> {
  const { installationId, repositoryId, files, topK = 10 } = params;

  if (files.length === 0) {
    return { rules: [], totalFound: 0 };
  }

  // 変更ファイルからコンテキストを生成
  const codeContext = generateCodeContext(files);
  const primaryLanguage = detectPrimaryLanguage(files);

  // クエリを生成
  const queryText = formatRuleQueryForEmbedding({
    codeContext,
    language: primaryLanguage,
  });

  // Embeddingを生成
  const queryVector = await generateEmbedding(queryText);

  // Pineconeで検索
  const results = await queryRules(installationId, queryVector, {
    topK,
    language: primaryLanguage,
    repositoryId,
    minConfidence: 0.5,
  });

  if (results.length === 0) {
    return { rules: [], totalFound: 0 };
  }

  // DBからルールの詳細を取得
  const ruleIds = results.map((r) => r.metadata.ruleId);
  const dbRules = await prisma.learningRule.findMany({
    where: { id: { in: ruleIds } },
  });

  const ruleMap = new Map(dbRules.map((r) => [r.id, r]));

  // 検索結果とDB情報を結合
  const retrievedRules: RetrievedRule[] = results
    .filter((r) => ruleMap.has(r.metadata.ruleId))
    .map((r) => {
      const dbRule = ruleMap.get(r.metadata.ruleId)!;
      return {
        ruleId: dbRule.id,
        ruleText: dbRule.ruleText,
        ruleType: dbRule.ruleType,
        source: dbRule.source,
        confidence: dbRule.confidence,
        score: r.score,
      };
    })
    // 信頼度とスコアで並べ替え
    .sort((a, b) => {
      const scoreA = a.confidence * 0.6 + a.score * 0.4;
      const scoreB = b.confidence * 0.6 + b.score * 0.4;
      return scoreB - scoreA;
    });

  // ルール使用を追跡（非同期で実行、エラーは無視）
  if (retrievedRules.length > 0) {
    trackRuleUsage(retrievedRules.map((r) => r.ruleId)).catch((error) => {
      console.warn("[RulesSearch] Failed to track rule usage:", error);
    });
  }

  return {
    rules: retrievedRules,
    totalFound: retrievedRules.length,
  };
}

/**
 * 変更ファイルからコードコンテキストを生成
 */
function generateCodeContext(files: ParsedFile[]): string {
  const sections: string[] = [];

  // ファイルパスと変更の概要
  sections.push("変更されたファイル:");
  for (const file of files.slice(0, 10)) {
    // 最大10ファイル
    const changeType =
      file.type === "add"
        ? "新規追加"
        : file.type === "delete"
          ? "削除"
          : file.type === "rename"
            ? "リネーム"
            : "変更";
    sections.push(`- ${file.newPath} (${changeType})`);
  }

  // 変更内容のサンプル
  sections.push("\n変更内容の例:");
  for (const file of files.slice(0, 3)) {
    // 最初の3ファイルの変更を含める
    for (const hunk of file.hunks.slice(0, 2)) {
      // 最初の2ハンク
      const addedLines = hunk.changes
        .filter((c) => c.type === "insert")
        .map((c) => c.content)
        .slice(0, 5); // 最大5行

      if (addedLines.length > 0) {
        sections.push(`\nファイル: ${file.newPath}`);
        sections.push("```");
        sections.push(...addedLines);
        sections.push("```");
      }
    }
  }

  return sections.join("\n");
}

/**
 * 変更ファイルから主要な言語を検出
 */
function detectPrimaryLanguage(files: ParsedFile[]): string | undefined {
  const languageCounts: Record<string, number> = {};

  for (const file of files) {
    const ext = getFileExtension(file.newPath);
    const language = EXTENSION_TO_LANGUAGE[ext];

    if (language) {
      languageCounts[language] = (languageCounts[language] || 0) + 1;
    }
  }

  // 最も多い言語を返す
  let maxCount = 0;
  let primaryLanguage: string | undefined;

  for (const [language, count] of Object.entries(languageCounts)) {
    if (count > maxCount) {
      maxCount = count;
      primaryLanguage = language;
    }
  }

  return primaryLanguage;
}

/**
 * ファイルパスから拡張子を取得
 */
function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/**
 * 拡張子から言語へのマッピング
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
};

/**
 * ルールをコンテキスト文字列に変換
 */
export function buildRulesContext(rules: RetrievedRule[]): string {
  if (rules.length === 0) {
    return "";
  }

  const lines = [
    "## チームのコーディング規約と好み",
    "",
    "以下のルールをレビュー時に適用してください（関連性の高い順）:",
    "",
  ];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const confidencePercent = Math.round(rule.confidence * 100);
    const emphasis = rule.confidence >= 0.8 ? "**" : "";

    lines.push(
      `${i + 1}. ${emphasis}${rule.ruleText}${emphasis} (${rule.ruleType}, 信頼度${confidencePercent}%)`
    );
  }

  lines.push(
    "",
    "※ これらのルールは過去のフィードバックから学習されたものです。セキュリティや重大なバグを見逃すためにルールを無視しないでください。"
  );

  return lines.join("\n");
}
