/**
 * Test Generator Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateTests, detectTestFramework, formatTestSummaryMarkdown, type GeneratedTestResult } from "./test-generator";
import type { FunctionInfo } from "../analysis/function-analyzer";
import type { EdgeCaseAnalysis } from "../analysis/edge-case-detector";

// Mock the AI SDK
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: vi.fn(() => () => ({})),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => ({
    object: {
      testCode: `
import { describe, it, expect } from 'vitest';
import { mockFunction } from './mock';

describe('mockFunction', () => {
  it('should return correct value', () => {
    expect(mockFunction(1)).toBe(2);
  });
});
      `.trim(),
      explanation: "Test explanation",
    },
    usage: { totalTokens: 100 },
  })),
}));

const createTestFunction = (overrides: Partial<FunctionInfo> = {}): FunctionInfo => ({
  name: "processData",
  filePath: "src/utils/processor.ts",
  startLine: 10,
  endLine: 25,
  parameters: [
    {
      name: "input",
      type: "string",
      hasDefault: false,
      isOptional: false,
      isRest: false,
    },
    {
      name: "options",
      type: "ProcessOptions",
      hasDefault: false,
      isOptional: true,
      isRest: false,
    },
  ],
  returnType: "ProcessedData",
  isAsync: false,
  isExported: true,
  kind: "function",
  body: `
    if (!input) throw new Error("Invalid input");
    const trimmed = input.trim();
    if (options?.validate) {
      validateInput(trimmed);
    }
    return { data: trimmed, timestamp: Date.now() };
  `,
  signature: "function processData(input: string, options?: ProcessOptions): ProcessedData",
  dependencies: ["validateInput"],
  usedAPIs: ["Date"],
  ...overrides,
});

const createEdgeCaseAnalysis = (func: FunctionInfo, overrides: Partial<EdgeCaseAnalysis> = {}): EdgeCaseAnalysis => ({
  functionInfo: func,
  edgeCases: [
    {
      category: "null_undefined",
      priority: "high",
      description: "Handle null/undefined input",
    },
    {
      category: "empty",
      priority: "medium",
      description: "Handle empty string",
    },
  ],
  testDifficulty: "medium",
  recommendedTestCount: 4,
  ...overrides,
});

describe("generateTests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate tests using AI when enabled", async () => {
    const func = createTestFunction();
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "VITEST",
      useAI: true,
      useMocks: false,
      maxTests: 5,
    });

    expect(result).toBeDefined();
    expect(result.functionName).toBe("processData");
    expect(result.filePath).toBe("src/utils/processor.ts");
    expect(result.framework).toBe("VITEST");
    expect(result.testCode).toContain("describe");
    expect(result.testCode).toContain("it");
  });

  it("should use template when AI is disabled", async () => {
    const func = createTestFunction();
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "VITEST",
      useAI: false,
      useMocks: false,
      maxTests: 3,
    });

    expect(result).toBeDefined();
    expect(result.testCode).toContain("describe");
    expect(result.testCode).toContain("processData");
  });

  it("should generate Jest tests when framework is JEST", async () => {
    const func = createTestFunction();
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "JEST",
      useAI: false,
      useMocks: false,
      maxTests: 3,
    });

    expect(result).toBeDefined();
    expect(result.framework).toBe("JEST");
    expect(result.testCode).toContain("describe");
  });

  it("should include mock setup when useMocks is true", async () => {
    const func = createTestFunction({
      usedAPIs: ["fetch", "prisma"],
    });
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "VITEST",
      useAI: false,
      useMocks: true,
      maxTests: 3,
    });

    expect(result).toBeDefined();
    // Template should contain mock-related code
    expect(result.testCode).toContain("vi.mock");
  });

  it("should handle async functions", async () => {
    const func = createTestFunction({
      isAsync: true,
      body: "const result = await fetch(url); return result.json();",
      usedAPIs: ["fetch"],
    });
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "VITEST",
      useAI: false,
      useMocks: false,
      maxTests: 3,
    });

    expect(result).toBeDefined();
    expect(result.testCode).toContain("async");
  });

  it("should include edge cases in generated tests", async () => {
    const func = createTestFunction();
    const edgeCases = createEdgeCaseAnalysis(func);

    const result = await generateTests(func, edgeCases, {
      framework: "VITEST",
      useAI: false,
      useMocks: false,
      maxTests: 5,
    });

    expect(result.edgeCases.length).toBeGreaterThan(0);
  });
});

describe("detectTestFramework", () => {
  it("should detect Vitest from package.json", () => {
    const packageJson = {
      devDependencies: {
        vitest: "^1.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("VITEST");
  });

  it("should detect Jest from package.json", () => {
    const packageJson = {
      devDependencies: {
        jest: "^29.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("JEST");
  });

  it("should detect Mocha from package.json", () => {
    const packageJson = {
      devDependencies: {
        mocha: "^10.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("MOCHA");
  });

  it("should detect pytest from package.json", () => {
    const packageJson = {
      devDependencies: {
        pytest: "^7.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("PYTEST");
  });

  it("should prefer Vitest over Jest if both are present", () => {
    const packageJson = {
      devDependencies: {
        vitest: "^1.0.0",
        jest: "^29.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("VITEST");
  });

  it("should default to Vitest if no framework detected", () => {
    const packageJson = {
      devDependencies: {},
    };

    expect(detectTestFramework(packageJson)).toBe("VITEST");
  });

  it("should check dependencies as well as devDependencies", () => {
    const packageJson = {
      dependencies: {
        vitest: "^1.0.0",
      },
    };

    expect(detectTestFramework(packageJson)).toBe("VITEST");
  });
});

describe("formatTestSummaryMarkdown", () => {
  it("should format test results as markdown", () => {
    const results: GeneratedTestResult[] = [
      {
        functionName: "processData",
        filePath: "src/utils/processor.ts",
        testCode: "describe('processData', () => { ... });",
        framework: "VITEST",
        edgeCases: ["null input", "empty string"],
        generationTimeMs: 100,
      },
      {
        functionName: "validateInput",
        filePath: "src/utils/validator.ts",
        testCode: "describe('validateInput', () => { ... });",
        framework: "VITEST",
        edgeCases: ["invalid format"],
        generationTimeMs: 80,
      },
    ];

    const markdown = formatTestSummaryMarkdown(results);

    expect(markdown).toContain("processData");
    expect(markdown).toContain("validateInput");
    expect(markdown).toContain("2"); // function count
    expect(markdown).toContain("3"); // edge cases count
  });

  it("should handle empty results", () => {
    const results: GeneratedTestResult[] = [];

    const markdown = formatTestSummaryMarkdown(results);

    expect(markdown).toContain("関数数");
    expect(markdown).toContain("0");
  });

  it("should list covered edge cases count", () => {
    const results: GeneratedTestResult[] = [
      {
        functionName: "func",
        filePath: "src/func.ts",
        testCode: "...",
        framework: "VITEST",
        edgeCases: ["null input", "boundary value", "empty array"],
        generationTimeMs: 50,
      },
    ];

    const markdown = formatTestSummaryMarkdown(results);

    expect(markdown).toContain("3"); // edge cases count
  });
});
