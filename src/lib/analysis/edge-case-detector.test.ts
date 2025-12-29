/**
 * Edge Case Detector Tests
 */

import { describe, it, expect } from "vitest";
import { detectEdgeCases, formatEdgeCasesMarkdown, type EdgeCaseAnalysis } from "./edge-case-detector";
import type { FunctionInfo } from "./function-analyzer";

const createTestFunction = (overrides: Partial<FunctionInfo> = {}): FunctionInfo => ({
  name: "testFunction",
  filePath: "test.ts",
  startLine: 1,
  endLine: 10,
  parameters: [],
  returnType: "void",
  isAsync: false,
  isExported: true,
  kind: "function",
  body: "",
  signature: "function testFunction(): void",
  dependencies: [],
  usedAPIs: [],
  ...overrides,
});

describe("detectEdgeCases", () => {
  describe("parameter-based edge cases", () => {
    it("should detect null/undefined for optional parameters", () => {
      const func = createTestFunction({
        parameters: [
          {
            name: "value",
            type: "string | undefined",
            hasDefault: false,
            isOptional: true,
            isRest: false,
          },
        ],
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "null_undefined")).toBe(true);
    });

    it("should detect empty string for string parameters", () => {
      const func = createTestFunction({
        parameters: [
          {
            name: "name",
            type: "string",
            hasDefault: false,
            isOptional: false,
            isRest: false,
          },
        ],
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "empty")).toBe(true);
    });

    it("should detect boundary values for number parameters", () => {
      const func = createTestFunction({
        parameters: [
          {
            name: "count",
            type: "number",
            hasDefault: false,
            isOptional: false,
            isRest: false,
          },
        ],
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "boundary")).toBe(true);
    });

    it("should detect empty array for array parameters", () => {
      const func = createTestFunction({
        parameters: [
          {
            name: "items",
            type: "number[]",
            hasDefault: false,
            isOptional: false,
            isRest: false,
          },
        ],
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "empty")).toBe(true);
    });
  });

  describe("body-based edge cases", () => {
    it("should detect division by zero", () => {
      const func = createTestFunction({
        body: "return a / b;",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "boundary")).toBe(true);
    });

    it("should detect JSON.parse error handling", () => {
      const func = createTestFunction({
        body: "const data = JSON.parse(input);",
        usedAPIs: ["JSON"],
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "error_handling")).toBe(true);
    });

    it("should detect array index access", () => {
      const func = createTestFunction({
        body: "return items[0];",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "boundary")).toBe(true);
    });

    it("should detect regex operations", () => {
      const func = createTestFunction({
        body: `const match = str.match(/pattern/);`,
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "performance")).toBe(true);
    });
  });

  describe("async edge cases", () => {
    it("should detect async function rejection scenarios", () => {
      const func = createTestFunction({
        isAsync: true,
        body: "return await fetchData();",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "async")).toBe(true);
    });

    it("should detect promise rejection", () => {
      const func = createTestFunction({
        body: "return promise.then(x => x);",
        returnType: "Promise<string>",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "async")).toBe(true);
    });
  });

  describe("API-based edge cases", () => {
    it("should detect fetch API edge cases", () => {
      const func = createTestFunction({
        usedAPIs: ["fetch"],
        body: "const res = await fetch(url);",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "error_handling")).toBe(true);
    });

    it("should detect file system edge cases", () => {
      const func = createTestFunction({
        usedAPIs: ["fs"],
        body: "const data = fs.readFileSync(path);",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "error_handling")).toBe(true);
    });

    it("should detect database edge cases", () => {
      const func = createTestFunction({
        usedAPIs: ["prisma"],
        body: "const user = await prisma.user.findUnique({ where: { id } });",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "error_handling")).toBe(true);
    });
  });

  describe("return type edge cases", () => {
    it("should detect nullable return types", () => {
      const func = createTestFunction({
        returnType: "User | null",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "null_undefined")).toBe(true);
    });

    it("should detect empty array returns", () => {
      const func = createTestFunction({
        returnType: "string[]",
        body: "return items.filter(x => x);",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.category === "empty")).toBe(true);
    });
  });

  describe("priority calculation", () => {
    it("should assign high priority to security-related edge cases", () => {
      const func = createTestFunction({
        usedAPIs: ["fetch", "prisma"],
        body: "await fetch(url); await prisma.user.delete({ where: { id } });",
      });

      const result = detectEdgeCases(func);

      expect(result.edgeCases.some((e) => e.priority === "high")).toBe(true);
    });

    it("should calculate recommended test count based on edge cases", () => {
      const func = createTestFunction({
        parameters: [
          { name: "a", type: "number", hasDefault: false, isOptional: false, isRest: false },
          { name: "b", type: "string", hasDefault: false, isOptional: true, isRest: false },
        ],
        body: `
          if (a > 0) {
            const data = JSON.parse(b);
            return items[0] / a;
          }
        `,
      });

      const result = detectEdgeCases(func);

      // Should recommend more tests for complex functions
      expect(result.recommendedTestCount).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("formatEdgeCasesMarkdown", () => {
  it("should format edge cases as markdown", () => {
    const func = createTestFunction({ name: "processData" });
    const analysis: EdgeCaseAnalysis = {
      functionInfo: func,
      edgeCases: [
        {
          category: "null_undefined",
          priority: "high",
          description: "Handle null input",
        },
        {
          category: "boundary",
          priority: "medium",
          description: "Handle division by zero",
        },
      ],
      testDifficulty: "medium",
      recommendedTestCount: 5,
    };

    const markdown = formatEdgeCasesMarkdown(analysis);

    expect(markdown).toContain("processData");
    expect(markdown).toContain("Handle null input");
    expect(markdown).toContain("Handle division by zero");
    expect(markdown).toContain("🔴"); // high priority
    expect(markdown).toContain("🟡"); // medium priority
  });

  it("should include test difficulty in markdown", () => {
    const func = createTestFunction({ name: "simpleFunc" });
    const analysis: EdgeCaseAnalysis = {
      functionInfo: func,
      edgeCases: [],
      testDifficulty: "easy",
      recommendedTestCount: 1,
    };

    const markdown = formatEdgeCasesMarkdown(analysis);

    expect(markdown).toContain("テスト難易度");
    expect(markdown).toContain("easy");
  });
});
