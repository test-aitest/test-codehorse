/**
 * LeetCode Complexity Analyzer
 * AIを使用してコードの計算量を分析する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { ComplexityAnalysis, SupportedLanguage } from "./types";

/**
 * 計算量分析のシステムプロンプト
 */
const COMPLEXITY_SYSTEM_PROMPT = `あなたはアルゴリズム分析の専門家です。
与えられたコードの時間計算量と空間計算量を分析してください。

分析の際は以下の点に注意してください：
- ループのネスト構造
- 再帰呼び出しのパターン
- データ構造の操作（配列アクセス、ハッシュマップ操作など）
- 組み込み関数の計算量
- 最悪ケースの計算量を報告

回答は必ず以下のJSON形式で出力してください：
{
  "timeComplexity": "O(n)",
  "spaceComplexity": "O(1)",
  "explanation": "計算量の説明"
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
      explanation: "計算量の分析中にエラーが発生しました。",
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
  let prompt = `以下の${getLanguageName(language)}コードの計算量を分析してください。\n\n`;

  if (problemContext) {
    prompt += `## 問題の背景\n${problemContext}\n\n`;
  }

  prompt += `## コード\n\`\`\`${language}\n${code}\n\`\`\``;

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
 * 計算量をフォーマット
 */
export function formatComplexitySummary(analysis: ComplexityAnalysis): string {
  return `**計算量分析**
- 時間計算量: ${analysis.timeComplexity}
- 空間計算量: ${analysis.spaceComplexity}

${analysis.explanation}`;
}
