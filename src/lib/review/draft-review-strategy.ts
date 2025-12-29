/**
 * Phase 7: Draft Review Strategy
 *
 * ドラフトPRと通常PRでレビュー深度を制御
 */

import type { ReviewDepth, Severity } from "@prisma/client";
import type { ParsedFile } from "@/lib/diff/types";

// ========================================
// 型定義
// ========================================

export interface ReviewStrategyOptions {
  /** レビュー深度 */
  reviewDepth: ReviewDepth;
  /** 最大コメント数 */
  maxComments?: number;
  /** 最小重要度（これ以上のみ報告） */
  minSeverity?: Severity;
  /** Walkthroughを含めるか */
  includeWalkthrough?: boolean;
  /** 図を含めるか */
  includeDiagram?: boolean;
  /** AIコンテキストの長さ制限 */
  maxContextLength?: number;
}

export interface FilteredReviewResult {
  /** フィルタリング後のコメント */
  comments: ReviewComment[];
  /** フィルタリングで除外されたコメント数 */
  filteredCount: number;
  /** フィルタリング理由の内訳 */
  filterReasons: Record<string, number>;
}

export interface ReviewComment {
  path: string;
  endLine: number;
  body: string;
  severity: Severity;
  category?: string;
}

// ========================================
// 定数
// ========================================

/** 軽量レビュー設定 */
const LIGHT_REVIEW_CONFIG: ReviewStrategyOptions = {
  reviewDepth: "LIGHT",
  maxComments: 5,
  minSeverity: "IMPORTANT", // CRITICAL と IMPORTANT のみ
  includeWalkthrough: false,
  includeDiagram: false,
  maxContextLength: 4000,
};

/** 完全レビュー設定 */
const FULL_REVIEW_CONFIG: ReviewStrategyOptions = {
  reviewDepth: "FULL",
  maxComments: 50,
  minSeverity: "NITPICK", // すべて含める
  includeWalkthrough: true,
  includeDiagram: true,
  maxContextLength: 16000,
};

/** 重要度の順序（高い順） */
const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  INFO: 2,
  NITPICK: 3,
};

// ========================================
// メイン関数
// ========================================

/**
 * レビュー深度に基づいた設定を取得
 */
export function getReviewStrategy(
  reviewDepth: ReviewDepth
): ReviewStrategyOptions {
  if (reviewDepth === "LIGHT") {
    return { ...LIGHT_REVIEW_CONFIG };
  }
  return { ...FULL_REVIEW_CONFIG };
}

/**
 * レビューコメントをフィルタリング
 */
export function filterCommentsByStrategy(
  comments: ReviewComment[],
  strategy: ReviewStrategyOptions
): FilteredReviewResult {
  const filterReasons: Record<string, number> = {};
  let filteredCount = 0;

  // 重要度でフィルタリング
  let filtered = comments.filter((comment) => {
    const commentOrder = SEVERITY_ORDER[comment.severity];
    const minOrder = SEVERITY_ORDER[strategy.minSeverity || "NITPICK"];

    if (commentOrder > minOrder) {
      filterReasons["severity_too_low"] =
        (filterReasons["severity_too_low"] || 0) + 1;
      filteredCount++;
      return false;
    }
    return true;
  });

  // コメント数制限
  if (strategy.maxComments && filtered.length > strategy.maxComments) {
    // 重要度の高い順にソート
    filtered.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );

    const removed = filtered.length - strategy.maxComments;
    filtered = filtered.slice(0, strategy.maxComments);
    filterReasons["max_comments_exceeded"] = removed;
    filteredCount += removed;
  }

  return {
    comments: filtered,
    filteredCount,
    filterReasons,
  };
}

/**
 * ドラフトPR用のプロンプト調整
 */
export function getDraftReviewPromptModifier(): string {
  return `
## ドラフトPRレビューモード

このPRはドラフト状態です。以下の点に注意してレビューしてください：

1. **重大な問題のみ報告**: セキュリティ問題、バグ、致命的な設計問題のみを指摘
2. **スタイルや軽微な改善は無視**: コードスタイル、命名規則、ドキュメント不足は指摘しない
3. **簡潔なコメント**: 詳細な説明は不要、問題点と解決策のみ
4. **建設的なトーン**: 開発途中であることを考慮した表現

レビューの目的は、開発者が重大な問題を早期に発見できるようにすることです。
`.trim();
}

/**
 * 準備完了PR用のプロンプト調整
 */
export function getReadyReviewPromptModifier(hasDraftDiff: boolean): string {
  if (!hasDraftDiff) {
    return "";
  }

  return `
## ドラフトからの変更を含むレビュー

このPRは以前ドラフト状態でした。ドラフト時から準備完了までの変更も含めて、
完全なレビューを行ってください。

ドラフト時に軽量レビューで報告した問題が修正されているかも確認してください。
`.trim();
}

/**
 * ファイルをレビュー深度に基づいてフィルタリング
 */
export function filterFilesByStrategy(
  files: ParsedFile[],
  strategy: ReviewStrategyOptions
): ParsedFile[] {
  if (strategy.reviewDepth === "FULL") {
    return files;
  }

  // 軽量レビューでは、大きすぎるファイルをスキップ
  const maxLinesPerFile = 500;
  const maxFiles = 10;

  return files
    .filter((file) => {
      const totalLines = file.hunks.reduce(
        (sum: number, hunk) => sum + hunk.changes.length,
        0
      );
      return totalLines <= maxLinesPerFile;
    })
    .slice(0, maxFiles);
}

/**
 * レビューサマリーのフォーマットを調整
 */
export function formatReviewSummary(
  summary: string,
  reviewDepth: ReviewDepth,
  isDraft: boolean
): string {
  const prefix = isDraft
    ? "## 🔨 Draft Review (Light)\n\n"
    : reviewDepth === "LIGHT"
    ? "## 🔍 Quick Review\n\n"
    : "## 📝 Full Review\n\n";

  const suffix = isDraft
    ? "\n\n---\n> 💡 This is a light review for draft PR. Full review will be performed when marked ready for review."
    : "";

  return prefix + summary + suffix;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 重要度が閾値以上か確認
 */
export function isSeverityAtLeast(
  severity: Severity,
  threshold: Severity
): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

/**
 * コメントをカテゴリ別にグループ化
 */
export function groupCommentsByCategory(
  comments: ReviewComment[]
): Record<string, ReviewComment[]> {
  const grouped: Record<string, ReviewComment[]> = {};

  for (const comment of comments) {
    const category = comment.category || "general";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(comment);
  }

  return grouped;
}

/**
 * 軽量レビューで報告すべきカテゴリか判定
 */
export function isHighPriorityCategory(category: string): boolean {
  const highPriorityCategories = [
    "security",
    "bug",
    "error",
    "crash",
    "memory_leak",
    "data_loss",
    "authentication",
    "authorization",
  ];

  return highPriorityCategories.includes(category.toLowerCase());
}

/**
 * レビュー深度に基づいたAIモデルパラメータを取得
 */
export function getModelParametersForDepth(reviewDepth: ReviewDepth): {
  maxTokens: number;
  temperature: number;
} {
  if (reviewDepth === "LIGHT") {
    return {
      maxTokens: 1000, // 短い応答
      temperature: 0.3, // より決定的
    };
  }

  return {
    maxTokens: 4000, // 詳細な応答
    temperature: 0.5, // バランスの取れた創造性
  };
}
