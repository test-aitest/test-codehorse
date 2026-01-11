/**
 * LeetCode Qualitative Review
 * AIを使用してコードの定性評価を行う
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { QualitativeReview, AlgorithmSuggestion, SupportedLanguage } from "./types";

/**
 * 定性評価のシステムプロンプト
 */
const QUALITATIVE_SYSTEM_PROMPT = `あなたはコードレビューの専門家です。
与えられたLeetCodeソリューションの品質を評価してください。

評価基準：
1. コードの清潔さ (codeCleanness): 命名規則、フォーマット、構造
2. 可読性 (readability): 理解しやすさ、コメントの適切さ
3. 効率性 (efficiency): アルゴリズムの効率、無駄な計算の有無
4. 全体スコア (overallScore): 総合評価

また、以下も提供してください：
- 改善提案 (suggestions): 具体的な改善点
- 代替アルゴリズム (alternativeAlgorithms): より効率的なアプローチ

回答は必ず以下のJSON形式で出力してください：
{
  "codeCleanness": 8,
  "readability": 7,
  "efficiency": 6,
  "overallScore": 7,
  "suggestions": ["提案1", "提案2"],
  "alternativeAlgorithms": [
    {
      "name": "アルゴリズム名",
      "description": "説明",
      "expectedTimeComplexity": "O(n)",
      "expectedSpaceComplexity": "O(1)",
      "applicability": "適用可能な条件"
    }
  ]
}`;

/**
 * 定性評価を実行
 */
export async function generateQualitativeReview(
  code: string,
  language: SupportedLanguage,
  problemDescription?: string,
  userBenchmarkResult?: { averageTimeMs: number; allCorrect: boolean }
): Promise<QualitativeReview> {
  const prompt = buildQualitativePrompt(code, language, problemDescription, userBenchmarkResult);

  try {
    const { text } = await generateText({
      model: geminiFlash,
      system: QUALITATIVE_SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
    });

    return parseQualitativeResponse(text);
  } catch (error) {
    console.error("[QualitativeReview] Error generating review:", error);
    return {
      codeCleanness: 5,
      readability: 5,
      efficiency: 5,
      overallScore: 5,
      suggestions: ["評価中にエラーが発生しました。"],
      alternativeAlgorithms: [],
    };
  }
}

/**
 * プロンプトを構築
 */
function buildQualitativePrompt(
  code: string,
  language: SupportedLanguage,
  problemDescription?: string,
  benchmarkResult?: { averageTimeMs: number; allCorrect: boolean }
): string {
  let prompt = `以下の${getLanguageName(language)}コードを評価してください。\n\n`;

  if (problemDescription) {
    prompt += `## 問題の説明\n${problemDescription}\n\n`;
  }

  if (benchmarkResult) {
    prompt += `## ベンチマーク結果\n`;
    prompt += `- 平均実行時間: ${benchmarkResult.averageTimeMs.toFixed(2)}ms\n`;
    prompt += `- テスト結果: ${benchmarkResult.allCorrect ? "全て正解" : "一部失敗"}\n\n`;
  }

  prompt += `## コード\n\`\`\`${language}\n${code}\n\`\`\``;

  return prompt;
}

/**
 * AIレスポンスをパース
 */
function parseQualitativeResponse(text: string): QualitativeReview {
  try {
    // JSONを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("JSON not found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      codeCleanness: clampScore(parsed.codeCleanness),
      readability: clampScore(parsed.readability),
      efficiency: clampScore(parsed.efficiency),
      overallScore: clampScore(parsed.overallScore),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      alternativeAlgorithms: parseAlgorithmSuggestions(parsed.alternativeAlgorithms),
    };
  } catch {
    return extractReviewFromText(text);
  }
}

/**
 * スコアを1-10の範囲に制限
 */
function clampScore(value: unknown): number {
  if (typeof value !== "number") return 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

/**
 * アルゴリズム提案をパース
 */
function parseAlgorithmSuggestions(data: unknown): AlgorithmSuggestion[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => ({
      name: String(item.name || ""),
      description: String(item.description || ""),
      expectedTimeComplexity: String(item.expectedTimeComplexity || "Unknown"),
      expectedSpaceComplexity: String(item.expectedSpaceComplexity || "Unknown"),
      applicability: String(item.applicability || ""),
    }));
}

/**
 * テキストから評価を抽出（フォールバック）
 */
function extractReviewFromText(text: string): QualitativeReview {
  // 数値スコアを検索
  const scoreMatch = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? parseInt(match[1], 10) : 5;
  };

  return {
    codeCleanness: scoreMatch(/codeCleanness[：:]\s*(\d+)/i),
    readability: scoreMatch(/readability[：:]\s*(\d+)/i),
    efficiency: scoreMatch(/efficiency[：:]\s*(\d+)/i),
    overallScore: scoreMatch(/overallScore[：:]\s*(\d+)/i),
    suggestions: extractSuggestions(text),
    alternativeAlgorithms: [],
  };
}

/**
 * テキストから提案を抽出
 */
function extractSuggestions(text: string): string[] {
  const suggestions: string[] = [];

  // 箇条書きを検索
  const bulletMatches = text.match(/[-•]\s*(.+)/g);
  if (bulletMatches) {
    suggestions.push(...bulletMatches.slice(0, 5).map((s) => s.replace(/^[-•]\s*/, "")));
  }

  return suggestions;
}

/**
 * 言語名を取得
 */
function getLanguageName(language: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    java: "Java",
    go: "Go",
  };
  return names[language];
}

/**
 * 評価結果をフォーマット
 */
export function formatQualitativeReview(review: QualitativeReview): string {
  let output = `## コード品質評価\n\n`;

  output += `| 項目 | スコア |\n|------|-------|\n`;
  output += `| コードの清潔さ | ${formatScore(review.codeCleanness)} |\n`;
  output += `| 可読性 | ${formatScore(review.readability)} |\n`;
  output += `| 効率性 | ${formatScore(review.efficiency)} |\n`;
  output += `| **総合スコア** | **${formatScore(review.overallScore)}** |\n\n`;

  if (review.suggestions.length > 0) {
    output += `### 改善提案\n`;
    review.suggestions.forEach((s, i) => {
      output += `${i + 1}. ${s}\n`;
    });
    output += "\n";
  }

  if (review.alternativeAlgorithms.length > 0) {
    output += `### 代替アルゴリズム\n`;
    review.alternativeAlgorithms.forEach((algo) => {
      output += `\n#### ${algo.name}\n`;
      output += `${algo.description}\n`;
      output += `- 時間計算量: ${algo.expectedTimeComplexity}\n`;
      output += `- 空間計算量: ${algo.expectedSpaceComplexity}\n`;
      if (algo.applicability) {
        output += `- 適用条件: ${algo.applicability}\n`;
      }
    });
  }

  return output;
}

/**
 * スコアを星表示でフォーマット
 */
function formatScore(score: number): string {
  const filled = "★".repeat(Math.floor(score / 2));
  const empty = "☆".repeat(5 - Math.floor(score / 2));
  return `${filled}${empty} (${score}/10)`;
}
