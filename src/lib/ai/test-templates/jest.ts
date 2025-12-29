/**
 * Jest Test Template Generator
 */

import type { FunctionInfo } from "@/lib/analysis/function-analyzer";
import type { EdgeCase } from "@/lib/analysis/edge-case-detector";

export interface TestTemplateOptions {
  /** テストファイルのパス */
  testFilePath: string;
  /** 対象ファイルからの相対インポートパス */
  importPath: string;
  /** モックを使用するか */
  useMocks: boolean;
  /** TypeScriptを使用するか */
  useTypeScript: boolean;
}

/**
 * Jestテストテンプレートを生成
 */
export function generateJestTemplate(
  func: FunctionInfo,
  edgeCases: EdgeCase[],
  options: TestTemplateOptions
): string {
  const lines: string[] = [];

  // インポート
  lines.push(`import { ${func.name} } from "${options.importPath}";`);

  // モックのセットアップ
  if (options.useMocks && func.usedAPIs.length > 0) {
    lines.push("");
    lines.push("// モックのセットアップ");
    for (const api of func.usedAPIs) {
      if (api === "fetch") {
        lines.push(`jest.mock("node-fetch");`);
      } else if (api === "prisma" || api === "db") {
        lines.push(`jest.mock("@/lib/prisma");`);
      } else if (api === "fs") {
        lines.push(`jest.mock("fs");`);
      }
    }
  }

  lines.push("");
  lines.push(`describe("${func.name}", () => {`);

  // beforeEach/afterEach
  if (options.useMocks) {
    lines.push(`  beforeEach(() => {`);
    lines.push(`    jest.clearAllMocks();`);
    lines.push(`  });`);
    lines.push("");
    lines.push(`  afterEach(() => {`);
    lines.push(`    jest.restoreAllMocks();`);
    lines.push(`  });`);
    lines.push("");
  }

  // 正常系テスト
  lines.push(`  describe("正常系", () => {`);
  lines.push(`    it("正常な入力で期待通りの結果を返す", ${func.isAsync ? "async " : ""}() => {`);
  lines.push(`      // Arrange`);
  lines.push(`      ${generateArrangeSection(func)}`);
  lines.push("");
  lines.push(`      // Act`);
  lines.push(`      ${generateActSection(func)}`);
  lines.push("");
  lines.push(`      // Assert`);
  lines.push(`      ${generateAssertSection(func)}`);
  lines.push(`    });`);
  lines.push(`  });`);
  lines.push("");

  // エッジケーステスト
  const highPriorityCases = edgeCases.filter(c => c.priority === "high");
  const mediumPriorityCases = edgeCases.filter(c => c.priority === "medium");

  if (highPriorityCases.length > 0) {
    lines.push(`  describe("エッジケース - 高優先度", () => {`);
    for (const edgeCase of highPriorityCases) {
      lines.push(generateEdgeCaseTest(func, edgeCase));
    }
    lines.push(`  });`);
    lines.push("");
  }

  if (mediumPriorityCases.length > 0) {
    lines.push(`  describe("エッジケース - 中優先度", () => {`);
    for (const edgeCase of mediumPriorityCases.slice(0, 3)) {
      lines.push(generateEdgeCaseTest(func, edgeCase));
    }
    lines.push(`  });`);
    lines.push("");
  }

  // エラーハンドリングテスト
  const errorCases = edgeCases.filter(c => c.category === "error_handling");
  if (errorCases.length > 0) {
    lines.push(`  describe("エラーハンドリング", () => {`);
    for (const errorCase of errorCases.slice(0, 3)) {
      lines.push(generateErrorTest(func, errorCase));
    }
    lines.push(`  });`);
  }

  lines.push(`});`);

  return lines.join("\n");
}

function generateArrangeSection(func: FunctionInfo): string {
  const params = func.parameters;
  if (params.length === 0) {
    return "// パラメータなし";
  }

  const lines = params.map(p => {
    const value = getDefaultTestValue(p.type);
    return `const ${p.name} = ${value};`;
  });

  return lines.join("\n      ");
}

function generateActSection(func: FunctionInfo): string {
  const params = func.parameters.map(p => p.name).join(", ");
  const awaitPrefix = func.isAsync ? "await " : "";
  return `const result = ${awaitPrefix}${func.name}(${params});`;
}

function generateAssertSection(func: FunctionInfo): string {
  const returnType = func.returnType.toLowerCase();

  if (returnType === "void" || returnType === "undefined") {
    return "expect(result).toBeUndefined();";
  }
  if (returnType === "boolean") {
    return "expect(typeof result).toBe(\"boolean\");";
  }
  if (returnType.includes("[]") || returnType.includes("array")) {
    return "expect(Array.isArray(result)).toBe(true);";
  }
  if (returnType.includes("string")) {
    return "expect(typeof result).toBe(\"string\");";
  }
  if (returnType.includes("number")) {
    return "expect(typeof result).toBe(\"number\");";
  }

  return "expect(result).toBeDefined();";
}

function generateEdgeCaseTest(func: FunctionInfo, edgeCase: EdgeCase): string {
  const isAsync = func.isAsync ? "async " : "";
  const lines: string[] = [];

  lines.push(`    it("${edgeCase.description}", ${isAsync}() => {`);
  lines.push(`      // Arrange`);

  if (edgeCase.testInput) {
    lines.push(`      const input = ${edgeCase.testInput};`);
  }

  lines.push("");
  lines.push(`      // Act & Assert`);

  if (edgeCase.category === "null_undefined" || edgeCase.category === "error_handling") {
    if (func.isAsync) {
      lines.push(`      await expect(${func.name}(${edgeCase.testInput || "/* input */"})).rejects.toThrow();`);
    } else {
      lines.push(`      expect(() => ${func.name}(${edgeCase.testInput || "/* input */"})).toThrow();`);
    }
  } else {
    const awaitPrefix = func.isAsync ? "await " : "";
    lines.push(`      const result = ${awaitPrefix}${func.name}(${edgeCase.testInput || "/* input */"});`);
    lines.push(`      expect(result).toBeDefined();`);
  }

  lines.push(`    });`);
  lines.push("");

  return lines.join("\n");
}

function generateErrorTest(func: FunctionInfo, edgeCase: EdgeCase): string {
  const isAsync = func.isAsync ? "async " : "";
  const lines: string[] = [];

  lines.push(`    it("${edgeCase.description}", ${isAsync}() => {`);

  if (func.isAsync) {
    lines.push(`      await expect(${func.name}(/* invalid input */)).rejects.toThrow();`);
  } else {
    lines.push(`      expect(() => ${func.name}(/* invalid input */)).toThrow();`);
  }

  lines.push(`    });`);
  lines.push("");

  return lines.join("\n");
}

function getDefaultTestValue(type: string): string {
  const typeLower = type.toLowerCase();

  if (typeLower === "string") return '"test"';
  if (typeLower === "number") return "1";
  if (typeLower === "boolean") return "true";
  if (typeLower.includes("[]")) return "[]";
  if (typeLower.includes("object") || typeLower.includes("{")) return "{}";
  if (typeLower.includes("date")) return "new Date()";
  if (typeLower === "null") return "null";
  if (typeLower === "undefined") return "undefined";

  return "/* TODO: provide test value */";
}
