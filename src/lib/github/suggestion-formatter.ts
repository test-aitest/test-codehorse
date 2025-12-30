/**
 * GitHub Suggestion Block Formatter
 * GitHubのワンクリック適用可能なコード提案形式に変換
 */

import { SEVERITY_EMOJI, RELEVANCE_EMOJI } from "../ai/constants";

/**
 * GitHubのsuggestion block形式でコード提案をフォーマット
 * https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks
 */
export function formatSuggestionBlock(suggestion: string): string {
  // ネストされたバッククォートの処理
  if (suggestion.includes("```")) {
    // 4重バッククォートを使用
    return `\`\`\`\`suggestion
${suggestion}
\`\`\`\``;
  }

  return `\`\`\`suggestion
${suggestion}
\`\`\``;
}

/**
 * 深刻度に対応する絵文字を取得
 */
export function getSeverityEmoji(severity: string): string {
  return SEVERITY_EMOJI[severity as keyof typeof SEVERITY_EMOJI] || "💬";
}

/**
 * 関連性カテゴリに対応する絵文字を取得
 */
export function getRelevanceCategoryEmoji(category: string): string {
  return RELEVANCE_EMOJI[category as keyof typeof RELEVANCE_EMOJI] || "";
}

/**
 * 関連性スコアをフォーマット
 */
export function formatRelevanceScore(
  score: number,
  category: string
): string {
  const categoryEmoji = getRelevanceCategoryEmoji(category);
  return ` | ${categoryEmoji} Relevance: ${score}/10 ${category}`;
}

/**
 * インラインコメントをGitHub形式に変換
 */
export function formatInlineCommentWithSuggestion(params: {
  body: string;
  severity: string;
  suggestion: string;
  relevanceScore: number;
  relevanceCategory: string;
}): string {
  const { body, severity, suggestion, relevanceScore, relevanceCategory } = params;
  const emoji = getSeverityEmoji(severity);
  const relevanceInfo = formatRelevanceScore(relevanceScore, relevanceCategory);

  let comment = `${emoji} **[${severity}]**${relevanceInfo}\n\n${body}`;

  if (suggestion) {
    comment += `\n\n${formatSuggestionBlock(suggestion)}`;
  }

  return comment;
}

/**
 * 複数行提案用のコメントを作成
 * GitHubのsuggestion blockは、コメントが付いている行に対してのみ適用可能
 * 複数行の場合はstart_lineを使用する必要がある
 */
export function createMultiLineSuggestionComment(params: {
  body: string;
  suggestion: string;
  severity: string;
  suggestionStartLine: number;
  suggestionEndLine: number;
  commentLine: number;
}): {
  body: string;
  needsStartLine: boolean;
  startLine?: number;
} {
  const {
    body,
    suggestion,
    severity,
    suggestionStartLine,
    suggestionEndLine,
    commentLine,
  } = params;

  // suggestionの範囲がコメント行と一致する場合
  if (suggestionEndLine === commentLine) {
    // start_lineが必要かどうか
    const needsStartLine = suggestionStartLine < commentLine;

    return {
      body: formatInlineCommentWithSuggestion({
        body,
        severity,
        suggestion,
        relevanceScore: 7,
        relevanceCategory: "MEDIUM",
      }),
      needsStartLine,
      startLine: needsStartLine ? suggestionStartLine : undefined,
    };
  }

  // 範囲が一致しない場合、折りたたみ形式で表示
  const emoji = getSeverityEmoji(severity);
  const rangeInfo = `行 ${suggestionStartLine}-${suggestionEndLine}`;

  const fallbackBody = `${emoji} **[${severity}]**

${body}

<details>
<summary>💡 修正提案 (${rangeInfo})</summary>

\`\`\`diff
${formatDiffSuggestion(suggestion)}
\`\`\`

</details>`;

  return {
    body: fallbackBody,
    needsStartLine: false,
  };
}

/**
 * 提案をdiff形式でフォーマット（フォールバック用）
 */
function formatDiffSuggestion(suggestion: string): string {
  const lines = suggestion.split("\n");
  return lines.map((line) => `+ ${line}`).join("\n");
}

/**
 * 提案が有効かどうかチェック
 * 空文字列や空白のみの提案は無効
 */
export function isValidSuggestion(suggestion: string): boolean {
  if (!suggestion) return false;
  return suggestion.trim().length > 0;
}
