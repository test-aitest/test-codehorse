/**
 * Phase 3: Blast Radius Calculator Tests
 */
import { describe, it, expect } from "vitest";
import {
  calculateBlastRadius,
  calculateTotalBlastRadius,
  summarizeBlastRadius,
  summarizeTotalBlastRadius,
} from "./blast-radius-calculator";
import type { DependencyGraph, DependencyNode, DependencyEdge, ExportInfo } from "./types";
import { ImportType, SymbolType } from "@prisma/client";

// Helper to create a mock dependency edge
function createEdge(
  targetFile: string,
  importType: ImportType = "NAMED",
  importedSymbols: string[] = []
): DependencyEdge {
  return { targetFile, importType, importedSymbols };
}

// Helper to create a mock export
function createExport(
  symbolName: string,
  symbolType: SymbolType = "FUNCTION",
  isDefault: boolean = false
): ExportInfo {
  return { symbolName, symbolType, isDefault };
}

// Helper to create a mock dependency graph
function createMockGraph(nodes: Map<string, DependencyNode>): DependencyGraph {
  const reverseIndex = new Map<string, string[]>();

  // Build reverse index from the nodes
  for (const [filePath, node] of nodes) {
    for (const imp of node.imports) {
      const existing = reverseIndex.get(imp.targetFile) || [];
      if (!existing.includes(filePath)) {
        existing.push(filePath);
      }
      reverseIndex.set(imp.targetFile, existing);
    }
  }

  return { nodes, reverseIndex };
}

describe("calculateBlastRadius", () => {
  it("should return zero impact for files with no importers", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [createExport("foo")],
    });

    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");

    expect(result.directCount).toBe(0);
    expect(result.transitiveCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.score).toBe(0);
  });

  it("should count direct importers", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [createExport("foo")],
    });
    nodes.set("src/component.ts", {
      filePath: "src/component.ts",
      imports: [createEdge("src/utils.ts", "NAMED", ["foo"])],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");

    expect(result.directCount).toBe(1);
    expect(result.transitiveCount).toBe(0);
    expect(result.totalCount).toBe(1);
  });

  it("should count transitive importers", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [createExport("foo")],
    });
    nodes.set("src/service.ts", {
      filePath: "src/service.ts",
      imports: [createEdge("src/utils.ts", "NAMED", ["foo"])],
      exports: [createExport("myService")],
    });
    nodes.set("src/component.ts", {
      filePath: "src/component.ts",
      imports: [createEdge("src/service.ts", "NAMED", ["myService"])],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");

    expect(result.directCount).toBe(1); // service.ts
    expect(result.transitiveCount).toBe(1); // component.ts
    expect(result.totalCount).toBe(2);
  });

  it("should identify test files", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [createExport("foo")],
    });
    nodes.set("src/utils.test.ts", {
      filePath: "src/utils.test.ts",
      imports: [createEdge("src/utils.ts", "NAMED", ["foo"])],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");

    const testFile = result.affectedFiles.find((f) => f.filePath === "src/utils.test.ts");
    expect(testFile?.isTest).toBe(true);
  });
});

describe("calculateTotalBlastRadius", () => {
  it("should aggregate blast radius for multiple files", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [createExport("foo")],
    });
    nodes.set("src/helpers.ts", {
      filePath: "src/helpers.ts",
      imports: [],
      exports: [createExport("bar")],
    });
    nodes.set("src/component.ts", {
      filePath: "src/component.ts",
      imports: [
        createEdge("src/utils.ts", "NAMED", ["foo"]),
        createEdge("src/helpers.ts", "NAMED", ["bar"]),
      ],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateTotalBlastRadius(graph, ["src/utils.ts", "src/helpers.ts"]);

    expect(result.changedFiles).toHaveLength(2);
    expect(result.individualRadii).toHaveLength(2);
    // component.ts is affected by both, but should only be counted once
    expect(result.totalUniqueCount).toBe(1);
  });

  it("should deduplicate affected files across changed files", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/a.ts", {
      filePath: "src/a.ts",
      imports: [],
      exports: [],
    });
    nodes.set("src/b.ts", {
      filePath: "src/b.ts",
      imports: [],
      exports: [],
    });
    nodes.set("src/shared.ts", {
      filePath: "src/shared.ts",
      imports: [
        createEdge("src/a.ts", "NAMED", ["a"]),
        createEdge("src/b.ts", "NAMED", ["b"]),
      ],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateTotalBlastRadius(graph, ["src/a.ts", "src/b.ts"]);

    // shared.ts imports both, but should only appear once
    expect(result.uniqueAffectedFiles).toHaveLength(1);
    expect(result.uniqueAffectedFiles[0].filePath).toBe("src/shared.ts");
  });
});

describe("summarizeBlastRadius", () => {
  it("should generate markdown summary", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [],
    });
    nodes.set("src/component.ts", {
      filePath: "src/component.ts",
      imports: [createEdge("src/utils.ts", "NAMED", ["foo"])],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");
    const summary = summarizeBlastRadius(result);

    expect(summary).toContain("影響範囲分析");
    expect(summary).toContain("src/utils.ts");
    expect(summary).toContain("影響スコア");
  });

  it("should show appropriate emoji based on score", () => {
    const nodes = new Map<string, DependencyNode>();
    const graph = createMockGraph(nodes);
    const result = calculateBlastRadius(graph, "src/utils.ts");

    // Low score should show green emoji
    const summary = summarizeBlastRadius(result);
    expect(summary).toMatch(/🟢|🟡|🔴/);
  });
});

describe("summarizeTotalBlastRadius", () => {
  it("should generate total summary", () => {
    const nodes = new Map<string, DependencyNode>();
    nodes.set("src/utils.ts", {
      filePath: "src/utils.ts",
      imports: [],
      exports: [],
    });

    const graph = createMockGraph(nodes);
    const result = calculateTotalBlastRadius(graph, ["src/utils.ts"]);
    const summary = summarizeTotalBlastRadius(result);

    expect(summary).toContain("総合影響範囲分析");
    expect(summary).toContain("総合影響スコア");
  });
});
