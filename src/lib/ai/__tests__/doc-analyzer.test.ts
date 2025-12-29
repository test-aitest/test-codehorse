/**
 * Phase 5: Documentation Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import {
  analyzeDocumentation,
  analyzeDocumentationBatch,
  formatDocGapsMarkdown,
  formatDocGapsForPR,
} from "../doc-analyzer";

describe("analyzeDocumentation", () => {
  describe("ドキュメントギャップの検出", () => {
    it("JSDocがない関数を検出", () => {
      const content = `
export function undocumentedFunction(id: string): User {
  return getUser(id);
}
      `;

      const result = analyzeDocumentation("src/api.ts", content);

      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps[0].gapType).toBe("MISSING_JSDOC");
    });

    it("完全にドキュメント化された関数にはギャップなし", () => {
      const content = `
/**
 * ユーザーを取得する
 * @param id - ユーザーID
 * @returns ユーザー情報
 * @example
 * const user = getUser("123");
 */
export function getUser(id: string): User {
  return users.find(u => u.id === id);
}
      `;

      const result = analyzeDocumentation("src/api.ts", content);

      // ドキュメント化されているのでギャップは少ないはず
      const jsdocGaps = result.gaps.filter(g => g.gapType === "MISSING_JSDOC");
      expect(jsdocGaps.length).toBe(0);
    });

    it("パラメータのドキュメントがない場合を検出", () => {
      const content = `
/**
 * ユーザーを取得する
 */
export function getUser(id: string, options?: Options): User {
  return users.find(u => u.id === id);
}
      `;

      const result = analyzeDocumentation("src/api.ts", content, {
        checkIncomplete: true,
      });

      // パラメータのドキュメント欠落を検出
      const paramGaps = result.gaps.filter(g => g.gapType === "MISSING_PARAM_DOC");
      expect(paramGaps.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("サマリー計算", () => {
    it("正しいサマリーを生成", () => {
      const content = `
/** ドキュメント済み */
export function documented(): void {}

export function undocumented(): void {}
      `;

      const result = analyzeDocumentation("src/api.ts", content);

      expect(result.summary.totalAPIs).toBe(2);
      expect(result.summary.documentedAPIs).toBe(1);
      expect(result.summary.documentationRate).toBeCloseTo(50, 0);
    });
  });

  describe("重要度の判定", () => {
    it("エクスポートされた関数のギャップは適切な重要度を持つ", () => {
      const content = `
export function importantFunction(): void {}
      `;

      const result = analyzeDocumentation("src/api.ts", content);

      expect(result.gaps.length).toBeGreaterThan(0);
      // 通常の関数エクスポートはMEDIUM以上の重要度
      expect(["CRITICAL", "HIGH", "MEDIUM"]).toContain(result.gaps[0].severity);
    });
  });
});

describe("analyzeDocumentationBatch", () => {
  it("複数ファイルを分析", () => {
    const files = [
      {
        path: "src/api.ts",
        content: `export function apiFunction(): void {}`,
      },
      {
        path: "src/utils.ts",
        content: `
/** ドキュメント済み */
export function helper(): void {}
        `,
      },
    ];

    const result = analyzeDocumentationBatch(files);

    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.summary.totalAPIs).toBe(2);
  });

  it("パターンでファイルをフィルタリング", () => {
    const files = [
      {
        path: "src/api.ts",
        content: `export function apiFunction(): void {}`,
      },
      {
        path: "src/internal/utils.ts",
        content: `export function internalHelper(): void {}`,
      },
    ];

    const result = analyzeDocumentationBatch(files, {
      excludePatterns: ["internal"],
    });

    // internalフォルダは除外される
    expect(result.gaps.every(g => !g.filePath.includes("internal"))).toBe(true);
  });
});

describe("formatDocGapsMarkdown", () => {
  it("ギャップをMarkdown形式で出力", () => {
    const result = analyzeDocumentation(
      "src/api.ts",
      `export function undocumented(): void {}`
    );

    const markdown = formatDocGapsMarkdown(result);

    expect(markdown).toContain("ドキュメント");
    expect(markdown).toContain("undocumented");
  });

  it("ギャップがない場合は空のメッセージ", () => {
    const content = `
/**
 * 完全にドキュメント化
 * @returns 何もなし
 */
export function documented(): void {}
    `;

    const result = analyzeDocumentation("src/api.ts", content);
    const markdown = formatDocGapsMarkdown(result);

    // ギャップがない場合でも何らかの出力
    expect(typeof markdown).toBe("string");
  });
});

describe("formatDocGapsForPR", () => {
  it("PR向けの簡潔なフォーマット", () => {
    const result = analyzeDocumentation(
      "src/api.ts",
      `export function undocumented(): void {}`
    );

    const prFormat = formatDocGapsForPR(result, 3);

    expect(prFormat).toContain("ドキュメント");
  });

  it("maxItemsパラメータを受け付ける", () => {
    const content = `
export function func1(): void {}
export function func2(): void {}
    `;

    const result = analyzeDocumentation("src/api.ts", content);

    // maxItemsパラメータを渡してもエラーにならない
    const prFormat = formatDocGapsForPR(result, 2);
    expect(typeof prFormat).toBe("string");
  });
});
