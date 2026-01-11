/**
 * LeetCode Failure Analyzer
 * AIを使用してテスト失敗の原因を分析する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { FailureAnalysis, SupportedLanguage } from "./types";

/**
 * Failure analysis system prompt
 */
const FAILURE_ANALYSIS_SYSTEM_PROMPT = `You are a debugging expert.
Analyze the test failure of the given LeetCode solution.

Analysis should include:
1. Root cause of the failure
2. Why the expected and actual outputs differ
3. Specific fix suggestions

Always output in the following JSON format:
{
  "analysis": "Detailed analysis of the failure",
  "rootCause": "Summary of the root cause",
  "suggestedFix": "Code or explanation for the fix"
}

Always respond in English.

When analyzing, pay attention to:
- Overlooked edge cases
- Off-by-one errors
- Type conversion issues
- Algorithm logic errors
- Data structure misuse`;

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
      analysis: "An error occurred during failure analysis.",
      rootCause: "Unable to analyze",
      suggestedFix: "Please review your code.",
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
  let prompt = `Please analyze the test failure of the following ${getLanguageName(language)} code.\n\n`;

  if (problemDescription) {
    prompt += `## Problem Description\n${problemDescription}\n\n`;
  }

  prompt += `## Code\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;

  prompt += `## Failed Test Cases\n`;
  failedTestCases.forEach((tc) => {
    prompt += `### Case ${tc.index + 1}\n`;
    prompt += `- **Input**: \`${tc.input}\`\n`;
    prompt += `- **Expected Output**: \`${tc.expected}\`\n`;
    prompt += `- **Actual Output**: \`${tc.actual}\`\n\n`;
  });

  prompt += `\nPlease analyze the above failures and provide root cause and fix suggestions.`;

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
    // Fallback: use raw text
    return {
      analysis: text.slice(0, 1000),
      rootCause: "See detailed analysis above",
      suggestedFix: "Please fix your code based on the analysis above",
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
 * Format failure analysis
 */
export function formatFailureAnalysis(analysis: FailureAnalysis): string {
  let output = `## Test Failure Analysis\n\n`;

  output += `### Failed Test Cases\n\n`;

  analysis.failedTestCases.forEach((tc) => {
    output += `#### Case ${tc.index + 1}\n`;
    output += `| Item | Value |\n|------|----|\n`;
    output += `| Input | \`${tc.input}\` |\n`;
    output += `| Expected | \`${tc.expected}\` |\n`;
    output += `| Actual | \`${tc.actual}\` |\n\n`;
  });

  output += `### Root Cause\n\n`;
  output += `${analysis.rootCause}\n\n`;

  output += `### Detailed Analysis\n\n`;
  output += `${analysis.analysis}\n\n`;

  output += `### Suggested Fix\n\n`;
  output += `${analysis.suggestedFix}\n`;

  return output;
}
