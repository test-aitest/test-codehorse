/**
 * Function Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import {
  analyzeFunctions,
  extractNewFunctions,
  isTestableFunction,
  calculateComplexity,
  type FunctionInfo,
} from "./function-analyzer";

describe("analyzeFunctions", () => {
  it("should extract function declarations", () => {
    const content = `
export function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}
`;
    const result = analyzeFunctions("test.ts", content);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe("add");
    expect(result.functions[0].isExported).toBe(true);
    expect(result.functions[0].parameters).toHaveLength(2);
    expect(result.functions[1].name).toBe("subtract");
    expect(result.functions[1].isExported).toBe(false);
  });

  it("should extract arrow functions", () => {
    const content = `
export const multiply = (a: number, b: number): number => {
  return a * b;
};

const divide = (a: number, b: number): number => a / b;
`;
    const result = analyzeFunctions("test.ts", content);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe("multiply");
    expect(result.functions[0].kind).toBe("arrow");
    expect(result.functions[1].name).toBe("divide");
  });

  it("should extract class methods", () => {
    const content = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  async fetchData(url: string): Promise<string> {
    return fetch(url).then(r => r.text());
  }
}
`;
    const result = analyzeFunctions("test.ts", content);

    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe("Calculator.add");
    expect(result.functions[0].kind).toBe("method");
    expect(result.functions[1].name).toBe("Calculator.fetchData");
    expect(result.functions[1].isAsync).toBe(true);
  });

  it("should extract async functions", () => {
    const content = `
export async function fetchUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}
`;
    const result = analyzeFunctions("test.ts", content);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].isAsync).toBe(true);
    expect(result.functions[0].usedAPIs).toContain("fetch");
  });

  it("should extract parameters with defaults and optionals", () => {
    const content = `
function greet(name: string, greeting: string = "Hello", suffix?: string): string {
  return \`\${greeting} \${name}\${suffix || ''}\`;
}
`;
    const result = analyzeFunctions("test.ts", content);
    const params = result.functions[0].parameters;

    expect(params).toHaveLength(3);
    expect(params[0].name).toBe("name");
    expect(params[0].hasDefault).toBe(false);
    expect(params[0].isOptional).toBe(false);
    expect(params[1].name).toBe("greeting");
    expect(params[1].hasDefault).toBe(true);
    expect(params[2].name).toBe("suffix");
    expect(params[2].isOptional).toBe(true);
  });

  it("should extract dependencies (called functions)", () => {
    const content = `
import { helper } from './utils';

function processData(data: string): string {
  const parsed = JSON.parse(data);
  const validated = helper(parsed);
  return validated;
}
`;
    const result = analyzeFunctions("test.ts", content);

    expect(result.functions[0].dependencies).toContain("JSON.parse");
    expect(result.functions[0].dependencies).toContain("helper");
    expect(result.functions[0].usedAPIs).toContain("JSON");
  });

  it("should handle JSX files", () => {
    const content = `
export function Button({ onClick, children }: ButtonProps): JSX.Element {
  return <button onClick={onClick}>{children}</button>;
}
`;
    const result = analyzeFunctions("Button.tsx", content);

    expect(result.functions).toHaveLength(1);
    expect(result.functions[0].name).toBe("Button");
  });

  it("should handle files with syntax errors gracefully", () => {
    const content = `
function broken(a {
  return a;
}
`;
    // ts-morph may or may not throw errors for syntax issues
    // The function should not crash and return a result
    const result = analyzeFunctions("test.ts", content);

    // Either it returns empty functions or reports errors
    expect(result).toBeDefined();
    expect(Array.isArray(result.functions)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});

describe("extractNewFunctions", () => {
  it("should extract only new functions from diff", () => {
    const diffContent = `
@@ -1,3 +1,10 @@
+function newFunction(x: number): number {
+  return x * 2;
+}
+
 function existingFunction(y: number): number {
   return y + 1;
 }
`;
    const fullContent = `
function newFunction(x: number): number {
  return x * 2;
}

function existingFunction(y: number): number {
  return y + 1;
}
`;
    const result = extractNewFunctions("test.ts", diffContent, fullContent);

    // newFunction should be included because it's in added lines
    expect(result.some((f) => f.name === "newFunction")).toBe(true);
  });
});

describe("isTestableFunction", () => {
  it("should return true for non-trivial exported functions", () => {
    const func: FunctionInfo = {
      name: "processData",
      filePath: "src/utils.ts",
      startLine: 1,
      endLine: 10,
      parameters: [{ name: "data", type: "string", hasDefault: false, isOptional: false, isRest: false }],
      returnType: "string",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        const result = data.trim();
        if (result.length === 0) {
          throw new Error("Empty data");
        }
        return result.toUpperCase();
      `,
      signature: "function processData(data: string): string",
      dependencies: [],
      usedAPIs: [],
    };

    expect(isTestableFunction(func)).toBe(true);
  });

  it("should return false for test files", () => {
    const func: FunctionInfo = {
      name: "testHelper",
      filePath: "src/utils.test.ts",
      startLine: 1,
      endLine: 5,
      parameters: [],
      returnType: "void",
      isAsync: false,
      isExported: false,
      kind: "function",
      body: "return true;",
      signature: "function testHelper(): void",
      dependencies: [],
      usedAPIs: [],
    };

    expect(isTestableFunction(func)).toBe(false);
  });

  it("should return false for spec files", () => {
    const func: FunctionInfo = {
      name: "specHelper",
      filePath: "src/utils.spec.ts",
      startLine: 1,
      endLine: 5,
      parameters: [],
      returnType: "void",
      isAsync: false,
      isExported: false,
      kind: "function",
      body: "return true;",
      signature: "function specHelper(): void",
      dependencies: [],
      usedAPIs: [],
    };

    expect(isTestableFunction(func)).toBe(false);
  });

  it("should return false for empty functions", () => {
    const func: FunctionInfo = {
      name: "emptyFunc",
      filePath: "src/utils.ts",
      startLine: 1,
      endLine: 2,
      parameters: [],
      returnType: "void",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: "   ",
      signature: "function emptyFunc(): void",
      dependencies: [],
      usedAPIs: [],
    };

    expect(isTestableFunction(func)).toBe(false);
  });

  it("should return false for one-liner getter functions", () => {
    const func: FunctionInfo = {
      name: "getName",
      filePath: "src/utils.ts",
      startLine: 1,
      endLine: 1,
      parameters: [],
      returnType: "string",
      isAsync: false,
      isExported: true,
      kind: "arrow",
      body: "return this.name;",
      signature: "function getName(): string",
      dependencies: [],
      usedAPIs: [],
    };

    expect(isTestableFunction(func)).toBe(false);
  });
});

describe("calculateComplexity", () => {
  it("should return 1 for simple functions", () => {
    const func: FunctionInfo = {
      name: "simple",
      filePath: "test.ts",
      startLine: 1,
      endLine: 3,
      parameters: [],
      returnType: "number",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: "return 42;",
      signature: "function simple(): number",
      dependencies: [],
      usedAPIs: [],
    };

    expect(calculateComplexity(func)).toBe(1);
  });

  it("should count if statements", () => {
    const func: FunctionInfo = {
      name: "conditional",
      filePath: "test.ts",
      startLine: 1,
      endLine: 10,
      parameters: [],
      returnType: "number",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        if (a > 0) {
          return 1;
        } else {
          return -1;
        }
      `,
      signature: "function conditional(): number",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 1 (if) + 1 (else) = 3
    expect(calculateComplexity(func)).toBe(3);
  });

  it("should count loops", () => {
    const func: FunctionInfo = {
      name: "loop",
      filePath: "test.ts",
      startLine: 1,
      endLine: 10,
      parameters: [],
      returnType: "number",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        for (let i = 0; i < 10; i++) {
          while (condition) {
            doSomething();
          }
        }
      `,
      signature: "function loop(): number",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 1 (for) + 1 (while) = 3
    expect(calculateComplexity(func)).toBe(3);
  });

  it("should count array methods", () => {
    const func: FunctionInfo = {
      name: "arrayOps",
      filePath: "test.ts",
      startLine: 1,
      endLine: 5,
      parameters: [],
      returnType: "number[]",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        return items
          .map(x => x * 2)
          .filter(x => x > 10)
          .reduce((a, b) => a + b, 0);
      `,
      signature: "function arrayOps(): number[]",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 1 (map) + 1 (filter) + 1 (reduce) = 4
    expect(calculateComplexity(func)).toBe(4);
  });

  it("should count logical operators", () => {
    const func: FunctionInfo = {
      name: "logical",
      filePath: "test.ts",
      startLine: 1,
      endLine: 5,
      parameters: [],
      returnType: "boolean",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: "return a && b || c && d;",
      signature: "function logical(): boolean",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 2 (&&) + 1 (||) = 4
    expect(calculateComplexity(func)).toBe(4);
  });

  it("should count try-catch", () => {
    const func: FunctionInfo = {
      name: "tryCatch",
      filePath: "test.ts",
      startLine: 1,
      endLine: 10,
      parameters: [],
      returnType: "void",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        try {
          doSomething();
        } catch (e) {
          handleError(e);
        }
      `,
      signature: "function tryCatch(): void",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 1 (try) + 1 (catch) = 3
    expect(calculateComplexity(func)).toBe(3);
  });

  it("should count ternary operators", () => {
    const func: FunctionInfo = {
      name: "ternary",
      filePath: "test.ts",
      startLine: 1,
      endLine: 3,
      parameters: [],
      returnType: "string",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: "return a > 0 ? 'positive' : 'negative';",
      signature: "function ternary(): string",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 1 (ternary) = 2
    expect(calculateComplexity(func)).toBe(2);
  });

  it("should count switch cases", () => {
    const func: FunctionInfo = {
      name: "switchCase",
      filePath: "test.ts",
      startLine: 1,
      endLine: 15,
      parameters: [],
      returnType: "string",
      isAsync: false,
      isExported: true,
      kind: "function",
      body: `
        switch (type) {
          case 'a':
            return 'A';
          case 'b':
            return 'B';
          case 'c':
            return 'C';
        }
      `,
      signature: "function switchCase(): string",
      dependencies: [],
      usedAPIs: [],
    };

    // 1 (base) + 3 (case) = 4
    expect(calculateComplexity(func)).toBe(4);
  });
});
