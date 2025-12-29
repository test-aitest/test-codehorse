/**
 * Phase 7: Draft to Ready Analyzer
 *
 * ドラフトから準備完了への変更を分析
 */

import type { Octokit } from "octokit";
import { parseDiff } from "@/lib/diff/parser";
import type { ParsedDiff, ParsedFile } from "@/lib/diff/types";

// ========================================
// 型定義
// ========================================

export interface DraftToReadyAnalysis {
  /** ドラフト時のコミットSHA */
  draftCommitSha: string;
  /** 現在のコミットSHA */
  readyCommitSha: string;
  /** 変更されたファイル数 */
  filesChanged: number;
  /** 追加行数 */
  additions: number;
  /** 削除行数 */
  deletions: number;
  /** 変更の概要 */
  summary: DraftChangeSummary;
  /** 詳細な変更内容 */
  changes: DraftChangeDetail[];
  /** 差分の生データ */
  rawDiff: string;
  /** パースされた差分 */
  parsedDiff: ParsedDiff;
}

export interface DraftChangeSummary {
  /** 変更の規模 */
  scale: "small" | "medium" | "large";
  /** 新しいファイルが追加されたか */
  hasNewFiles: boolean;
  /** ファイルが削除されたか */
  hasDeletedFiles: boolean;
  /** 名前変更されたファイルがあるか */
  hasRenamedFiles: boolean;
  /** 主に修正されたファイルタイプ */
  primaryFileTypes: string[];
  /** 変更の説明 */
  description: string;
}

export interface DraftChangeDetail {
  /** ファイルパス */
  filePath: string;
  /** 変更タイプ */
  changeType: "added" | "modified" | "deleted" | "renamed";
  /** 追加行数 */
  additions: number;
  /** 削除行数 */
  deletions: number;
  /** 変更前のパス（リネームの場合） */
  oldPath?: string;
}

// ========================================
// メイン関数
// ========================================

/**
 * ドラフトから準備完了への変更を分析
 */
export async function analyzeDraftToReadyChanges(
  octokit: Octokit,
  owner: string,
  repo: string,
  draftCommitSha: string,
  readyCommitSha: string
): Promise<DraftToReadyAnalysis> {
  // ドラフト時と現在のコミットの差分を取得
  const { data: comparison } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: draftCommitSha,
    head: readyCommitSha,
    mediaType: { format: "diff" },
  });

  const rawDiff = comparison as unknown as string;
  const parsedDiff = parseDiff(rawDiff);

  // 変更の詳細を分析
  const changes = analyzeFileChanges(parsedDiff.files);
  const summary = generateChangeSummary(changes, parsedDiff);

  return {
    draftCommitSha,
    readyCommitSha,
    filesChanged: parsedDiff.files.length,
    additions: parsedDiff.totalAdditions,
    deletions: parsedDiff.totalDeletions,
    summary,
    changes,
    rawDiff,
    parsedDiff,
  };
}

/**
 * ファイル変更を分析
 */
function analyzeFileChanges(files: ParsedFile[]): DraftChangeDetail[] {
  return files.map((file) => {
    // ファイルタイプから変更タイプを決定
    let changeType: DraftChangeDetail["changeType"];
    switch (file.type) {
      case "add":
        changeType = "added";
        break;
      case "delete":
        changeType = "deleted";
        break;
      case "rename":
        changeType = "renamed";
        break;
      default:
        changeType = "modified";
    }

    return {
      filePath: file.newPath,
      changeType,
      additions: file.additions,
      deletions: file.deletions,
      oldPath: file.type === "rename" ? file.oldPath : undefined,
    };
  });
}

/**
 * 変更の概要を生成
 */
function generateChangeSummary(
  changes: DraftChangeDetail[],
  parsedDiff: ParsedDiff
): DraftChangeSummary {
  const totalChanges = parsedDiff.totalAdditions + parsedDiff.totalDeletions;

  // 変更の規模を判定
  let scale: DraftChangeSummary["scale"];
  if (totalChanges < 50) {
    scale = "small";
  } else if (totalChanges < 200) {
    scale = "medium";
  } else {
    scale = "large";
  }

  // 変更タイプの確認
  const hasNewFiles = changes.some((c) => c.changeType === "added");
  const hasDeletedFiles = changes.some((c) => c.changeType === "deleted");
  const hasRenamedFiles = changes.some((c) => c.changeType === "renamed");

  // ファイルタイプを集計
  const fileTypes = new Map<string, number>();
  for (const change of changes) {
    const ext = getFileExtension(change.filePath);
    fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
  }

  // 主なファイルタイプを取得（上位3つ）
  const primaryFileTypes = [...fileTypes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ext]) => ext);

  // 説明を生成
  const description = generateChangeDescription(
    changes,
    parsedDiff,
    scale,
    hasNewFiles,
    hasDeletedFiles
  );

  return {
    scale,
    hasNewFiles,
    hasDeletedFiles,
    hasRenamedFiles,
    primaryFileTypes,
    description,
  };
}

