/**
 * Phase 5: Public API Detector Tests
 */

import { describe, it, expect } from "vitest";
import {
  detectPublicAPIs,
  determineAPISeverity,
} from "../public-api-detector";

describe("detectPublicAPIs", () => {
  describe("関数のエクスポート検出", () => {
    it("名前付きエクスポート関数を検出", () => {
      const content = `
/**
 * ユーザーを取得
 * @param id ユーザーID
 * @returns ユーザー情報
 */
export function getUser(id: string): User {
  return users.find(u => u.id === id);
}
      `;

      const result = detectPublicAPIs("src/api.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("getUser");
      expect(result.apis[0].symbolType).toBe("FUNCTION");
      expect(result.apis[0].hasJSDoc).toBe(true);
      expect(result.apis[0].exportType).toBe("named");
    });

    it("デフォルトエクスポート関数を検出", () => {
      const content = `
export default function main(): void {
  console.log("main");
}
      `;

      const result = detectPublicAPIs("src/main.ts", content);

      // デフォルトエクスポート関数が検出される
      const defaultExport = result.apis.find(a => a.exportType === "default");
      expect(defaultExport).toBeDefined();
      expect(defaultExport?.hasJSDoc).toBe(false);
    });

    it("アロー関数のエクスポートを検出", () => {
      const content = `
/** 値を2倍にする */
export const double = (n: number): number => n * 2;
      `;

      const result = detectPublicAPIs("src/utils.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("double");
      expect(result.apis[0].hasJSDoc).toBe(true);
    });
  });

  describe("クラスのエクスポート検出", () => {
    it("エクスポートされたクラスを検出", () => {
      const content = `
/**
 * ユーザーサービス
 */
export class UserService {
  /**
   * ユーザーを取得
   */
  getUser(id: string): User {
    return this.users.find(u => u.id === id);
  }
}
      `;

      const result = detectPublicAPIs("src/services/user.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("UserService");
      expect(result.apis[0].symbolType).toBe("CLASS");
      expect(result.apis[0].hasJSDoc).toBe(true);
      expect(result.apis[0].members?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("インターフェース/型のエクスポート検出", () => {
    it("エクスポートされたインターフェースを検出", () => {
      const content = `
/**
 * ユーザー型
 */
export interface User {
  id: string;
  name: string;
  email: string;
}
      `;

      const result = detectPublicAPIs("src/types.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("User");
      expect(result.apis[0].symbolType).toBe("INTERFACE");
      expect(result.apis[0].hasJSDoc).toBe(true);
    });

    it("エクスポートされた型エイリアスを検出", () => {
      const content = `
/** ユーザーIDの型 */
export type UserId = string;
      `;

      const result = detectPublicAPIs("src/types.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("UserId");
      expect(result.apis[0].symbolType).toBe("TYPE");
    });
  });

  describe("enumのエクスポート検出", () => {
    it("エクスポートされたenumを検出", () => {
      const content = `
/** ステータス */
export enum Status {
  ACTIVE = "active",
  INACTIVE = "inactive",
}
      `;

      const result = detectPublicAPIs("src/enums.ts", content);

      expect(result.apis.length).toBe(1);
      expect(result.apis[0].name).toBe("Status");
      expect(result.apis[0].symbolType).toBe("ENUM");
    });
  });

  describe("統計情報", () => {
    it("正しい統計情報を計算", () => {
      const content = `
/** ドキュメント済み関数 */
export function documented(): void {}

export function undocumented(): void {}

/** ドキュメント済みクラス */
export class MyClass {}
      `;

      const result = detectPublicAPIs("src/mixed.ts", content);

      expect(result.stats.totalApis).toBe(3);
      expect(result.stats.documentedApis).toBe(2);
      expect(result.stats.undocumentedApis).toBe(1);
      expect(result.stats.documentationRate).toBeCloseTo(66.67, 1);
    });
  });

  describe("テストファイルのスキップ", () => {
    it("テストファイルはスキップする", () => {
      const content = `
export function helper(): void {}
      `;

      const result = detectPublicAPIs("src/utils.test.ts", content);

      expect(result.apis.length).toBe(0);
    });

    it(".specファイルもスキップする", () => {
      const content = `
export function helper(): void {}
      `;

      const result = detectPublicAPIs("src/utils.spec.ts", content);

      expect(result.apis.length).toBe(0);
    });
  });
});

describe("determineAPISeverity", () => {
  it("デフォルトエクスポートはCRITICAL", () => {
    const api = {
      name: "main",
      symbolType: "FUNCTION" as const,
      filePath: "src/main.ts",
      lineNumber: 1,
      exportType: "default" as const,
      hasJSDoc: false,
      isWidelyUsed: true,
      docQualityScore: 0,
    };

    expect(determineAPISeverity(api)).toBe("CRITICAL");
  });

  it("クラスはHIGH", () => {
    const api = {
      name: "MyClass",
      symbolType: "CLASS" as const,
      filePath: "src/api.ts",
      lineNumber: 1,
      exportType: "named" as const,
      hasJSDoc: false,
      isWidelyUsed: true,
      docQualityScore: 30,
    };

    expect(determineAPISeverity(api)).toBe("HIGH");
  });

  it("多パラメータ関数はHIGH", () => {
    const api = {
      name: "complexFunc",
      symbolType: "FUNCTION" as const,
      filePath: "src/api.ts",
      lineNumber: 1,
      exportType: "named" as const,
      hasJSDoc: true,
      isWidelyUsed: false,
      docQualityScore: 80,
      parameters: [
        { name: "a", type: "string", isOptional: false, hasDefault: false, hasDoc: false },
        { name: "b", type: "number", isOptional: false, hasDefault: false, hasDoc: false },
        { name: "c", type: "boolean", isOptional: false, hasDefault: false, hasDoc: false },
      ],
    };

    expect(determineAPISeverity(api)).toBe("HIGH");
  });

  it("通常の関数はMEDIUM", () => {
    const api = {
      name: "simpleFunc",
      symbolType: "FUNCTION" as const,
      filePath: "src/api.ts",
      lineNumber: 1,
      exportType: "named" as const,
      hasJSDoc: false,
      isWidelyUsed: false,
      docQualityScore: 0,
    };

    expect(determineAPISeverity(api)).toBe("MEDIUM");
  });
});
