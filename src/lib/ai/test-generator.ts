/**
 * Phase 4: AI Test Generator
 *
 * AIを使用してテストコードを生成
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { TestFramework } from "@prisma/client";
import type { FunctionInfo } from "@/lib/analysis/function-analyzer";
import type { EdgeCase, EdgeCaseAnalysis } from "@/lib/analysis/edge-case-detector";
import { generateVitestTemplate } from "./test-templates/vitest";
import { generateJestTemplate } from "./test-templates/jest";

// ========================================
// 型定義
// ========================================

export interface GeneratedTestResult {
  /** 関数名 */
  functionName: string;
  /** ファイルパス */
  filePath: string;
  /** 生成されたテストコード */
  testCode: string;
  /** テストフレームワーク */
  framework: TestFramework;
  /** 検出されたエッジケース */
  edgeCases: string[];
  /** 生成にかかった時間 (ms) */
  generationTimeMs: number;
  /** トークン使用量 */
  tokenCount?: number;
}

export interface TestGenerationOptions {
  /** テストフレームワーク */
  framework: TestFramework;
  /** AIを使用して高品質なテストを生成するか（false の場合はテンプレート生成） */
  useAI: boolean;
  /** モックを使用するか */
  useMocks: boolean;
  /** テストファイルのパス（指定しない場合は自動生成） */
  testFilePath?: string;
  /** 最大テスト数 */
  maxTests?: number;
}

// ========================================
// メイン関数
// ========================================

/**
 * 関数のテストを生成
 */
export async function generateTests(
  func: FunctionInfo,
  edgeCaseAnalysis: EdgeCaseAnalysis,
  options: TestGenerationOptions
): Promise<GeneratedTestResult> {
  const startTime = Date.now();

  // テストファイルパスを生成
  const testFilePath = options.testFilePath || generateTestFilePath(func.filePath, options.framework);
  const importPath = generateImportPath(testFilePath, func.filePath);

  let testCode: string;
  let tokenCount: number | undefined;

  if (options.useAI) {
    // AI生成
    const result = await generateTestWithAI(func, edgeCaseAnalysis, {
      ...options,
      testFilePath,
      importPath,
    });
    testCode = result.code;
    tokenCount = result.tokenCount;
  } else {
    // テンプレート生成
    testCode = generateTestFromTemplate(func, edgeCaseAnalysis.edgeCases, {
      ...options,
      testFilePath,
      importPath,
    });
  }

  return {
    functionName: func.name,
    filePath: func.filePath,
    testCode,
    framework: options.framework,
    edgeCases: edgeCaseAnalysis.edgeCases.map(c => c.description),
    generationTimeMs: Date.now() - startTime,
    tokenCount,
  };
}

/**
 * 複数の関数のテストを一括生成
 */
