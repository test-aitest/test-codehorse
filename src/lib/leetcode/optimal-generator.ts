/**
 * LeetCode Optimal Solution Generator
 * AIを使用して最適解を生成する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { OptimalSolution, SupportedLanguage, TestCase } from "./types";

/**
 * Optimal solution generation system prompt
 */
const OPTIMAL_GENERATOR_SYSTEM_PROMPT = `You are an algorithm expert.
Generate multiple optimal solutions for the given LeetCode problem.

Each solution should include:
1. Algorithm name (e.g., Two Pointer, Binary Search, Dynamic Programming)
2. Complete implementation code
3. Expected time complexity
4. Expected space complexity
5. Explanation of why this approach is effective

Always output in the following JSON format:
{
  "solutions": [
    {
      "algorithmName": "Algorithm name",
      "code": "Complete code",
      "expectedTimeComplexity": "O(n)",
      "expectedSpaceComplexity": "O(1)",
      "explanation": "Explanation"
    }
  ]
}

Always respond in English.

Important notes:
- Write code in the given language
- Code should be complete and executable as-is
- Use LeetCode's Solution class format
- Handle edge cases appropriately`;

/**
 * 最適解を生成
 */
export async function generateOptimalSolutions(
  problemUrl: string,
  problemDescription: string,
  userCode: string,
  language: SupportedLanguage,
  testCases: TestCase[],
  count: number = 10
): Promise<OptimalSolution[]> {
  const prompt = buildOptimalPrompt(
    problemUrl,
    problemDescription,
    userCode,
    language,
    testCases,
    count
  );

  try {
    const { text } = await generateText({
      model: geminiFlash,
      system: OPTIMAL_GENERATOR_SYSTEM_PROMPT,
      prompt,
      temperature: 0.7,
    });

    const solutions = parseOptimalResponse(text);

    // インデックスを付与
    return solutions.slice(0, count).map((sol, index) => ({
      ...sol,
      index,
    }));
  } catch (error) {
    console.error("[OptimalGenerator] Error generating solutions:", error);
    return [];
  }
}

/**
 * プロンプトを構築
 */
function buildOptimalPrompt(
  problemUrl: string,
  problemDescription: string,
  userCode: string,
  language: SupportedLanguage,
  testCases: TestCase[],
  count: number
): string {
  let prompt = `Generate ${count} optimal solutions in ${getLanguageName(language)} for the following LeetCode problem.\n\n`;

  prompt += `## Problem URL\n${problemUrl}\n\n`;

  if (problemDescription) {
    prompt += `## Problem Description\n${problemDescription}\n\n`;
  }

  prompt += `## User's Current Solution\n\`\`\`${language}\n${userCode}\n\`\`\`\n\n`;

  if (testCases.length > 0) {
    prompt += `## Test Cases\n`;
    testCases.forEach((tc, i) => {
      prompt += `### Case ${i + 1}\n`;
      prompt += `- Input: ${tc.input}\n`;
      prompt += `- Expected Output: ${tc.expectedOutput}\n`;
    });
    prompt += "\n";
  }

  prompt += `## Requirements\n`;
  prompt += `- Propose ${count} different approaches\n`;
  prompt += `- Each solution should include complete working code\n`;
  prompt += `- Prioritize the most efficient algorithms\n`;
  prompt += `- Include diverse approaches (e.g., brute force, optimized version, using different data structures)\n`;

  return prompt;
}

/**
 * AIレスポンスをパース
 */
function parseOptimalResponse(text: string): Omit<OptimalSolution, "index">[] {
  try {
    // JSONを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                      text.match(/\{[\s\S]*"solutions"[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("JSON not found in response");
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed.solutions)) {
      throw new Error("solutions array not found");
    }

    return parsed.solutions.map((sol: unknown) => parseSolution(sol));
  } catch {
    // フォールバック：コードブロックを個別に抽出
    return extractSolutionsFromText(text);
  }
}

/**
 * 単一の解法をパース
 */
function parseSolution(data: unknown): Omit<OptimalSolution, "index"> {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid solution data");
  }

  const sol = data as Record<string, unknown>;

  return {
    algorithmName: String(sol.algorithmName || "Unknown Algorithm"),
    code: extractCode(sol.code),
    expectedTimeComplexity: String(sol.expectedTimeComplexity || "Unknown"),
    expectedSpaceComplexity: String(sol.expectedSpaceComplexity || "Unknown"),
    explanation: String(sol.explanation || ""),
  };
}

/**
 * コードを抽出（エスケープを解除）
 */
function extractCode(code: unknown): string {
  if (typeof code !== "string") return "";

  // JSONエスケープを解除
  return code
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * テキストから解法を抽出（フォールバック）
 */
function extractSolutionsFromText(text: string): Omit<OptimalSolution, "index">[] {
  const solutions: Omit<OptimalSolution, "index">[] = [];

  // コードブロックを検索
  const codeBlockRegex = /```(?:python|javascript|typescript|java|go)?\s*([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const code = match[1].trim();
    if (code.length > 50) {
      // 周辺のテキストからアルゴリズム名を推測
      const contextStart = Math.max(0, match.index - 200);
      const context = text.slice(contextStart, match.index);

      const algorithmMatch = context.match(
        /(Two Pointer|Binary Search|Dynamic Programming|DFS|BFS|Greedy|Hash Map|Sliding Window|Stack|Queue|Heap|Backtracking|Divide and Conquer)/i
      );

      solutions.push({
        algorithmName: algorithmMatch ? algorithmMatch[1] : `Solution ${solutions.length + 1}`,
        code,
        expectedTimeComplexity: "Unknown",
        expectedSpaceComplexity: "Unknown",
        explanation: "",
      });
    }
  }

  return solutions;
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
 * Format multiple optimal solutions
 */
export function formatOptimalSolutions(
  solutions: OptimalSolution[],
  bestIndex?: number
): string {
  if (solutions.length === 0) {
    return "Failed to generate optimal solutions.";
  }

  let output = "## Optimal Solution Candidates\n\n";

  solutions.forEach((sol, i) => {
    const isBest = bestIndex === sol.index;
    const badge = isBest ? " 🏆 **Best**" : "";

    output += `### ${i + 1}. ${sol.algorithmName}${badge}\n\n`;
    output += `- Time Complexity: ${sol.expectedTimeComplexity}\n`;
    output += `- Space Complexity: ${sol.expectedSpaceComplexity}\n\n`;
    output += `${sol.explanation}\n\n`;

    if (isBest) {
      output += `\`\`\`\n${sol.code}\n\`\`\`\n\n`;
    }
  });

  return output;
}