/**
 * 変更の説明を生成
 */
function generateChangeDescription(
  changes: DraftChangeDetail[],
  parsedDiff: ParsedDiff,
  scale: DraftChangeSummary["scale"],
  hasNewFiles: boolean,
  hasDeletedFiles: boolean
): string {
  const parts: string[] = [];

  // 規模
  const scaleText = {
    small: "軽微な",
    medium: "中程度の",
    large: "大規模な",
  };
  parts.push(`${scaleText[scale]}変更`);

  // ファイル数
  parts.push(`（${changes.length}ファイル）`);

  // 追加・削除
  if (hasNewFiles || hasDeletedFiles) {
    const actions: string[] = [];
    if (hasNewFiles) actions.push("ファイル追加");
    if (hasDeletedFiles) actions.push("ファイル削除");
    parts.push(`を含む（${actions.join("・")}）`);
  }

  // 行数
  parts.push(
    `。+${parsedDiff.totalAdditions}/-${parsedDiff.totalDeletions}行。`
  );

  return parts.join("");
}

// ========================================
// フォーマット関数
// ========================================

/**
 * ドラフトからの変更をPRコメント用にフォーマット
 */
export function formatDraftChangesForPR(
  analysis: DraftToReadyAnalysis
): string {
  const lines: string[] = [];

  lines.push("## 📊 Draft → Ready 変更サマリー");
  lines.push("");
  lines.push(analysis.summary.description);
  lines.push("");

  // 変更統計
  lines.push("### 📈 変更統計");
  lines.push("");
  lines.push(`| 項目 | 値 |`);
  lines.push(`|------|-----|`);
  lines.push(`| ファイル数 | ${analysis.filesChanged} |`);
  lines.push(`| 追加行 | +${analysis.additions} |`);
  lines.push(`| 削除行 | -${analysis.deletions} |`);
  lines.push(
    `| ドラフト時コミット | \`${analysis.draftCommitSha.slice(0, 7)}\` |`
  );
  lines.push(
    `| 現在のコミット | \`${analysis.readyCommitSha.slice(0, 7)}\` |`
  );
  lines.push("");

  // ファイル変更リスト（上位10件）
  if (analysis.changes.length > 0) {
    lines.push("### 📁 変更ファイル");
    lines.push("");

    const displayChanges = analysis.changes.slice(0, 10);
    for (const change of displayChanges) {
      const icon = getChangeTypeIcon(change.changeType);
      const stats = `+${change.additions}/-${change.deletions}`;
      lines.push(`- ${icon} \`${change.filePath}\` (${stats})`);
    }

    if (analysis.changes.length > 10) {
      lines.push(
        `- ... and ${analysis.changes.length - 10} more files`
      );
    }
    lines.push("");
  }

  // 注意事項
  if (analysis.summary.scale === "large") {
    lines.push("> ⚠️ **大規模な変更**: ドラフト時から多くの変更があります。");
    lines.push("> 詳細なレビューをお勧めします。");
  }

  return lines.join("\n");
}

/**
 * 変更サマリーを簡潔なテキストで取得
 */
export function getShortChangeSummary(
  analysis: DraftToReadyAnalysis
): string {
  const { filesChanged, additions, deletions, summary } = analysis;

  return `${summary.scale} changes: ${filesChanged} files, +${additions}/-${deletions} lines`;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * ファイル拡張子を取得
 */
function getFileExtension(filePath: string): string {
  const parts = filePath.split(".");
  if (parts.length < 2) return "other";
  return parts[parts.length - 1].toLowerCase();
}

/**
 * 変更タイプのアイコンを取得
 */
function getChangeTypeIcon(changeType: DraftChangeDetail["changeType"]): string {
  switch (changeType) {
    case "added":
      return "🆕";
    case "modified":
      return "📝";
    case "deleted":
      return "🗑️";
    case "renamed":
      return "📛";
    default:
      return "📄";
  }
}

/**
 * ドラフト時からの変更が重要か判定
 */
export function isSignificantChange(analysis: DraftToReadyAnalysis): boolean {
  // 大規模な変更は重要
  if (analysis.summary.scale === "large") return true;

  // 新しいファイルの追加は重要
  if (analysis.summary.hasNewFiles) return true;

  // ファイル削除は重要
  if (analysis.summary.hasDeletedFiles) return true;

  // 100行以上の変更は重要
  if (analysis.additions + analysis.deletions > 100) return true;

  return false;
}

/**
 * レビューコメントにドラフト変更情報を含めるか判定
 */
export function shouldIncludeDraftChangesInReview(
  analysis: DraftToReadyAnalysis
): boolean {
  // 変更がない場合は含めない
  if (analysis.filesChanged === 0) return false;

  // 軽微な変更（10行未満）は含めない
  if (analysis.additions + analysis.deletions < 10) return false;

  return true;
}