export async function generateTestsBatch(
  functions: Array<{ func: FunctionInfo; analysis: EdgeCaseAnalysis }>,
  options: TestGenerationOptions
): Promise<GeneratedTestResult[]> {
  const results: GeneratedTestResult[] = [];

  for (const { func, analysis } of functions) {
    try {
      const result = await generateTests(func, analysis, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to generate tests for ${func.name}:`, error);
    }
  }

  return results;
}

// ========================================
// AI生成
// ========================================

async function generateTestWithAI(
  func: FunctionInfo,
  edgeCaseAnalysis: EdgeCaseAnalysis,
  options: {
    framework: TestFramework;
    useMocks: boolean;
    testFilePath: string;
    importPath: string;
    maxTests?: number;
  }
): Promise<{ code: string; tokenCount: number }> {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  });

  const frameworkName = options.framework.toLowerCase();
  const maxTests = options.maxTests || edgeCaseAnalysis.recommendedTestCount;

  const prompt = buildAIPrompt(func, edgeCaseAnalysis, {
    frameworkName,
    useMocks: options.useMocks,
    importPath: options.importPath,
    maxTests,
  });

  const result = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: z.object({
      testCode: z.string().describe("生成されたテストコード（完全なファイル内容）"),
      explanation: z.string().describe("生成したテストの説明"),
    }),
    prompt,
  });

  return {
    code: result.object.testCode,
    tokenCount: result.usage?.totalTokens || 0,
  };
}

function buildAIPrompt(
  func: FunctionInfo,
  edgeCaseAnalysis: EdgeCaseAnalysis,
  options: {
    frameworkName: string;
    useMocks: boolean;
    importPath: string;
    maxTests: number;
  }
): string {
  const edgeCasesStr = edgeCaseAnalysis.edgeCases
    .filter(c => c.priority === "high" || c.priority === "medium")
    .map(c => `- ${c.description}${c.testInput ? ` (入力例: ${c.testInput})` : ""}`)
    .join("\n");

  return `
あなたは熟練したテストエンジニアです。以下の関数に対する ${options.frameworkName} テストを生成してください。

## 対象関数

\`\`\`typescript
${func.signature}

${func.body}
\`\`\`

## 関数情報

- 関数名: ${func.name}
- ファイルパス: ${func.filePath}
- 非同期: ${func.isAsync ? "はい" : "いいえ"}
- パラメータ: ${func.parameters.map(p => `${p.name}: ${p.type}${p.isOptional ? "?" : ""}`).join(", ") || "なし"}
- 戻り値: ${func.returnType}
- 依存: ${func.dependencies.slice(0, 10).join(", ") || "なし"}
- 使用API: ${func.usedAPIs.join(", ") || "なし"}

## 検出されたエッジケース

${edgeCasesStr}

## 要件

1. ${options.frameworkName} を使用してテストを作成
2. インポートパス: "${options.importPath}"
3. モック使用: ${options.useMocks ? "はい（必要に応じて）" : "いいえ"}
4. 最大テスト数: ${options.maxTests}
5. 日本語のテスト説明を使用
6. 以下のセクションを含める:
   - 正常系テスト
   - エッジケーステスト（高優先度）
   - エラーハンドリングテスト（該当する場合）

## 出力形式

完全なテストファイルの内容を出力してください。コメントやTODOマーカーは最小限にし、実際に動作するテストコードを生成してください。
`;
}

// ========================================
// テンプレート生成
// ========================================

function generateTestFromTemplate(
  func: FunctionInfo,
  edgeCases: EdgeCase[],
  options: {
    framework: TestFramework;
    useMocks: boolean;
    testFilePath: string;
    importPath: string;
  }
): string {
  const templateOptions = {
    testFilePath: options.testFilePath,
    importPath: options.importPath,
    useMocks: options.useMocks,
    useTypeScript: true,
  };

  switch (options.framework) {
    case "VITEST":
      return generateVitestTemplate(func, edgeCases, templateOptions);
    case "JEST":
      return generateJestTemplate(func, edgeCases, templateOptions);
    case "MOCHA":
      // Mochaテンプレートは未実装、Jestフォールバック
      return generateJestTemplate(func, edgeCases, templateOptions);
    case "PYTEST":
      // Pytestはサポート外（TypeScript/JavaScript専用）
      return "# pytest is not supported for TypeScript/JavaScript";
    default:
      return generateVitestTemplate(func, edgeCases, templateOptions);
  }
}

// ========================================
// ユーティリティ
// ========================================

/**
 * テストファイルパスを生成
 */
function generateTestFilePath(
  sourcePath: string,
  framework: TestFramework
): string {
  // 拡張子を取得
  const ext = sourcePath.match(/\.[^.]+$/)?.[0] || ".ts";

  // ファイル名を取得
  const baseName = sourcePath.replace(/\.[^.]+$/, "");

  // フレームワークに応じたサフィックス
  const suffix = framework === "VITEST" ? ".test" : ".spec";

  return `${baseName}${suffix}${ext}`;
}

/**
 * インポートパスを生成
 */
function generateImportPath(testPath: string, sourcePath: string): string {
  // 簡易的な相対パス計算
  // 同じディレクトリにある場合
  const testDir = testPath.replace(/\/[^/]+$/, "");
  const sourceDir = sourcePath.replace(/\/[^/]+$/, "");

  if (testDir === sourceDir) {
    const sourceFile = sourcePath.split("/").pop()?.replace(/\.[^.]+$/, "");
    return `./${sourceFile}`;
  }

  // より複雑なケースは省略して相対パスを返す
  return sourcePath.replace(/\.[^.]+$/, "");
}

/**
 * テスト結果をMarkdown形式で出力
 */
export function formatTestResultMarkdown(result: GeneratedTestResult): string {
  const lines: string[] = [];

  lines.push(`### 生成されたテスト: \`${result.functionName}\``);
  lines.push("");
  lines.push(`- **ファイル**: ${result.filePath}`);
  lines.push(`- **フレームワーク**: ${result.framework}`);
  lines.push(`- **生成時間**: ${result.generationTimeMs}ms`);
  if (result.tokenCount) {
    lines.push(`- **トークン使用量**: ${result.tokenCount}`);
  }
  lines.push("");

  if (result.edgeCases.length > 0) {
    lines.push("**カバーされるエッジケース:**");
    for (const edgeCase of result.edgeCases.slice(0, 5)) {
      lines.push(`- ${edgeCase}`);
    }
    if (result.edgeCases.length > 5) {
      lines.push(`- ... 他 ${result.edgeCases.length - 5} 件`);
    }
    lines.push("");
  }

  lines.push("```typescript");
  lines.push(result.testCode);
  lines.push("```");

  return lines.join("\n");
}

/**
 * 複数のテスト結果をサマリー形式で出力
 */
export function formatTestSummaryMarkdown(results: GeneratedTestResult[]): string {
  const lines: string[] = [];

  lines.push("## 生成されたテストサマリー");
  lines.push("");

  const totalEdgeCases = results.reduce((sum, r) => sum + r.edgeCases.length, 0);
  const totalTime = results.reduce((sum, r) => sum + r.generationTimeMs, 0);

  lines.push(`- **関数数**: ${results.length}`);
  lines.push(`- **カバーされるエッジケース**: ${totalEdgeCases}`);
  lines.push(`- **総生成時間**: ${totalTime}ms`);
  lines.push("");

  lines.push("### 生成されたテスト一覧");
  lines.push("");
  lines.push("| 関数名 | フレームワーク | エッジケース数 |");
  lines.push("|--------|----------------|----------------|");

  for (const result of results) {
    lines.push(`| \`${result.functionName}\` | ${result.framework} | ${result.edgeCases.length} |`);
  }

  return lines.join("\n");
}

/**
 * テストフレームワークを検出
 */
export function detectTestFramework(packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): TestFramework {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (deps.vitest) return "VITEST";
  if (deps.jest) return "JEST";
  if (deps.mocha) return "MOCHA";
  if (deps.pytest) return "PYTEST";

  // デフォルトはVitest
  return "VITEST";
}
