/**
 * Phase 10: Auth Analyzer Tests
 */

import { describe, it, expect } from "vitest";
import { analyzeAuth } from "../auth-analyzer";

describe("analyzeAuth", () => {
  describe("JWT検証", () => {
    it("jwt.decodeの使用を検出する", () => {
      const code = `
        const payload = jwt.decode(token);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("BROKEN_AUTH");
      expect(vulnerabilities[0].patternId).toBe("jwt-no-verify");
    });
  });

  describe("Cookie設定", () => {
    it("secure: falseを検出する", () => {
      const code = `
        app.use(session({
          cookie: {
            secure: false,
            httpOnly: true
          }
        }));
      `;

      const vulnerabilities = analyzeAuth(code, "config.ts");

      const secureFalseVulns = vulnerabilities.filter(
        v => v.patternId === "session-insecure-cookie"
      );
      expect(secureFalseVulns.length).toBeGreaterThan(0);
    });

    it("httpOnly: falseを検出する", () => {
      const code = `
        app.use(session({
          cookie: {
            httpOnly: false
          }
        }));
      `;

      const vulnerabilities = analyzeAuth(code, "config.ts");

      const httpOnlyFalseVulns = vulnerabilities.filter(
        v => v.patternId === "session-no-httponly"
      );
      expect(httpOnlyFalseVulns.length).toBeGreaterThan(0);
    });

    it("sameSite: 'none'を検出する", () => {
      const code = `
        app.use(session({
          cookie: {
            sameSite: 'none'
          }
        }));
      `;

      const vulnerabilities = analyzeAuth(code, "config.ts");

      const sameSiteVulns = vulnerabilities.filter(
        v => v.patternId === "session-no-samesite"
      );
      expect(sameSiteVulns.length).toBeGreaterThan(0);
    });
  });

  describe("パスワードハッシュ", () => {
    it("bcryptの低いラウンド数を検出する", () => {
      const code = `
        const hash = await bcrypt.hash(password, 5);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      const bcryptVulns = vulnerabilities.filter(
        v => v.patternId === "bcrypt-low-rounds"
      );
      expect(bcryptVulns.length).toBeGreaterThan(0);
    });

    it("MD5ハッシュの使用を検出する", () => {
      const code = `
        const hash = crypto.createHash('md5').update(password).digest('hex');
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].patternId).toBe("weak-password-hash");
    });

    it("SHA1ハッシュの使用を検出する", () => {
      const code = `
        const hash = crypto.createHash('sha1').update(password).digest('hex');
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].patternId).toBe("weak-password-hash");
    });
  });

  describe("安全でない乱数生成", () => {
    it("セキュリティコンテキストでのMath.random()を検出する", () => {
      const code = `
        function generateToken() {
          return Math.random().toString(36);
        }
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      const randomVulns = vulnerabilities.filter(
        v => v.patternId === "insecure-random"
      );
      expect(randomVulns.length).toBeGreaterThan(0);
    });
  });

  describe("オープンリダイレクト", () => {
    it("req.queryを使用したリダイレクトを検出する", () => {
      const code = `
        res.redirect(req.query.returnUrl);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("OPEN_REDIRECT");
    });
  });

  describe("CORS設定ミス", () => {
    it("origin: '*'を検出する", () => {
      const code = `
        app.use(cors({
          origin: '*'
        }));
      `;

      const vulnerabilities = analyzeAuth(code, "config.ts");

      const corsVulns = vulnerabilities.filter(
        v => v.patternId === "cors-wildcard"
      );
      expect(corsVulns.length).toBeGreaterThan(0);
    });
  });

  describe("機密情報のログ出力", () => {
    it("パスワードのログ出力を検出する", () => {
      const code = `
        console.log("Login attempt:", { username, password });
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].patternId).toBe("password-logging");
    });

    it("トークンのログ出力を検出する", () => {
      const code = `
        console.log("Generated token:", token);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe("安全でないデシリアライゼーション", () => {
    it("req.bodyの直接デシリアライズを検出する", () => {
      const code = `
        const data = JSON.parse(req.body);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("INSECURE_DESERIALIZATION");
    });
  });

  describe("パストラバーサル", () => {
    it("ユーザー入力を使用したfs.readFileを検出する", () => {
      const code = `
        const content = fs.readFile(req.query.filename);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("PATH_TRAVERSAL");
    });

    it("ユーザー入力を使用したpath.joinを検出する", () => {
      const code = `
        const filepath = path.join(basePath, req.params.file);
        fs.readFile(filepath);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      const pathVulns = vulnerabilities.filter(
        v => v.vulnerabilityType === "PATH_TRAVERSAL"
      );
      expect(pathVulns.length).toBeGreaterThan(0);
    });
  });

  describe("コマンドインジェクション", () => {
    it("exec内のユーザー入力を検出する", () => {
      const code = `
        const result = exec(\`ls \${req.query.dir}\`);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("COMMAND_INJECTION");
      expect(vulnerabilities[0].severity).toBe("CRITICAL");
    });

    it("child_process.exec内のユーザー入力を検出する", () => {
      const code = `
        child_process.exec("git " + req.body.command);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe("プロトタイプ汚染", () => {
    it("Object.assignとユーザー入力を検出する", () => {
      const code = `
        Object.assign(config, req.body);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
      expect(vulnerabilities[0].vulnerabilityType).toBe("PROTOTYPE_POLLUTION");
    });

    it("lodash.mergeとユーザー入力を検出する", () => {
      const code = `
        _.merge(settings, req.body);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe("除外パターン", () => {
    it("テストファイルはスキップする", () => {
      const code = `
        const hash = crypto.createHash('md5').update(password).digest('hex');
      `;

      const vulnerabilities = analyzeAuth(code, "auth.test.ts");

      expect(vulnerabilities.length).toBe(0);
    });

    it("fixturesディレクトリはスキップする", () => {
      const code = `
        const hash = crypto.createHash('md5').update(password).digest('hex');
      `;

      const vulnerabilities = analyzeAuth(code, "fixtures/auth.ts");

      expect(vulnerabilities.length).toBe(0);
    });

    it("コメント内のコードは検出しない", () => {
      const code = `
        // const payload = jwt.decode(token);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities.length).toBe(0);
    });
  });

  describe("CWE/OWASP", () => {
    it("認証問題にはOWASP A07を報告する", () => {
      const code = `
        const payload = jwt.decode(token);
      `;

      const vulnerabilities = analyzeAuth(code, "auth.ts");

      expect(vulnerabilities[0].owaspCategory).toBe("A07");
    });

    it("コマンドインジェクションにはCWE-78を報告する", () => {
      const code = `
        exec(\`ls \${req.query.dir}\`);
      `;

      const vulnerabilities = analyzeAuth(code, "api.ts");

      expect(vulnerabilities[0].cweId).toBe("CWE-78");
    });
  });
});
