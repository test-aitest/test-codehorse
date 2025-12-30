/**
 * Phase 1: Comment Fingerprint Generator
 *
 * セマンティックハッシュ生成モジュール
 * コメントの内容を正規化し、一意のフィンガープリントを生成する
 */

import { createHash } from "crypto";
import type { FingerprintInput, FingerprintResult } from "./types";

// ========================================
// カテゴリ検出パターン
// ========================================

/** カテゴリ検出のためのキーワードマッピング */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  security: [
    "sql injection",
    "xss",
    "csrf",
    "authentication",
    "authorization",
    "password",
    "secret",
    "token",
    "vulnerability",
    "injection",
    "sanitize",
    "escape",
    "セキュリティ",
    "脆弱性",
    "認証",
    "認可",
  ],
  performance: [
    "performance",
    "slow",
    "optimize",
    "cache",
    "memory",
    "leak",
    "n+1",
    "query",
    "latency",
    "bottleneck",
    "パフォーマンス",
    "最適化",
    "キャッシュ",
    "メモリリーク",
  ],
  style: [
    "naming",
    "convention",
    "format",
    "indent",
    "spacing",
    "consistent",
    "style",
    "camelcase",
    "snake_case",
    "命名",
    "規約",
    "フォーマット",
    "インデント",
  ],
  bug: [
    "bug",
    "error",
    "null",
    "undefined",
    "exception",
    "crash",
    "fix",
    "broken",
    "incorrect",
    "wrong",
    "バグ",
    "エラー",
    "例外",
    "不正",
  ],
  documentation: [
    "document",
    "comment",
    "jsdoc",
    "readme",
    "description",
    "explain",
    "ドキュメント",
    "コメント",
    "説明",
  ],
  testing: [
    "test",
    "coverage",
    "mock",
    "stub",
    "assertion",
    "expect",
    "テスト",
    "カバレッジ",
    "モック",
  ],
  architecture: [
    "architecture",
    "design",
    "pattern",
    "solid",
    "dependency",
    "coupling",
    "cohesion",
    "refactor",
    "アーキテクチャ",
    "設計",
    "パターン",
    "依存",
    "リファクタ",
  ],
  maintainability: [
    "maintainability",
    "readable",
    "complexity",
    "duplicate",
    "dry",
    "clean",
    "simplify",
    "保守性",
    "可読性",
    "複雑",
    "重複",
  ],
};

/** パターンタイプ検出のためのキーワードマッピング */
const PATTERN_TYPE_KEYWORDS: Record<string, string[]> = {
  // セキュリティ関連
  sql_injection: ["sql", "query", "injection", "prepared", "parameterized"],
  xss: ["xss", "innerhtml", "script", "sanitize", "escape", "dangerously"],
  hardcoded_secret: ["secret", "password", "api key", "token", "credential"],
  auth_issue: ["authentication", "authorization", "permission", "access"],

  // パフォーマンス関連
  n_plus_one: ["n+1", "query", "loop", "foreach", "multiple queries"],
  memory_leak: ["memory", "leak", "reference", "dispose", "cleanup"],
  unnecessary_render: ["render", "rerender", "usememo", "usecallback", "memo"],

  // コードスタイル
  naming_convention: ["naming", "name", "variable", "function", "class"],
  code_formatting: ["format", "indent", "spacing", "bracket", "semicolon"],

  // バグ関連
  null_check: ["null", "undefined", "optional", "check", "guard"],
  error_handling: ["error", "exception", "try", "catch", "throw"],
  type_mismatch: ["type", "typescript", "mismatch", "cast", "assertion"],

  // 設計関連
  code_duplication: ["duplicate", "duplicated", "copy", "repeated", "dry"],
  complexity: ["complex", "complexity", "cyclomatic", "nested", "simplify"],
  separation: ["separation", "concern", "responsibility", "single", "solid"],
};

// ========================================
// 正規化関数
// ========================================

/**
 * コメント本文を正規化する
 * - 小文字化
 * - 余分な空白を削除
 * - 特殊文字を正規化
 * - コードブロックを抽象化
 */
