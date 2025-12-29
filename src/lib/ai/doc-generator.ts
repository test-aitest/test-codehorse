/**
 * Phase 5: AI Documentation Generator
 *
 * AIを使用してドキュメントを自動生成
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { DocType } from "@prisma/client";
import type { DocumentationGap } from "./doc-analyzer";
import type { PublicAPI } from "@/lib/analysis/public-api-detector";

// ========================================
// 型定義
// ========================================

export interface GeneratedDocResult {
  /** ファイルパス */
  filePath: string;
  /** シンボル名 */
  symbolName: string;
  /** ドキュメントの種類 */
  docType: DocType;
  /** 生成されたドキュメント */
  generatedDoc: string;
  /** 生成にかかった時間 (ms) */
  generationTimeMs: number;
  /** トークン使用量 */
  tokenCount?: number;
}

export interface DocGenerationOptions {
  /** AIを使用するか（false の場合はテンプレート生成） */
  useAI: boolean;
  /** 言語（日本語/英語） */
  language?: "ja" | "en";
  /** ドキュメントスタイル */
  style?: "concise" | "detailed";
  /** 使用例を含めるか */
  includeExamples?: boolean;
}

// ========================================
// メイン関数
// ========================================

/**
 * ドキュメントギャップに対してドキュメントを生成
 */
export async function generateDocumentation(
  gap: DocumentationGap,
  api: PublicAPI | undefined,
  options: DocGenerationOptions
): Promise<GeneratedDocResult> {
  const startTime = Date.now();

  let generatedDoc: string;
  let tokenCount: number | undefined;

  if (options.useAI && api) {
    const result = await generateDocWithAI(gap, api, options);
    generatedDoc = result.doc;
    tokenCount = result.tokenCount;
  } else {
    generatedDoc = generateDocFromTemplate(gap, api, options);
  }

  return {
    filePath: gap.filePath,
    symbolName: gap.symbolName,
    docType: determineDocType(gap),
    generatedDoc,
    generationTimeMs: Date.now() - startTime,
    tokenCount,
  };
}

/**
 * 複数のドキュメントギャップに対して一括生成
 */
export async function generateDocumentationBatch(
  gaps: DocumentationGap[],
  apis: Map<string, PublicAPI>,
  options: DocGenerationOptions
): Promise<GeneratedDocResult[]> {
  const results: GeneratedDocResult[] = [];

  for (const gap of gaps) {
    const apiKey = `${gap.filePath}:${gap.symbolName}`;
    const api = apis.get(apiKey);

    try {
      const result = await generateDocumentation(gap, api, options);
      results.push(result);
    } catch (error) {
      console.error(`Failed to generate doc for ${gap.symbolName}:`, error);
    }
  }

  return results;
}

// ========================================
// AI生成
// ========================================

async function generateDocWithAI(
  gap: DocumentationGap,
  api: PublicAPI,
  options: DocGenerationOptions
): Promise<{ doc: string; tokenCount: number }> {
  const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  });

  const prompt = buildDocPrompt(gap, api, options);

  const result = await generateObject({
    model: google("gemini-2.0-flash"),
    schema: z.object({
      jsdoc: z.string().describe("生成されたJSDoc/TSDoc（/**から*/まで）"),
      explanation: z.string().describe("生成したドキュメントの説明"),
    }),
    prompt,
  });

  return {
    doc: result.object.jsdoc,
    tokenCount: result.usage?.totalTokens || 0,
  };
}

function buildDocPrompt(
  gap: DocumentationGap,
  api: PublicAPI,
  options: DocGenerationOptions
): string {
  const language = options.language === "en" ? "英語" : "日本語";
  const style = options.style === "detailed" ? "詳細" : "簡潔";

  let contextInfo = "";

  // 関数の場合
  if (api.symbolType === "FUNCTION" && api.signature) {
    contextInfo = `
## 関数シグネチャ
\`\`\`typescript
${api.signature}
\`\`\`

## パラメータ
${
  api.parameters
    ?.map(
      (p) => `- \`${p.name}\`: ${p.type}${p.isOptional ? " (オプション)" : ""}`
    )
    .join("\n") || "なし"
}

