// ルール抽出エンジン
// フィードバックからコーディングルールを抽出するGemini連携

import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type {
  FeedbackContext,
  RuleExtractionResult,
  ExtractedRule,
} from "./types";
import type { RuleType } from "@prisma/client";

// ルール抽出の出力スキーマ
const ExtractedRulesSchema = z.object({
  rules: z.array(
    z.object({
      ruleText: z.string().describe("明確で実行可能なコーディングルール"),
      ruleType: z
        .enum([
          "STYLE",
          "PATTERN",
          "NAMING",
          "ARCHITECTURE",
          "SECURITY",
          "PERFORMANCE",
          "TESTING",
          "OTHER",
        ])
        .describe("ルールの種類"),
      confidence: z.number().min(0).max(1).describe("ルールの信頼度 (0.0-1.0)"),
      language: z
        .string()
        .optional()
        .describe("適用対象の言語 (typescript, python, etc.)"),
      category: z
        .string()
        .optional()
        .describe("カテゴリ (security, performance, style)"),
      reasoning: z.string().describe("このルールが推論された理由"),
    })
  ),
  noRuleExtracted: z
    .boolean()
    .describe("意味のあるルールが抽出できなかった場合true"),
  skipReason: z.string().optional().describe("ルールが抽出できなかった理由"),
});

/**
 * フィードバックからルールを抽出
 */
export async function extractRulesFromFeedback(
  context: FeedbackContext
): Promise<RuleExtractionResult> {
  const prompt = buildExtractionPrompt(context);

  try {
    const result = await generateText({
      model: google("gemini-2.0-flash-exp"),
      prompt,
      temperature: 0.3, // 低温度で一貫性を重視
      experimental_output: Output.object({
        schema: ExtractedRulesSchema,
      }),
    });

    const output = result.experimental_output;
    if (!output) {
      return {
        rules: [],
        skipped: true,
        skipReason: "No output generated",
      };
    }

    const extractedRules: ExtractedRule[] = output.rules.map((rule) => ({
      ruleText: rule.ruleText,
      ruleType: rule.ruleType as RuleType,
      confidence: rule.confidence,
      language: rule.language,
      category: rule.category,
      reasoning: rule.reasoning,
    }));

    return {
      rules: extractedRules,
      skipped: output.noRuleExtracted,
      skipReason: output.skipReason,
    };
  } catch (error) {
    console.error("[RuleExtractor] Failed to extract rules:", error);
    return {
      rules: [],
      skipped: true,
      skipReason: `Extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

/**
 * 明示的なルールコマンドからルールを抽出
 * より高い信頼度で抽出
 */
export async function extractExplicitRule(
  ruleText: string,
  ruleType: string,
  language?: string
): Promise<ExtractedRule | null> {
  // 明示的なルールは高信頼度で直接作成
  const normalizedType = normalizeRuleType(ruleType);

  return {
    ruleText: ruleText.trim(),
    ruleType: normalizedType,
    confidence: 0.95, // 明示的なルールは高信頼度
    language,
    category: inferCategory(ruleText),
    reasoning: "ユーザーが明示的に指定したルール",
  };
}

/**
 * 抽出プロンプトを構築
 */
function buildExtractionPrompt(context: FeedbackContext): string {
  const sections: string[] = [
    `あなたはコーディング規約のアナリストです。AIの提案とユーザーの実装の差分を分析し、コーディングの好みやルールを抽出してください。`,
    "",
    "## AIの提案（拒否または修正されたもの）:",
    "```",
    context.aiSuggestion,
    "```",
    "",
  ];

  if (context.userCode) {
    sections.push(
      "## ユーザーの最終コード:",
      "```",
      context.userCode,
      "```",
      ""
    );
  } else {
    sections.push("## ユーザーの最終コード:", "（代替案なしで拒否）", "");
  }

  sections.push(
    `## ファイルパス: ${context.filePath}`,
    `## 言語: ${context.language}`
  );

  if (context.userExplanation) {
    sections.push(`## ユーザーの説明: ${context.userExplanation}`);
  }

  sections.push(
    "",
    "## タスク:",
    "1. ユーザーがAIの提案より何を好んだかを特定してください",
    "2. 一般化可能なコーディングルールを抽出してください（一回限りの好みではなく）",
    "3. 適切なルールタイプと信頼度を割り当ててください",
    "4. 意味のあるルールが抽出できない場合は、noRuleExtracted: true を設定してください",
    "",
    "## ガイドライン:",
    "- ルールは具体的で実行可能であるべきです",
    "- 信頼度: 明示的なフィードバックは0.9+、推論は0.6-0.8",
    "- プロジェクト固有すぎる、または些細なルールはスキップしてください",
    "- 将来のレビューに適用できるパターンに焦点を当ててください",
    "",
    "指定された形式でルールを出力してください。"
  );

  return sections.join("\n");
}

/**
 * ルールタイプを正規化
 */
function normalizeRuleType(type: string): RuleType {
  const typeMap: Record<string, RuleType> = {
    style: "STYLE",
    pattern: "PATTERN",
    naming: "NAMING",
    architecture: "ARCHITECTURE",
    security: "SECURITY",
    performance: "PERFORMANCE",
    testing: "TESTING",
    other: "OTHER",
  };

  return typeMap[type.toLowerCase()] || "OTHER";
}

/**
 * ルールテキストからカテゴリを推論
 */
function inferCategory(ruleText: string): string | undefined {
  const text = ruleText.toLowerCase();

  if (
    text.includes("security") ||
    text.includes("xss") ||
    text.includes("injection") ||
    text.includes("セキュリティ")
  ) {
    return "security";
  }

  if (
    text.includes("performance") ||
    text.includes("効率") ||
    text.includes("最適化") ||
    text.includes("パフォーマンス")
  ) {
    return "performance";
  }

  if (
    text.includes("style") ||
    text.includes("format") ||
    text.includes("スタイル") ||
    text.includes("フォーマット")
  ) {
    return "style";
  }

  if (
    text.includes("test") ||
    text.includes("テスト") ||
    text.includes("spec")
  ) {
    return "testing";
  }

  return undefined;
}

/**
 * ルールの重複チェック用の類似度計算
 * (簡易実装 - 本番ではEmbedding similarityを使用)
 */
export function calculateRuleSimilarity(rule1: string, rule2: string): number {
  const words1 = new Set(rule1.toLowerCase().split(/\s+/));
  const words2 = new Set(rule2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size; // Jaccard similarity
}
