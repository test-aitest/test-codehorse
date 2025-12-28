// Adaptive Learning Memory 型定義

import type { RuleType, RuleSource } from "@prisma/client";

/**
 * 抽出されたルール
 */
export interface ExtractedRule {
  ruleText: string;
  ruleType: RuleType;
  confidence: number;
  language?: string;
  category?: string;
  reasoning: string; // なぜこのルールが推論されたか
}

/**
 * フィードバックのコンテキスト
 */
export interface FeedbackContext {
  aiSuggestion: string;
  userCode?: string;
  fileContent?: string;
  filePath: string;
  language: string;
  prTitle?: string;
  userExplanation?: string;
}

/**
 * ルール抽出の結果
 */
export interface RuleExtractionResult {
  rules: ExtractedRule[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * ルール検索結果（RAG用）
 */
export interface RetrievedRule {
  ruleId: string;
  ruleText: string;
  ruleType: RuleType;
  source: RuleSource;
  confidence: number;
  score: number; // 検索スコア
}

/**
 * コスト制御用の制限
 */
export const LEARNING_LIMITS = {
  MAX_RULES_PER_ORG: 500,
  MAX_RULES_PER_DAY: 20,
  MIN_CONFIDENCE_THRESHOLD: 0.3,
  RULE_TTL_DAYS: 180,
  MAX_FEEDBACK_BATCH_SIZE: 5,
  CONFIDENCE_DECAY_RATE: 0.05, // 月ごとの減衰率
} as const;

/**
 * フィードバックシグナルの種類と重み
 */
export const FEEDBACK_WEIGHTS = {
  thumbs_down: -0.3, // 明示的な拒否
  thumbs_up: 0.2, // 明示的な承認
  suggestion_applied: 0.15, // 提案の適用
  confused: -0.1, // 混乱
  explicit_rule: 0.5, // 明示的なルール指定
} as const;

/**
 * 言語の検出パターン
 */
export const LANGUAGE_PATTERNS: Record<string, RegExp> = {
  typescript: /\.(tsx?|mts|cts)$/,
  javascript: /\.(jsx?|mjs|cjs)$/,
  python: /\.py$/,
  go: /\.go$/,
  rust: /\.rs$/,
  java: /\.java$/,
  kotlin: /\.kt$/,
  swift: /\.swift$/,
  ruby: /\.rb$/,
  php: /\.php$/,
  csharp: /\.cs$/,
  cpp: /\.(cpp|cc|cxx|hpp|h)$/,
};

/**
 * ファイルパスから言語を検出
 */
export function detectLanguage(filePath: string): string | undefined {
  for (const [language, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    if (pattern.test(filePath)) {
      return language;
    }
  }
  return undefined;
}