## 戻り値
\`${api.returnType || "void"}\`
`;
  }

  // クラス/インターフェースの場合
  if (
    (api.symbolType === "CLASS" || api.symbolType === "INTERFACE") &&
    api.members
  ) {
    contextInfo = `
## メンバー
${api.members.map((m) => `- \`${m.name}\` (${m.kind})`).join("\n")}
`;
  }

  const exampleInstruction = options.includeExamples
    ? "\n- @example セクションで実用的な使用例を1-2個含めてください"
    : "";

  return `
あなたは熟練したテクニカルライターです。以下のシンボルに対するJSDoc/TSDocを生成してください。

## 対象
- **シンボル名**: ${gap.symbolName}
- **種類**: ${api.symbolType}
- **ファイル**: ${gap.filePath}
- **行番号**: ${gap.lineNumber}

${contextInfo}

## 現在のドキュメント（ある場合）
${gap.currentDoc || "なし"}

## 要件

1. ${language}で${style}なドキュメントを作成
2. JSDoc/TSDoc形式で出力（/** から */ まで）
3. 説明文は1-3行で要点を押さえる
4. すべてのパラメータに @param タグを付ける
5. 戻り値がある場合は @returns タグを付ける${exampleInstruction}
6. 型情報は既にTypeScriptで定義されているため、@param {type} の型部分は省略可能

## 出力形式

完全なJSDoc/TSDocブロックを出力してください。
`;
}

// ========================================
// テンプレート生成
// ========================================

function generateDocFromTemplate(
  gap: DocumentationGap,
  api: PublicAPI | undefined,
  options: DocGenerationOptions
): string {
  const lang = options.language === "en" ? "en" : "ja";

  switch (gap.symbolType) {
    case "FUNCTION":
      return generateFunctionDocTemplate(gap, api, lang);
    case "CLASS":
      return generateClassDocTemplate(gap, api, lang);
    case "INTERFACE":
    case "TYPE":
      return generateTypeDocTemplate(gap, api, lang);
    default:
      return generateGenericDocTemplate(gap, lang);
  }
}

function generateFunctionDocTemplate(
  gap: DocumentationGap,
  api: PublicAPI | undefined,
  lang: "ja" | "en"
): string {
  const lines: string[] = ["/**"];

  // 説明
  const desc =
    lang === "ja"
      ? `${gap.symbolName} 関数の説明をここに記述`
      : `Description of ${gap.symbolName} function`;
  lines.push(` * ${desc}`);
  lines.push(" *");

  // パラメータ
  if (api?.parameters) {
    for (const param of api.parameters) {
      const paramDesc =
        lang === "ja" ? `${param.name} の説明` : `Description of ${param.name}`;
      const optional = param.isOptional ? " (optional)" : "";
      lines.push(` * @param ${param.name} - ${paramDesc}${optional}`);
    }
  }

  // 戻り値
  if (
    api?.returnType &&
    api.returnType !== "void" &&
    api.returnType !== "undefined"
  ) {
    const returnDesc =
      lang === "ja" ? "戻り値の説明" : "Description of return value";
    lines.push(` * @returns ${returnDesc}`);
  }

  // 使用例
  if (api?.parameters && api.parameters.length > 0) {
    lines.push(" *");
    lines.push(" * @example");
    lines.push(" * ```typescript");
    const exampleArgs = api.parameters
      .filter((p) => !p.isOptional)
      .map((p) => getExampleValue(p.type))
      .join(", ");
    lines.push(` * const result = ${gap.symbolName}(${exampleArgs});`);
    lines.push(" * ```");
  }

  lines.push(" */");

  return lines.join("\n");
}

function generateClassDocTemplate(
  gap: DocumentationGap,
  api: PublicAPI | undefined,
  lang: "ja" | "en"
): string {
  const lines: string[] = ["/**"];

  const desc =
    lang === "ja"
      ? `${gap.symbolName} クラスの説明をここに記述`
      : `Description of ${gap.symbolName} class`;
  lines.push(` * ${desc}`);
  lines.push(" *");

  // 使用例
  lines.push(" * @example");
  lines.push(" * ```typescript");
  lines.push(` * const instance = new ${gap.symbolName}();`);
  lines.push(" * ```");

  lines.push(" */");

  return lines.join("\n");
}

