/**
 * LeetCode Qualitative Review
 * AIを使用してコードの定性評価を行う
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { QualitativeReview, AlgorithmSuggestion, SupportedLanguage } from "./types";

/**
 * Qualitative review system prompt
 */
const QUALITATIVE_SYSTEM_PROMPT = `You are an expert code reviewer.
Evaluate the quality of the given LeetCode solution.

Evaluation criteria:
1. Code Cleanness (codeCleanness): naming conventions, formatting, structure
2. Readability (readability): ease of understanding, appropriate comments
3. Efficiency (efficiency): algorithm efficiency, absence of unnecessary computation
4. Overall Score (overallScore): overall evaluation

Also provide:
- Suggestions (suggestions): specific improvement points
- Alternative Algorithms (alternativeAlgorithms): more efficient approaches

Always respond in English.

Always output in the following JSON format:
{
  "codeCleanness": 8,
  "readability": 7,
  "efficiency": 6,
  "overallScore": 7,
  "suggestions": ["Suggestion 1", "Suggestion 2"],
  "alternativeAlgorithms": [
    {
      "name": "Algorithm name",
      "description": "Description",
      "expectedTimeComplexity": "O(n)",
      "expectedSpaceComplexity": "O(1)",
      "applicability": "Applicable conditions"
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
      suggestions: ["An error occurred during evaluation."],
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
  let prompt = `Please evaluate the following ${getLanguageName(language)} code.\n\n`;

  if (problemDescription) {
    prompt += `## Problem Description\n${problemDescription}\n\n`;
  }

  if (benchmarkResult) {
    prompt += `## Benchmark Results\n`;
    prompt += `- Average Execution Time: ${benchmarkResult.averageTimeMs.toFixed(2)}ms\n`;
    prompt += `- Test Results: ${benchmarkResult.allCorrect ? "All Passed" : "Some Failed"}\n\n`;
  }

  prompt += `## Code\n\`\`\`${language}\n${code}\n\`\`\``;

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
    swift: "Swift",
  };
  return names[language];
}

/**
 * Format review results
 */
export function formatQualitativeReview(review: QualitativeReview): string {
  let output = `## Code Quality Evaluation\n\n`;

  output += `| Metric | Score |\n|------|-------|\n`;
  output += `| Code Cleanness | ${formatScore(review.codeCleanness)} |\n`;
  output += `| Readability | ${formatScore(review.readability)} |\n`;
  output += `| Efficiency | ${formatScore(review.efficiency)} |\n`;
  output += `| **Overall Score** | **${formatScore(review.overallScore)}** |\n\n`;

  if (review.suggestions.length > 0) {
    output += `### Improvement Suggestions\n`;
    review.suggestions.forEach((s, i) => {
      output += `${i + 1}. ${s}\n`;
    });
    output += "\n";
  }

  if (review.alternativeAlgorithms.length > 0) {
    output += `### Alternative Algorithms\n`;
    review.alternativeAlgorithms.forEach((algo) => {
      output += `\n#### ${algo.name}\n`;
      output += `${algo.description}\n`;
      output += `- Time Complexity: ${algo.expectedTimeComplexity}\n`;
      output += `- Space Complexity: ${algo.expectedSpaceComplexity}\n`;
      if (algo.applicability) {
        output += `- Applicability: ${algo.applicability}\n`;
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
