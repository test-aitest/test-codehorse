/**
 * Phase 5: Documentation Generator Tests
 */

import { describe, it, expect } from "vitest";
import {
  generateDocumentation,
  formatGeneratedDocsMarkdown,
  formatGeneratedDocsForPR,
  type GeneratedDocResult,
} from "../doc-generator";
import type { DocumentationGap } from "../doc-analyzer";
import type { PublicAPI } from "@/lib/analysis/public-api-detector";

describe("generateDocumentation", () => {
  const createGap = (overrides: Partial<DocumentationGap> = {}): DocumentationGap => ({
    filePath: "src/api.ts",
    symbolName: "getUser",
    symbolType: "FUNCTION",
    gapType: "MISSING_JSDOC",
    severity: "HIGH",
    lineNumber: 10,
    description: "JSDocがありません",
    ...overrides,
  });

  const createAPI = (overrides: Partial<PublicAPI> = {}): PublicAPI => ({
    name: "getUser",
    symbolType: "FUNCTION",
    filePath: "src/api.ts",
    lineNumber: 10,
    exportType: "named",
    hasJSDoc: false,
    isWidelyUsed: true,
    docQualityScore: 0,
    signature: "function getUser(id: string): User",
    parameters: [
      { name: "id", type: "string", isOptional: false, hasDefault: false, hasDoc: false },
    ],
    returnType: "User",
    ...overrides,
  });

  describe("テンプレート生成（AIなし）", () => {
    it("関数のドキュメントテンプレートを生成", async () => {
      const gap = createGap();
      const api = createAPI();

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("/**");
      expect(result.generatedDoc).toContain("*/");
      expect(result.generatedDoc).toContain("@param");
      expect(result.symbolName).toBe("getUser");
    });

    it("英語でテンプレートを生成", async () => {
      const gap = createGap();
      const api = createAPI();

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "en",
      });

      expect(result.generatedDoc).toContain("Description of");
    });

    it("クラスのテンプレートを生成", async () => {
      const gap = createGap({
        symbolName: "UserService",
        symbolType: "CLASS",
      });
      const api = createAPI({
        name: "UserService",
        symbolType: "CLASS",
        signature: undefined,
        parameters: undefined,
        returnType: undefined,
        members: [
          { name: "getUser", kind: "method", hasDoc: false },
        ],
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("/**");
      expect(result.generatedDoc).toContain("クラス");
    });

    it("インターフェースのテンプレートを生成", async () => {
      const gap = createGap({
        symbolName: "User",
        symbolType: "INTERFACE",
      });
      const api = createAPI({
        name: "User",
        symbolType: "INTERFACE",
        signature: undefined,
        parameters: undefined,
        returnType: undefined,
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("/**");
      expect(result.generatedDoc).toContain("インターフェース");
    });

    it("型のテンプレートを生成", async () => {
      const gap = createGap({
        symbolName: "UserId",
        symbolType: "TYPE",
      });
      const api = createAPI({
        name: "UserId",
        symbolType: "TYPE",
        signature: undefined,
        parameters: undefined,
        returnType: undefined,
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("/**");
      expect(result.generatedDoc).toContain("型");
    });
  });

  describe("戻り値の処理", () => {
    it("戻り値がある場合は@returnsを含む", async () => {
      const gap = createGap();
      const api = createAPI({
        returnType: "User",
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("@returns");
    });

    it("戻り値がvoidの場合は@returnsを含まない", async () => {
      const gap = createGap();
      const api = createAPI({
        returnType: "void",
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).not.toContain("@returns");
    });
  });

  describe("使用例の生成", () => {
    it("パラメータがある関数には使用例を含む", async () => {
      const gap = createGap();
      const api = createAPI({
        parameters: [
          { name: "id", type: "string", isOptional: false, hasDefault: false, hasDoc: false },
        ],
      });

      const result = await generateDocumentation(gap, api, {
        useAI: false,
        language: "ja",
      });

      expect(result.generatedDoc).toContain("@example");
    });
  });

  describe("ドキュメントタイプの判定", () => {
    it("関数のギャップはJSDOC", async () => {
      const gap = createGap({ symbolType: "FUNCTION" });
      const api = createAPI();

      const result = await generateDocumentation(gap, api, { useAI: false });

      expect(result.docType).toBe("JSDOC");
    });

    it("インターフェースのギャップはTYPE_DOC", async () => {
      const gap = createGap({ symbolType: "INTERFACE" });
      const api = createAPI({ symbolType: "INTERFACE" });

      const result = await generateDocumentation(gap, api, { useAI: false });

      expect(result.docType).toBe("TYPE_DOC");
    });

    it("型のギャップはTYPE_DOC", async () => {
      const gap = createGap({ symbolType: "TYPE" });
      const api = createAPI({ symbolType: "TYPE" });

      const result = await generateDocumentation(gap, api, { useAI: false });

      expect(result.docType).toBe("TYPE_DOC");
    });

    it("MISSING_EXAMPLEギャップはEXAMPLE", async () => {
      const gap = createGap({ gapType: "MISSING_EXAMPLE" });
      const api = createAPI();

      const result = await generateDocumentation(gap, api, { useAI: false });

      expect(result.docType).toBe("EXAMPLE");
    });
  });

  describe("生成時間の計測", () => {
    it("生成時間が記録される", async () => {
      const gap = createGap();
      const api = createAPI();

      const result = await generateDocumentation(gap, api, { useAI: false });

      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("formatGeneratedDocsMarkdown", () => {
  const createResult = (overrides: Partial<GeneratedDocResult> = {}): GeneratedDocResult => ({
    filePath: "src/api.ts",
    symbolName: "getUser",
    docType: "JSDOC",
    generatedDoc: "/**\n * ドキュメント\n */",
    generationTimeMs: 100,
    ...overrides,
  });

  it("結果をMarkdownで出力", () => {
    const results = [createResult()];
    const markdown = formatGeneratedDocsMarkdown(results);

    expect(markdown).toContain("生成されたドキュメント");
    expect(markdown).toContain("getUser");
    expect(markdown).toContain("```typescript");
  });

  it("空の結果を処理", () => {
    const markdown = formatGeneratedDocsMarkdown([]);

    expect(markdown).toContain("生成されませんでした");
  });

  it("複数の結果を処理", () => {
    const results = [
      createResult({ symbolName: "func1" }),
      createResult({ symbolName: "func2" }),
    ];
    const markdown = formatGeneratedDocsMarkdown(results);

    expect(markdown).toContain("func1");
    expect(markdown).toContain("func2");
    expect(markdown).toContain("2 件");
  });
});

describe("formatGeneratedDocsForPR", () => {
  const createResult = (overrides: Partial<GeneratedDocResult> = {}): GeneratedDocResult => ({
    filePath: "src/api.ts",
    symbolName: "getUser",
    docType: "JSDOC",
    generatedDoc: "/**\n * ドキュメント\n */",
    generationTimeMs: 100,
    ...overrides,
  });

  it("PR向けフォーマットを出力", () => {
    const results = [createResult()];
    const prFormat = formatGeneratedDocsForPR(results);

    expect(prFormat).toContain("ドキュメント提案");
    expect(prFormat).toContain("<details>");
    expect(prFormat).toContain("getUser");
  });

  it("空の結果は空文字列", () => {
    const prFormat = formatGeneratedDocsForPR([]);

    expect(prFormat).toBe("");
  });

  it("10件以上は切り詰める", () => {
    const results = Array.from({ length: 15 }, (_, i) =>
      createResult({ symbolName: `func${i}` })
    );
    const prFormat = formatGeneratedDocsForPR(results);

    expect(prFormat).toContain("他 5 件");
  });
});