export function normalizeContent(body: string): string {
  let normalized = body;

  // コードブロックを抽象化（内容は無視、存在のみ記録）
  normalized = normalized.replace(/```[\s\S]*?```/g, "[CODE_BLOCK]");
  normalized = normalized.replace(/`[^`]+`/g, "[INLINE_CODE]");

  // 小文字化
  normalized = normalized.toLowerCase();

  // 余分な空白を正規化
  normalized = normalized.replace(/\s+/g, " ").trim();

  // URLを抽象化
  normalized = normalized.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // ファイルパスを抽象化
  normalized = normalized.replace(/(?:\/[\w.-]+)+(?:\.\w+)?/g, "[PATH]");

  // 行番号を抽象化
  normalized = normalized.replace(/line\s*\d+/gi, "[LINE]");

  // 数値を抽象化（ただしn+1のような重要なパターンは保持）
  normalized = normalized.replace(/(?<!n\+)\b\d+\b(?!\s*query)/gi, "[NUM]");

  return normalized;
}

// ストップワード定義（モジュールレベルで1回だけ生成）
const STOP_WORDS = new Set([
  // 英語
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare",
  "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by",
  "from", "as", "into", "through", "during", "before", "after", "above",
  "below", "between", "under", "again", "further", "then", "once",
  "here", "there", "when", "where", "why", "how", "all", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not", "only",
  "own", "same", "so", "than", "too", "very", "just", "but", "and",
  "or", "if", "this", "that", "these", "those", "it", "its",
  // 日本語
  "の", "に", "は", "を", "た", "が", "で", "て", "と", "し", "れ", "さ",
  "ある", "いる", "する", "から", "な", "こと", "として", "い", "や",
  "れる", "など", "なっ", "ない", "この", "ため", "その", "あっ", "よう",
  "また", "もの", "という", "あり",
  // プレースホルダー
  "[code_block]", "[inline_code]", "[url]", "[path]", "[line]", "[num]",
]);

// 全キーワードリストを事前に統合（モジュールレベルで1回だけ生成）
const ALL_KEYWORDS = new Set([
  ...Object.values(CATEGORY_KEYWORDS).flat(),
  ...Object.values(PATTERN_TYPE_KEYWORDS).flat(),
]);

/**
 * キーワードを抽出する
 */
export function extractKeywords(normalizedContent: string): string[] {
  const keywords: Set<string> = new Set();

  // 単語を抽出
  const words = normalizedContent
    .split(/[\s,.;:!?()[\]{}'"]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // 単語ベースのキーワード抽出
  for (const word of words) {
    // 技術用語っぽい単語（キャメルケース、スネークケースなど）
    if (/[A-Z]/.test(word) || word.includes("_")) {
      keywords.add(word);
      continue;
    }

    // 定義済みキーワードとのマッチング
    for (const kw of ALL_KEYWORDS) {
      if (word.includes(kw) || kw.includes(word)) {
        keywords.add(word);
        break;
      }
    }
  }

  // フレーズベースのキーワード抽出（複数単語のキーワード用）
  for (const keyword of ALL_KEYWORDS) {
    if (keyword.includes(" ") && normalizedContent.includes(keyword)) {
      keywords.add(keyword);
    }
  }

  return Array.from(keywords).slice(0, 20);
}

/**
 * キーワードマッピングからスコアベースで検出する共通関数
 */
function detectByKeywordScoring(
  normalizedContent: string,
  extractedKeywords: string[],
  keywordMapping: Record<string, string[]>,
  defaultValue: string
): string {
  const scores: Record<string, number> = {};

  for (const [key, mappedKeywords] of Object.entries(keywordMapping)) {
    scores[key] = 0;

    // コンテンツ内のキーワードマッチング
    for (const keyword of mappedKeywords) {
      if (normalizedContent.includes(keyword)) {
        scores[key] += keyword.length > 5 ? 2 : 1;
      }
    }

    // 抽出されたキーワードとの一致もチェック
    for (const kw of extractedKeywords) {
      if (mappedKeywords.some((mk) => mk.includes(kw) || kw.includes(mk))) {
        scores[key] += 1;
      }
    }
  }

  // 最高スコアのキーを返す
  const entries = Object.entries(scores);
  const maxEntry = entries.reduce((a, b) => (a[1] > b[1] ? a : b));

  return maxEntry[1] > 0 ? maxEntry[0] : defaultValue;
}

/**
 * カテゴリを自動検出する
 */
export function detectCategory(
  normalizedContent: string,
  keywords: string[],
  providedCategory?: string
): string {
  if (providedCategory) {
    return providedCategory;
  }
  return detectByKeywordScoring(
    normalizedContent,
    keywords,
    CATEGORY_KEYWORDS,
    "general"
  );
}

/**
 * パターンタイプを自動検出する
 */
export function detectPatternType(
  normalizedContent: string,
  keywords: string[],
  category: string,
  providedPatternType?: string
): string {
  if (providedPatternType) {
    return providedPatternType;
  }
  return detectByKeywordScoring(
    normalizedContent,
    keywords,
    PATTERN_TYPE_KEYWORDS,
    `${category}_general`
  );
}

// ========================================
// ハッシュ生成
// ========================================

/**
 * セマンティックハッシュを生成する
 */
export function generateHash(
  normalizedContent: string,
  category: string,
  patternType: string
): string {
  // ハッシュの入力を構築
  const hashInput = [category, patternType, normalizedContent].join("|");

  // SHA-256ハッシュを生成
  const hash = createHash("sha256").update(hashInput).digest("hex");

  // 最初の16文字を使用（衝突リスクは許容範囲）
  return hash.substring(0, 16);
}

// ========================================
// メイン関数
// ========================================

/**
 * コメントのフィンガープリントを生成する
 *
 * @param input フィンガープリント生成の入力
 * @returns フィンガープリント生成の結果
 */
export function generateFingerprint(
  input: FingerprintInput
): FingerprintResult {
  // 1. コンテンツを正規化
  const normalizedContent = normalizeContent(input.body);

  // 2. キーワードを抽出
  const keywords = extractKeywords(normalizedContent);

  // 3. カテゴリを検出
  const category = detectCategory(normalizedContent, keywords, input.category);

  // 4. パターンタイプを検出
  const patternType = detectPatternType(
    normalizedContent,
    keywords,
    category,
    input.patternType
  );

  // 5. ハッシュを生成
  const hash = generateHash(normalizedContent, category, patternType);

  return {
    hash,
    normalizedContent,
    keywords,
    category,
    patternType,
  };
}

/**
 * 2つのフィンガープリントの類似度を計算する
 * Jaccard係数を使用
 *
 * @param fp1 フィンガープリント1
 * @param fp2 フィンガープリント2
 * @returns 類似度スコア (0.0 - 1.0)
 */
export function calculateSimilarity(
  fp1: FingerprintResult,
  fp2: FingerprintResult
): number {
  // 完全一致の場合
  if (fp1.hash === fp2.hash) {
    return 1.0;
  }

  // カテゴリとパターンタイプが異なる場合は低い類似度
  if (fp1.category !== fp2.category) {
    return 0.0;
  }

  if (fp1.patternType !== fp2.patternType) {
    return 0.3; // 同じカテゴリだが異なるパターン
  }

  // キーワードのJaccard係数を計算
  const set1 = new Set(fp1.keywords);
  const set2 = new Set(fp2.keywords);

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) {
    return 0.5; // キーワードがない場合は中程度の類似度
  }

  const jaccardCoefficient = intersection.size / union.size;

  // パターンタイプが一致しているので、ベースの類似度を高くする
  return 0.5 + jaccardCoefficient * 0.5;
}

/**
 * コメントが類似しているかどうかを判定する
 *
 * @param body1 コメント1
 * @param body2 コメント2
 * @param threshold 類似度閾値（デフォルト: 0.85）
 * @returns 類似している場合はtrue
 */
export function areSimilar(
  body1: string,
  body2: string,
  threshold: number = 0.85
): boolean {
  const fp1 = generateFingerprint({ body: body1 });
  const fp2 = generateFingerprint({ body: body2 });

  return calculateSimilarity(fp1, fp2) >= threshold;
}
