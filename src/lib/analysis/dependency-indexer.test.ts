/**
 * Phase 3: Dependency Indexer Tests
 */
import { describe, it, expect } from "vitest";
import { extractDependencies } from "./dependency-indexer";

describe("extractDependencies", () => {
  describe("import extraction", () => {
    it("should extract named imports", () => {
      const content = `import { foo, bar } from "./utils";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].sourcePath).toBe("./utils");
      expect(result.imports[0].importType).toBe("NAMED");
      expect(result.imports[0].importedSymbols).toContain("foo");
      expect(result.imports[0].importedSymbols).toContain("bar");
      expect(result.imports[0].isExternal).toBe(false);
    });

    it("should extract default imports", () => {
      const content = `import MyComponent from "./MyComponent";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].importType).toBe("DEFAULT");
      expect(result.imports[0].importedSymbols).toContain("default");
    });

    it("should extract namespace imports", () => {
      const content = `import * as utils from "./utils";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].importType).toBe("NAMESPACE");
      expect(result.imports[0].importedSymbols).toContain("*");
    });

    it("should extract type-only imports", () => {
      const content = `import type { User } from "./types";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].importType).toBe("TYPE_ONLY");
    });

    it("should extract side-effect imports", () => {
      const content = `import "./styles.css";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].importType).toBe("SIDE_EFFECT");
      expect(result.imports[0].importedSymbols).toHaveLength(0);
    });

    it("should identify external modules", () => {
      const content = `import { useState } from "react";`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].isExternal).toBe(true);
    });

    it("should handle multiple imports", () => {
      const content = `
import { foo } from "./utils";
import bar from "./bar";
import type { Baz } from "./types";
import "react";
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(4);
    });
  });

  describe("export extraction", () => {
    it("should extract exported functions", () => {
      const content = `
export function myFunction(x: number): string {
  return x.toString();
}
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("myFunction");
      expect(result.exports[0].symbolType).toBe("FUNCTION");
      expect(result.exports[0].isDefault).toBe(false);
    });

    it("should extract exported classes", () => {
      const content = `
export class MyClass {
  constructor() {}
}
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("MyClass");
      expect(result.exports[0].symbolType).toBe("CLASS");
    });

    it("should extract exported interfaces", () => {
      const content = `
export interface User {
  id: string;
  name: string;
}
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("User");
      expect(result.exports[0].symbolType).toBe("INTERFACE");
    });

    it("should extract exported type aliases", () => {
      const content = `
export type Status = "pending" | "active" | "done";
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("Status");
      expect(result.exports[0].symbolType).toBe("TYPE");
    });

    it("should extract exported enums", () => {
      const content = `
export enum Color {
  Red,
  Green,
  Blue
}
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("Color");
      expect(result.exports[0].symbolType).toBe("ENUM");
    });

    it("should extract exported constants", () => {
      const content = `
export const MAX_SIZE = 100;
export const CONFIG = { debug: true };
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(2);
      expect(result.exports[0].symbolName).toBe("MAX_SIZE");
      expect(result.exports[1].symbolName).toBe("CONFIG");
    });

    it("should extract default exports", () => {
      const content = `
export default function handler() {}
      `;
      const result = extractDependencies("src/test.ts", content, "");

      const defaultExport = result.exports.find((e) => e.isDefault);
      expect(defaultExport).toBeDefined();
    });

    it("should extract arrow function exports", () => {
      const content = `
export const myArrowFn = (x: number) => x * 2;
      `;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0].symbolName).toBe("myArrowFn");
      expect(result.exports[0].symbolType).toBe("FUNCTION");
    });
  });

  describe("error handling", () => {
    it("should handle code without imports or exports gracefully", () => {
      const content = `
const x = 1;
console.log(x);
      `;
      const result = extractDependencies("src/test.ts", content, "");

      // No imports or exports, but no errors either
      expect(result.imports).toHaveLength(0);
      expect(result.exports).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should return empty arrays for non-TypeScript files", () => {
      const content = `console.log("hello");`;
      const result = extractDependencies("src/test.ts", content, "");

      expect(result.imports).toHaveLength(0);
      expect(result.exports).toHaveLength(0);
    });
  });

  describe("JSX/TSX support", () => {
    it("should handle TSX files with JSX syntax", () => {
      const content = `
import React from "react";

export function MyComponent() {
  return <div>Hello</div>;
}
      `;
      const result = extractDependencies("src/Component.tsx", content, "");

      expect(result.imports).toHaveLength(1);
      expect(result.exports.length).toBeGreaterThanOrEqual(1);
    });
  });
});
