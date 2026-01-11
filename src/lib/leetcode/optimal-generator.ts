/**
 * LeetCode Optimal Solution Generator
 * AIを使用して最適解を生成する
 */

import { generateText } from "ai";
import { geminiFlash } from "@/lib/ai/client";
import type { OptimalSolution, SupportedLanguage, TestCase } from "./types";

/**
 * 最適解生成のシステムプロンプト
 */
const OPTIMAL_GENERATOR_SYSTEM_PROMPT = `あなたはアルゴリズムの専門家です。
与えられたLeetCode問題に対して、複数の最適な解法を生成してください。

各解法は以下を含めてください：
1. アルゴリズム名（例：Two Pointer, Binary Search, Dynamic Programming）
2. 完全な実装コード
3. 予想される時間計算量
4. 予想される空間計算量
5. なぜこのアプローチが効果的かの説明

回答は必ず以下のJSON形式で出力してください：
{
  "solutions": [
    {
      "algorithmName": "アルゴリズム名",
      "code": "完全なコード",
      "expectedTimeComplexity": "O(n)",
      "expectedSpaceComplexity": "O(1)",
      "explanation": "説明"
    }
  ]
}

重要な注意点：
- コードは与えられた言語で書いてください
- コードはそのまま実行可能な完全なものにしてください
- LeetCodeのSolutionクラス形式を使用してください
- エッジケースを適切に処理してください`;

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
  let prompt = `以下のLeetCode問題に対して、${count}種類の最適な解法を${getLanguageName(language)}で生成してください。\n\n`;

  prompt += `## 問題URL\n${problemUrl}\n\n`;

  if (problemDescription) {
    prompt += `## 問題の説明\n${problemDescription}\n\n`;
  }

  prompt += `## ユーザーの現在の解法\n\`\`\`${language}\n${userCode}\n\`\`\`\n\n`;

  if (testCases.length > 0) {
    prompt += `## テストケース\n`;
    testCases.forEach((tc, i) => {
      prompt += `### ケース ${i + 1}\n`;
      prompt += `- 入力: ${tc.input}\n`;
      prompt += `- 期待出力: ${tc.expectedOutput}\n`;
    });
    prompt += "\n";
  }

  prompt += `## 要件\n`;
  prompt += `- ${count}種類の異なるアプローチを提案してください\n`;
  prompt += `- 各解法は完全に動作するコードを含めてください\n`;
  prompt += `- 可能な限り効率的なアルゴリズムを優先してください\n`;
  prompt += `- 多様なアプローチを含めてください（例：ブルートフォース、最適化版、異なるデータ構造を使用したもの）\n`;

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
 * 複数の最適解をフォーマット
 */
export function formatOptimalSolutions(
  solutions: OptimalSolution[],
  bestIndex?: number
): string {
  if (solutions.length === 0) {
    return "最適解の生成に失敗しました。";
  }

  let output = "## 最適解候補\n\n";

  solutions.forEach((sol, i) => {
    const isBest = bestIndex === sol.index;
    const badge = isBest ? " 🏆 **Best**" : "";

    output += `### ${i + 1}. ${sol.algorithmName}${badge}\n\n`;
    output += `- 時間計算量: ${sol.expectedTimeComplexity}\n`;
    output += `- 空間計算量: ${sol.expectedSpaceComplexity}\n\n`;
    output += `${sol.explanation}\n\n`;

    if (isBest) {
      output += `\`\`\`\n${sol.code}\n\`\`\`\n\n`;
    }
  });

  return output;
}
