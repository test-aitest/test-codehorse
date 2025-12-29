/**
 * Phase 1: Comment Fingerprint Tests
 */

import { describe, it, expect } from "vitest";
import {
  generateFingerprint,
  calculateSimilarity,
  areSimilar,
  normalizeContent,
  extractKeywords,
  detectCategory,
  detectPatternType,
  generateHash,
} from "../comment-fingerprint";

describe("normalizeContent", () => {
  it("小文字化する", () => {
    const result = normalizeContent("SQL Injection Vulnerability");
    expect(result).toBe("sql injection vulnerability");
  });

  it("余分な空白を正規化する", () => {
    const result = normalizeContent("too   many    spaces");
    expect(result).toBe("too many spaces");
  });

  it("コードブロックを抽象化する", () => {
    const result = normalizeContent("Check this: ```const x = 1;``` code");
    expect(result).toContain("[code_block]");
    expect(result).not.toContain("const x = 1");
  });

  it("インラインコードを抽象化する", () => {
    const result = normalizeContent("Use `console.log` for debugging");
    expect(result).toContain("[inline_code]");
    expect(result).not.toContain("console.log");
  });

  it("URLを抽象化する", () => {
    const result = normalizeContent("See https://example.com/docs for more");
    expect(result).toContain("[URL]");
    expect(result).not.toContain("example.com");
  });

  it("ファイルパスを抽象化する", () => {
    const result = normalizeContent("Check /src/lib/utils.ts for details");
    expect(result).toContain("[PATH]");
  });

  it("行番号を抽象化する", () => {
    const result = normalizeContent("Error at line 42");
    expect(result).toContain("[LINE]");
    expect(result).not.toContain("42");
  });

  it("N+1パターンは保持する", () => {
    const result = normalizeContent("This is an N+1 query problem");
    expect(result).toContain("n+1");
  });
});

describe("extractKeywords", () => {
  it("セキュリティ関連キーワードを抽出する", () => {
    const normalized = "sql injection vulnerability in authentication";
    const keywords = extractKeywords(normalized);

    expect(keywords).toContain("sql");
    expect(keywords).toContain("injection");
    expect(keywords).toContain("vulnerability");
    expect(keywords).toContain("authentication");
  });

  it("パフォーマンス関連キーワードを抽出する", () => {
    const normalized = "n+1 query performance optimize needed";
    const keywords = extractKeywords(normalized);

    expect(keywords).toContain("n+1");
    expect(keywords).toContain("performance");
    expect(keywords).toContain("optimize");
  });

  it("ストップワードを除外する", () => {
    const normalized = "the quick brown fox is a test";
    const keywords = extractKeywords(normalized);

    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("is");
    expect(keywords).not.toContain("a");
  });

  it("最大20キーワードを返す", () => {
    const normalized = "a b c d e f g h i j k l m n o p q r s t u v w x y z " +
      "security vulnerability injection authentication authorization password secret token";
    const keywords = extractKeywords(normalized);

    expect(keywords.length).toBeLessThanOrEqual(20);
  });
});

describe("detectCategory", () => {
  it("セキュリティカテゴリを検出する", () => {
    const normalized = "sql injection vulnerability";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords);

    expect(category).toBe("security");
  });

  it("パフォーマンスカテゴリを検出する", () => {
    const normalized = "performance optimization needed for slow query";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords);

    expect(category).toBe("performance");
  });

  it("スタイルカテゴリを検出する", () => {
    const normalized = "naming convention for variable names";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords);

    expect(category).toBe("style");
  });

  it("バグカテゴリを検出する", () => {
    const normalized = "null pointer exception error handling";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords);

    expect(category).toBe("bug");
  });

  it("提供されたカテゴリを優先する", () => {
    const normalized = "sql injection vulnerability";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords, "custom");

    expect(category).toBe("custom");
  });

  it("検出できない場合はgeneralを返す", () => {
    const normalized = "random text without keywords";
    const keywords = extractKeywords(normalized);
    const category = detectCategory(normalized, keywords);

    expect(category).toBe("general");
  });
});

describe("detectPatternType", () => {
  it("SQLインジェクションパターンを検出する", () => {
    const normalized = "sql injection in query";
    const keywords = extractKeywords(normalized);
    const patternType = detectPatternType(normalized, keywords, "security");

    expect(patternType).toBe("sql_injection");
  });

  it("XSSパターンを検出する", () => {
    const normalized = "xss vulnerability in innerhtml";
    const keywords = extractKeywords(normalized);
    const patternType = detectPatternType(normalized, keywords, "security");

    expect(patternType).toBe("xss");
  });

  it("N+1クエリパターンを検出する", () => {
    const normalized = "n+1 query problem in loop";
    const keywords = extractKeywords(normalized);
    const patternType = detectPatternType(normalized, keywords, "performance");

    expect(patternType).toBe("n_plus_one");
  });

  it("メモリリークパターンを検出する", () => {
    const normalized = "memory leak reference not disposed";
    const keywords = extractKeywords(normalized);
    const patternType = detectPatternType(normalized, keywords, "performance");

    expect(patternType).toBe("memory_leak");
  });

  it("提供されたパターンタイプを優先する", () => {
    const normalized = "sql injection in query";
    const keywords = extractKeywords(normalized);
    const patternType = detectPatternType(normalized, keywords, "security", "custom_pattern");

    expect(patternType).toBe("custom_pattern");
  });
});

