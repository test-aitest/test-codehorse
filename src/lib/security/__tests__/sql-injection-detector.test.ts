/**
 * Phase 10: SQL Injection Detector Tests
 */

import { describe, it, expect } from "vitest";
import { detectSqlInjection } from "../sql-injection-detector";

describe("detectSqlInjection", () => {
  describe("テンプレートリテラルによるSQLインジェクション", () => {
    it("query関数内のテンプレートリテラルを検出する", () => {
      const code = `
        const result = await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("SQL_INJECTION");
      expect(vulnerabilities[0].severity).toBe("CRITICAL");
    });

    it("execute関数内のテンプレートリテラルを検出する", () => {
      const code = `
        await db.execute(\`INSERT INTO logs (message) VALUES ('\${message}')\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("SQL_INJECTION");
    });

    it("raw関数内のテンプレートリテラルを検出する", () => {
      const code = `
        const data = await prisma.raw(\`SELECT * FROM products WHERE name LIKE '%\${search}%'\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe("文字列連結によるSQLインジェクション", () => {
    it("+ 演算子による連結を検出する", () => {
      const code = `
        const result = await db.query("SELECT * FROM users WHERE name = '" + userName + "'");
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].severity).toBe("CRITICAL");
    });
  });

  describe("Prisma $queryRaw の危険な使用", () => {
    it("変数直接埋め込みを検出する", () => {
      const code = `
        const users = await prisma.$queryRaw\`SELECT * FROM users WHERE id = \${userId}\`;
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].patternId).toBe("prisma-raw-unsafe");
    });
  });

  describe("Prisma $executeRaw の危険な使用", () => {
    it("変数直接埋め込みを検出する", () => {
      const code = `
        await prisma.$executeRaw\`DELETE FROM sessions WHERE user_id = \${userId}\`;
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].patternId).toBe("prisma-execute-raw-unsafe");
    });
  });

  describe("Sequelize の危険なクエリ", () => {
    it("sequelize.query内の変数埋め込みを検出する", () => {
      const code = `
        const results = await sequelize.query(\`SELECT * FROM orders WHERE status = '\${status}'\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      // 汎用パターンまたはSequelize固有パターンで検出される
      expect(vulnerabilities[0].vulnerabilityType).toBe("SQL_INJECTION");
    });
  });

  describe("Knex の危険な使用", () => {
    it("knex.raw内の変数埋め込みを検出する", () => {
      const code = `
        const data = await knex.raw(\`SELECT * FROM items WHERE category = '\${category}'\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      // 汎用パターンまたはKnex固有パターンで検出される
      expect(vulnerabilities[0].vulnerabilityType).toBe("SQL_INJECTION");
    });
  });

  describe("MySQL/PostgreSQL の危険な使用", () => {
    it("connection.query内の変数埋め込みを検出する", () => {
      const code = `
        await connection.query(\`UPDATE users SET email = '\${email}' WHERE id = \${id}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });

    it("pool.query内の変数埋め込みを検出する", () => {
      const code = `
        const result = await pool.query(\`SELECT * FROM accounts WHERE username = '\${username}'\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });

    it("client.query内の変数埋め込みを検出する", () => {
      const code = `
        const { rows } = await client.query(\`SELECT * FROM posts WHERE author_id = \${authorId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe("安全なパターン（偽陽性の回避）", () => {
    it("パラメータ化クエリは検出しない", () => {
      const code = `
        const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBe(0);
    });

    it("静的クエリは検出しない", () => {
      const code = `
        const result = await db.query("SELECT * FROM users WHERE active = true");
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBe(0);
    });

    it("コメント内のコードは検出しない", () => {
      const code = `
        // await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities.length).toBe(0);
    });

    it("ブロックコメント内のコードは検出しない", () => {
      // Note: 現在のブロックコメント検出は行単位なので、
      // 複数行にまたがるブロックコメントの途中行は検出される可能性がある
      const code = `
        /* await db.query(\`SELECT * FROM users WHERE id = \${userId}\`); */
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      // ブロックコメントの開始と同じ行は除外される
      expect(vulnerabilities.length).toBe(0);
    });
  });

  describe("言語設定", () => {
    it("日本語で説明を取得できる", () => {
      const code = `
        await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts", "ja");

      expect(vulnerabilities[0].description).toContain("テンプレートリテラル");
      expect(vulnerabilities[0].remediation).toContain("パラメータ化クエリ");
    });

    it("英語で説明を取得できる", () => {
      const code = `
        await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts", "en");

      expect(vulnerabilities[0].description).toContain("template literal");
      expect(vulnerabilities[0].remediation).toContain("parameterized");
    });
  });

  describe("CWE/OWASPカテゴリ", () => {
    it("CWE-89を報告する", () => {
      const code = `
        await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities[0].cweId).toBe("CWE-89");
    });

    it("OWASP A03を報告する", () => {
      const code = `
        await db.query(\`SELECT * FROM users WHERE id = \${userId}\`);
      `;

      const vulnerabilities = detectSqlInjection(code, "test.ts");

      expect(vulnerabilities[0].owaspCategory).toBe("A03");
    });
  });
});