function generateTypeDocTemplate(
  gap: DocumentationGap,
  _api: PublicAPI | undefined,
  lang: "ja" | "en"
): string {
  const lines: string[] = ["/**"];

  const typeWord = gap.symbolType === "INTERFACE" ? "インターフェース" : "型";
  const typeWordEn = gap.symbolType === "INTERFACE" ? "interface" : "type";

  const desc =
    lang === "ja"
      ? `${gap.symbolName} ${typeWord}の説明をここに記述`
      : `Description of ${gap.symbolName} ${typeWordEn}`;
  lines.push(` * ${desc}`);

  lines.push(" */");

  return lines.join("\n");
}

function generateGenericDocTemplate(
  gap: DocumentationGap,
  lang: "ja" | "en"
): string {
  const desc =
    lang === "ja"
      ? `${gap.symbolName} の説明をここに記述`
      : `Description of ${gap.symbolName}`;

  return `/**\n * ${desc}\n */`;
}

function getExampleValue(type: string): string {
  const typeLower = type.toLowerCase();

  if (typeLower.includes("string")) return '"example"';
  if (typeLower.includes("number")) return "42";
  if (typeLower.includes("boolean")) return "true";
  if (typeLower.includes("[]") || typeLower.includes("array")) return "[]";
  if (typeLower.includes("object") || typeLower.includes("{")) return "{}";
  if (typeLower.includes("null")) return "null";
  if (typeLower.includes("undefined")) return "undefined";

  return "/* value */";
}

function determineDocType(gap: DocumentationGap): DocType {
  if (gap.gapType === "MISSING_README") {
    return "README";
  }
  if (gap.symbolType === "INTERFACE" || gap.symbolType === "TYPE") {
    return "TYPE_DOC";
  }
  if (gap.gapType === "MISSING_EXAMPLE") {
    return "EXAMPLE";
  }
  return "JSDOC";
}

// ========================================
// フォーマット関数
// ========================================

/**
 * 生成結果をMarkdown形式で出力
 */
export function formatGeneratedDocsMarkdown(
  results: GeneratedDocResult[]
): string {
  const lines: string[] = [];

  lines.push("## 📄 生成されたドキュメント");
  lines.push("");

  if (results.length === 0) {
    lines.push("ドキュメントは生成されませんでした。");
    return lines.join("\n");
  }

  lines.push(`${results.length} 件のドキュメントが生成されました。`);
  lines.push("");

  for (const result of results) {
    lines.push(`### \`${result.symbolName}\``);
    lines.push("");
    lines.push(`📍 ${result.filePath}`);
    lines.push("");
    lines.push("```typescript");
    lines.push(result.generatedDoc);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * PRコメント用の簡潔なフォーマット
 */
export function formatGeneratedDocsForPR(
  results: GeneratedDocResult[]
): string {
  if (results.length === 0) {
    return "";
  }

  const lines: string[] = [];

  lines.push("## 📄 ドキュメント提案");
  lines.push("");
  lines.push("以下のドキュメントを追加することを提案します：");
  lines.push("");

  lines.push("<details>");
  lines.push(
    "<summary>生成されたドキュメントを表示 (" +
      results.length +
      " 件)</summary>"
  );
  lines.push("");

  for (const result of results.slice(0, 10)) {
    lines.push(`### \`${result.symbolName}\``);
    lines.push("");
    lines.push("```typescript");
    lines.push(result.generatedDoc);
    lines.push("```");
    lines.push("");
  }

  if (results.length > 10) {
    lines.push(`... 他 ${results.length - 10} 件`);
  }

  lines.push("</details>");
  lines.push("");
  lines.push(
    "> 💡 これらのドキュメントは自動生成されたものです。プロジェクトに合わせて調整してください。"
  );

  return lines.join("\n");
}
