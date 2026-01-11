/**
 * LeetCode Complexity Analyzer
 * AIを使用してコードの計算量を分析する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { ComplexityAnalysis, SupportedLanguage } from "./types";

/**
 * Complexity analysis system prompt
 */
const COMPLEXITY_SYSTEM_PROMPT = `You are an expert in algorithm analysis.
Analyze the time complexity and space complexity of the given code.

When analyzing, pay attention to the following:
- Loop nesting structure
- Recursion patterns
- Data structure operations (array access, hashmap operations, etc.)
- Built-in function complexity
- Report worst-case complexity

Always respond in English.

Always output in the following JSON format:
{
  "timeComplexity": "O(n)",
  "spaceComplexity": "O(1)",
  "explanation": "Explanation of the complexity in English"
}`;

/**
 * 計算量分析を実行
 */
export async function analyzeComplexity(
  code: string,
  language: SupportedLanguage,
  problemContext?: string
): Promise<ComplexityAnalysis> {
  const prompt = buildComplexityPrompt(code, language, problemContext);

  try {
    const { text } = await generateText({
      model: geminiFlash,
      system: COMPLEXITY_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
    });

    return parseComplexityResponse(text);
  } catch (error) {
    console.error("[ComplexityAnalyzer] Error analyzing complexity:", error);
    return {
      timeComplexity: "Unknown",
      spaceComplexity: "Unknown",
      explanation: "An error occurred during complexity analysis.",
    };
  }
}

/**
 * プロンプトを構築
 */
function buildComplexityPrompt(
  code: string,
  language: SupportedLanguage,
  problemContext?: string
): string {
  let prompt = `Please analyze the complexity of the following ${getLanguageName(language)} code.\n\n`;

  if (problemContext) {
    prompt += `## Problem Context\n${problemContext}\n\n`;
  }

  prompt += `## Code\n\`\`\`${language}\n${code}\n\`\`\``;

  return prompt;
}

/**
 * AIレスポンスをパース
 */
function parseComplexityResponse(text: string): ComplexityAnalysis {
  try {
    // JSONを抽出（マークダウンコードブロック内の場合を考慮）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("JSON not found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      timeComplexity: parsed.timeComplexity || "Unknown",
      spaceComplexity: parsed.spaceComplexity || "Unknown",
      explanation: parsed.explanation || "",
    };
  } catch {
    // パース失敗時はテキストから推測
    return extractComplexityFromText(text);
  }
}

/**
 * テキストから計算量を抽出（フォールバック）
 */
function extractComplexityFromText(text: string): ComplexityAnalysis {
  // O(...)パターンを検索
  const timeMatch = text.match(/時間計算量[：:]\s*(O\([^)]+\))/i) ||
                    text.match(/Time[：:]\s*(O\([^)]+\))/i) ||
                    text.match(/(O\(n\s*log\s*n\)|O\(n\^?2?\)|O\(n\)|O\(1\)|O\(2\^n\)|O\(n!\))/i);

  const spaceMatch = text.match(/空間計算量[：:]\s*(O\([^)]+\))/i) ||
                     text.match(/Space[：:]\s*(O\([^)]+\))/i);

  return {
    timeComplexity: timeMatch ? timeMatch[1] : "Unknown",
    spaceComplexity: spaceMatch ? spaceMatch[1] : "Unknown",
    explanation: text.slice(0, 500),
  };
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
 * 計算量の比較（より効率的な方が小さい値を返す）
 */
export function compareComplexity(a: string, b: string): number {
  const order = [
    "O(1)",
    "O(log n)",
    "O(sqrt(n))",
    "O(n)",
    "O(n log n)",
    "O(n^2)",
    "O(n^3)",
    "O(2^n)",
    "O(n!)",
  ];

  const normalize = (c: string) => c.toLowerCase().replace(/\s/g, "");
  const indexA = order.findIndex((x) => normalize(x) === normalize(a));
  const indexB = order.findIndex((x) => normalize(x) === normalize(b));

  // 見つからない場合は同等とみなす
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;

  return indexA - indexB;
}

/**
 * Format complexity summary
 */
export function formatComplexitySummary(analysis: ComplexityAnalysis): string {
  return `**Complexity Analysis**
- Time Complexity: ${analysis.timeComplexity}
- Space Complexity: ${analysis.spaceComplexity}

${analysis.explanation}`;
}