describe("generateHash", () => {
  it("同じ入力に対して同じハッシュを生成する", () => {
    const hash1 = generateHash("content", "category", "pattern");
    const hash2 = generateHash("content", "category", "pattern");

    expect(hash1).toBe(hash2);
  });

  it("異なる入力に対して異なるハッシュを生成する", () => {
    const hash1 = generateHash("content1", "category", "pattern");
    const hash2 = generateHash("content2", "category", "pattern");

    expect(hash1).not.toBe(hash2);
  });

  it("16文字のハッシュを生成する", () => {
    const hash = generateHash("content", "category", "pattern");

    expect(hash.length).toBe(16);
  });
});

describe("generateFingerprint", () => {
  it("フィンガープリントを生成する", () => {
    const result = generateFingerprint({
      body: "SQL Injection vulnerability detected",
    });

    expect(result.hash).toBeDefined();
    expect(result.hash.length).toBe(16);
    expect(result.normalizedContent).toBeDefined();
    expect(result.keywords).toBeDefined();
    expect(result.category).toBe("security");
    expect(result.patternType).toBe("sql_injection");
  });

  it("提供されたカテゴリを使用する", () => {
    const result = generateFingerprint({
      body: "Some comment",
      category: "custom",
    });

    expect(result.category).toBe("custom");
  });

  it("提供されたパターンタイプを使用する", () => {
    const result = generateFingerprint({
      body: "Some comment",
      patternType: "custom_pattern",
    });

    expect(result.patternType).toBe("custom_pattern");
  });

  it("同じ内容に対して同じハッシュを生成する", () => {
    const result1 = generateFingerprint({
      body: "SQL Injection vulnerability detected",
    });
    const result2 = generateFingerprint({
      body: "SQL Injection vulnerability detected",
    });

    expect(result1.hash).toBe(result2.hash);
  });

  it("異なる内容に対して異なるハッシュを生成する", () => {
    const result1 = generateFingerprint({
      body: "SQL Injection vulnerability",
    });
    const result2 = generateFingerprint({
      body: "XSS vulnerability detected",
    });

    expect(result1.hash).not.toBe(result2.hash);
  });
});

describe("calculateSimilarity", () => {
  it("同じハッシュに対して1.0を返す", () => {
    const fp1 = generateFingerprint({ body: "SQL Injection vulnerability" });
    const fp2 = generateFingerprint({ body: "SQL Injection vulnerability" });

    const similarity = calculateSimilarity(fp1, fp2);

    expect(similarity).toBe(1.0);
  });

  it("異なるカテゴリに対して0.0を返す", () => {
    const fp1 = generateFingerprint({ body: "SQL Injection", category: "security" });
    const fp2 = generateFingerprint({ body: "Performance issue", category: "performance" });

    const similarity = calculateSimilarity(fp1, fp2);

    expect(similarity).toBe(0.0);
  });

  it("同じカテゴリで異なるパターンタイプに対して0.3を返す", () => {
    const fp1 = generateFingerprint({
      body: "SQL Injection",
      category: "security",
      patternType: "sql_injection",
    });
    const fp2 = generateFingerprint({
      body: "XSS vulnerability",
      category: "security",
      patternType: "xss",
    });

    const similarity = calculateSimilarity(fp1, fp2);

    expect(similarity).toBe(0.3);
  });

  it("類似したコメントに対して高い類似度を返す", () => {
    const fp1 = generateFingerprint({
      body: "SQL Injection vulnerability in user input handling",
    });
    const fp2 = generateFingerprint({
      body: "SQL Injection risk with unescaped user input",
    });

    const similarity = calculateSimilarity(fp1, fp2);

    expect(similarity).toBeGreaterThan(0.5);
  });
});

describe("areSimilar", () => {
  it("同じコメントは類似している", () => {
    const result = areSimilar(
      "SQL Injection vulnerability detected",
      "SQL Injection vulnerability detected"
    );

    expect(result).toBe(true);
  });

  it("類似したコメントは類似している", () => {
    const result = areSimilar(
      "SQL Injection vulnerability in query",
      "SQL Injection risk in database query",
      0.5 // 閾値を下げる
    );

    expect(result).toBe(true);
  });

  it("異なるカテゴリのコメントは類似していない", () => {
    const result = areSimilar(
      "SQL Injection vulnerability",
      "Performance optimization needed"
    );

    expect(result).toBe(false);
  });

  it("閾値を調整できる", () => {
    // 低い閾値では類似
    const result1 = areSimilar(
      "SQL Injection issue",
      "SQL query vulnerability",
      0.3
    );
    expect(result1).toBe(true);

    // 高い閾値では非類似
    const result2 = areSimilar(
      "SQL Injection issue",
      "SQL query vulnerability",
      0.95
    );
    expect(result2).toBe(false);
  });
});

describe("日本語コメント", () => {
  it("日本語のセキュリティコメントを処理できる", () => {
    const result = generateFingerprint({
      body: "SQLインジェクションの脆弱性が検出されました",
    });

    expect(result.category).toBe("security");
  });

  it("日本語のパフォーマンスコメントを処理できる", () => {
    const result = generateFingerprint({
      body: "パフォーマンスの最適化が必要です",
    });

    expect(result.category).toBe("performance");
  });

  it("日本語コメントのキーワード抽出", () => {
    const normalized = normalizeContent("メモリリークの可能性があります");
    const keywords = extractKeywords(normalized);

    expect(keywords.length).toBeGreaterThan(0);
  });
});
