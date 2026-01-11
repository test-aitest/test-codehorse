/**
 * LeetCode Failure Analyzer
 * AIを使用してテスト失敗の原因を分析する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { FailureAnalysis, SupportedLanguage } from "./types";

/**
 * 失敗分析のシステムプロンプト
 */
const FAILURE_ANALYSIS_SYSTEM_PROMPT = `あなたはデバッグの専門家です。
与えられたLeetCodeソリューションのテスト失敗を分析してください。

分析に含めるべき内容：
1. 失敗の根本原因
2. なぜ期待値と実際の出力が異なるのか
3. 具体的な修正提案

回答は必ず以下のJSON形式で出力してください：
{
  "analysis": "失敗の詳細な分析",
  "rootCause": "根本原因の要約",
  "suggestedFix": "修正提案のコードまたは説明"
}

分析の際は以下の点に注意してください：
- エッジケースの見落とし
- オフバイワンエラー
- 型変換の問題
- アルゴリズムの論理エラー
- データ構造の誤用`;

/**
 * 失敗原因を分析
 */
export async function analyzeFailure(
  code: string,
  language: SupportedLanguage,
  failedTestCases: Array<{
    index: number;
    input: string;
    expected: string;
    actual: string;
  }>,
  problemDescription?: string
): Promise<FailureAnalysis> {
  const prompt = buildFailurePrompt(code, language, failedTestCases, problemDescription);

  try {
    const { text } = await generateText({
      model: geminiFlash,
      system: FAILURE_ANALYSIS_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2,
    });

    const parsed = parseFailureResponse(text);

    return {
      failedTestCases,
      analysis: parsed.analysis,
      rootCause: parsed.rootCause,
      suggestedFix: parsed.suggestedFix,
    };
  } catch (error) {
    console.error("[FailureAnalyzer] Error analyzing failure:", error);
    return {
      failedTestCases,
      analysis: "失敗分析中にエラーが発生しました。",
      rootCause: "分析不能",
      suggestedFix: "コードを確認してください。",
    };
  }
}

/**
 * プロンプトを構築
 */
function buildFailurePrompt(
  code: string,
  language: SupportedLanguage,
  failedTestCases: Array<{
    index: number;
    input: string;
    expected: string;
    actual: string;
  }>,
  problemDescription?: string
): string {
  let prompt = `以下の${getLanguageName(language)}コードのテスト失敗を分析してください。\n\n`;

  if (problemDescription) {
    prompt += `## 問題の説明\n${problemDescription}\n\n`;
  }

  prompt += `## コード\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

  prompt += `## 失敗したテストケース\n`;
  failedTestCases.forEach((tc) => {
    prompt += `### ケース ${tc.index + 1}\n`;
    prompt += `- **入力**: \`${tc.input}\`\n`;
    prompt += `- **期待出力**: \`${tc.expected}\`\n`;
    prompt += `- **実際の出力**: \`${tc.actual}\`\n\n`;
  });

  prompt += `\n上記の失敗を分析し、根本原因と修正提案を提供してください。`;

  return prompt;
}

/**
 * AIレスポンスをパース
 */
function parseFailureResponse(text: string): {
  analysis: string;
  rootCause: string;
  suggestedFix: string;
} {
  try {
    // JSONを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/\{[\s\S]*"analysis"[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("JSON not found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    return {
      analysis: String(parsed.analysis || ""),
      rootCause: String(parsed.rootCause || ""),
      suggestedFix: String(parsed.suggestedFix || ""),
    };
  } catch {
    // フォールバック：テキストをそのまま使用
    return {
      analysis: text.slice(0, 1000),
      rootCause: "詳細は上記分析を参照",
      suggestedFix: "上記分析に基づいてコードを修正してください",
    };
  }
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
 * 失敗分析をフォーマット
 */
export function formatFailureAnalysis(analysis: FailureAnalysis): string {
  let output = `## テスト失敗分析\n\n`;

  output += `### 失敗したテストケース\n\n`;

  analysis.failedTestCases.forEach((tc) => {
    output += `#### ケース ${tc.index + 1}\n`;
    output += `| 項目 | 値 |\n|------|----|\n`;
    output += `| 入力 | \`${tc.input}\` |\n`;
    output += `| 期待出力 | \`${tc.expected}\` |\n`;
    output += `| 実際の出力 | \`${tc.actual}\` |\n\n`;
  });

  output += `### 根本原因\n\n`;
  output += `${analysis.rootCause}\n\n`;

  output += `### 詳細分析\n\n`;
  output += `${analysis.analysis}\n\n`;

  output += `### 修正提案\n\n`;
  output += `${analysis.suggestedFix}\n`;

  return output;
}
