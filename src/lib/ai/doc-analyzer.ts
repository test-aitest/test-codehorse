/**
 * Phase 5: Documentation Analyzer
 *
 * ドキュメントのギャップを分析し、不足箇所を特定
 */

import { DocGapType, DocSeverity, SymbolType } from "@prisma/client";
import {
  detectPublicAPIs,
  type PublicAPI,
  type PublicAPIAnalysisResult,
  determineAPISeverity,
} from "@/lib/analysis/public-api-detector";

// ========================================
// 型定義
// ========================================

export interface DocumentationGap {
  /** ファイルパス */
  filePath: string;
  /** シンボル名 */
  symbolName: string;
  /** シンボルの種類 */
  symbolType: SymbolType;
  /** ドキュメント欠落の種類 */
  gapType: DocGapType;
  /** 重要度 */
  severity: DocSeverity;
  /** 行番号 */
  lineNumber: number;
  /** 現在のドキュメント（更新が必要な場合） */
  currentDoc?: string;
  /** 詳細な説明 */
  description: string;
  /** シグネチャ（関数の場合） */
  signature?: string;
}

export interface DocAnalysisResult {
  /** 検出されたギャップ */
  gaps: DocumentationGap[];
  /** API分析結果 */
  apiAnalysis: PublicAPIAnalysisResult;
  /** サマリー */
  summary: DocAnalysisSummary;
}

export interface DocAnalysisSummary {
  /** 総API数 */
  totalAPIs: number;
  /** ドキュメント済みAPI数 */
  documentedAPIs: number;
  /** ドキュメント率 */
  documentationRate: number;
  /** 重要度別ギャップ数 */
  gapsBySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** 種類別ギャップ数 */
  gapsByType: Record<DocGapType, number>;
}

export interface DocAnalysisOptions {
  /** 最小重要度フィルタ */
  minSeverity?: DocSeverity;
  /** 最大ギャップ数 */
  maxGaps?: number;
  /** 特定のファイルパスパターンを含める */
  includePatterns?: string[];
  /** 特定のファイルパスパターンを除外 */
  excludePatterns?: string[];
  /** 不完全なドキュメントもチェック */
  checkIncomplete?: boolean;
}

// ========================================
// メイン関数
// ========================================

/**
 * ファイルのドキュメントギャップを分析
 */
export function analyzeDocumentation(
  filePath: string,
  content: string,
  options: DocAnalysisOptions = {}
): DocAnalysisResult {
  const apiResult = detectPublicAPIs(filePath, content);
  const gaps = detectDocumentationGaps(apiResult.apis, options);

  return {
    gaps,
    apiAnalysis: apiResult,
    summary: calculateSummary(apiResult, gaps),
  };
}

/**
 * 複数ファイルのドキュメントギャップを分析
 */
export function analyzeDocumentationBatch(
  files: Array<{ path: string; content: string }>,
  options: DocAnalysisOptions = {}
): DocAnalysisResult {
  const allGaps: DocumentationGap[] = [];
  let totalAPIs = 0;
  let documentedAPIs = 0;

  for (const file of files) {
    // パターンフィルタリング
    if (options.excludePatterns?.some(p => file.path.includes(p))) {
      continue;
    }
    if (options.includePatterns && !options.includePatterns.some(p => file.path.includes(p))) {
      continue;
    }

    const result = analyzeDocumentation(file.path, file.content, options);
    allGaps.push(...result.gaps);
    totalAPIs += result.apiAnalysis.stats.totalApis;
    documentedAPIs += result.apiAnalysis.stats.documentedApis;
  }

  // 重要度でソート
  const sortedGaps = sortGapsBySeverity(allGaps);

  // 最大数でカット
  const finalGaps = options.maxGaps
    ? sortedGaps.slice(0, options.maxGaps)
    : sortedGaps;

  return {
    gaps: finalGaps,
    apiAnalysis: {
      apis: [],
      errors: [],
      stats: {
        totalApis: totalAPIs,
        documentedApis: documentedAPIs,
        undocumentedApis: totalAPIs - documentedAPIs,
        documentationRate: totalAPIs > 0 ? (documentedAPIs / totalAPIs) * 100 : 100,
      },
    },
    summary: calculateSummaryFromGaps(finalGaps, totalAPIs, documentedAPIs),
  };
}

// ========================================
// ギャップ検出
// ========================================

function detectDocumentationGaps(
  apis: PublicAPI[],
  options: DocAnalysisOptions
): DocumentationGap[] {
  const gaps: DocumentationGap[] = [];

  for (const api of apis) {
    const apiGaps = detectAPIGaps(api, options);
    gaps.push(...apiGaps);
  }

  return gaps;
}

function detectAPIGaps(
  api: PublicAPI,
  options: DocAnalysisOptions
): DocumentationGap[] {
  const gaps: DocumentationGap[] = [];
  const severity = convertSeverity(determineAPISeverity(api));

  // 重要度フィルタ
  if (options.minSeverity && !isSeverityAtLeast(severity, options.minSeverity)) {
    return gaps;
  }

  // JSDocがない場合
  if (!api.hasJSDoc) {
    gaps.push({
      filePath: api.filePath,
      symbolName: api.name,
      symbolType: api.symbolType,
      gapType: "MISSING_JSDOC",
      severity,
      lineNumber: api.lineNumber,
      description: `${api.symbolType} \`${api.name}\` にJSDoc/TSDocがありません`,
      signature: api.signature,
    });
    return gaps; // JSDocがなければ他のチェックはスキップ
  }

  // 不完全なドキュメントをチェック
  if (options.checkIncomplete !== false) {
    gaps.push(...detectIncompleteDoc(api, severity));
  }

  return gaps;
}

function detectIncompleteDoc(
  api: PublicAPI,
  severity: DocSeverity
): DocumentationGap[] {
  const gaps: DocumentationGap[] = [];

  // パラメータドキュメントのチェック（関数の場合）
  if (api.parameters && api.parameters.length > 0) {
    const undocumentedParams = api.parameters.filter(p => !p.hasDoc);
    if (undocumentedParams.length > 0) {
      gaps.push({
        filePath: api.filePath,
        symbolName: api.name,
        symbolType: api.symbolType,
        gapType: "MISSING_PARAM_DOC",
        severity: decreaseSeverity(severity),
        lineNumber: api.lineNumber,
        currentDoc: api.jsDoc,
        description: `パラメータ ${undocumentedParams.map(p => `\`${p.name}\``).join(", ")} の説明がありません`,
        signature: api.signature,
      });
    }
  }

  // 戻り値ドキュメントのチェック
  if (api.returnType && api.returnType !== "void" && api.returnType !== "undefined") {
    if (api.jsDoc && !api.jsDoc.includes("@returns") && !api.jsDoc.includes("@return")) {
      gaps.push({
        filePath: api.filePath,
        symbolName: api.name,
        symbolType: api.symbolType,
        gapType: "MISSING_RETURN_DOC",
        severity: decreaseSeverity(severity),
        lineNumber: api.lineNumber,
        currentDoc: api.jsDoc,
        description: `戻り値 \`${api.returnType}\` の説明がありません`,
        signature: api.signature,
      });
    }
  }

  // 使用例のチェック（複雑な関数の場合）
  if (api.docQualityScore < 70 && api.parameters && api.parameters.length >= 2) {
    if (api.jsDoc && !api.jsDoc.includes("@example")) {
      gaps.push({
        filePath: api.filePath,
        symbolName: api.name,
        symbolType: api.symbolType,
        gapType: "MISSING_EXAMPLE",
        severity: "LOW",
        lineNumber: api.lineNumber,
        currentDoc: api.jsDoc,
        description: `使用例（@example）がありません`,
        signature: api.signature,
      });
    }
  }

  // クラス/インターフェースのメンバードキュメントチェック
  if (api.members && api.members.length > 0) {
    const undocumentedMembers = api.members.filter(m => !m.hasDoc);
    if (undocumentedMembers.length > 0 && undocumentedMembers.length / api.members.length > 0.5) {
      gaps.push({
        filePath: api.filePath,
        symbolName: api.name,
        symbolType: api.symbolType,
        gapType: "INCOMPLETE_JSDOC",
        severity: decreaseSeverity(severity),
        lineNumber: api.lineNumber,
        currentDoc: api.jsDoc,
        description: `メンバー ${undocumentedMembers.slice(0, 3).map(m => `\`${m.name}\``).join(", ")}${undocumentedMembers.length > 3 ? " 他" : ""} のドキュメントがありません`,
      });
    }
  }

  // 型定義のドキュメントチェック
  if ((api.symbolType === "INTERFACE" || api.symbolType === "TYPE") && api.docQualityScore < 50) {
    gaps.push({
      filePath: api.filePath,
      symbolName: api.name,
      symbolType: api.symbolType,
      gapType: "MISSING_TYPE_DOC",
      severity: decreaseSeverity(severity),
      lineNumber: api.lineNumber,
      currentDoc: api.jsDoc,
      description: `型定義の説明が不十分です`,
    });
  }

  return gaps;
}

// ========================================
// ヘルパー関数
// ========================================

function convertSeverity(severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"): DocSeverity {
  return severity;
}

function isSeverityAtLeast(severity: DocSeverity, minimum: DocSeverity): boolean {
  const order: DocSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(severity) >= order.indexOf(minimum);
}

function decreaseSeverity(severity: DocSeverity): DocSeverity {
  switch (severity) {
    case "CRITICAL": return "HIGH";
    case "HIGH": return "MEDIUM";
    case "MEDIUM": return "LOW";
    default: return "LOW";
  }
}

function sortGapsBySeverity(gaps: DocumentationGap[]): DocumentationGap[] {
  const order: DocSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  return [...gaps].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

function calculateSummary(
  apiResult: PublicAPIAnalysisResult,
  gaps: DocumentationGap[]
): DocAnalysisSummary {
  return calculateSummaryFromGaps(
    gaps,
    apiResult.stats.totalApis,
    apiResult.stats.documentedApis
  );
}

function calculateSummaryFromGaps(
  gaps: DocumentationGap[],
  totalAPIs: number,
  documentedAPIs: number
): DocAnalysisSummary {
  const gapsBySeverity = {
    critical: gaps.filter(g => g.severity === "CRITICAL").length,
    high: gaps.filter(g => g.severity === "HIGH").length,
    medium: gaps.filter(g => g.severity === "MEDIUM").length,
    low: gaps.filter(g => g.severity === "LOW").length,
  };

  const gapsByType: Record<DocGapType, number> = {
    MISSING_JSDOC: 0,
    INCOMPLETE_JSDOC: 0,
    OUTDATED_JSDOC: 0,
    MISSING_PARAM_DOC: 0,
    MISSING_RETURN_DOC: 0,
    MISSING_EXAMPLE: 0,
    MISSING_TYPE_DOC: 0,
    MISSING_README: 0,
  };

  for (const gap of gaps) {
    gapsByType[gap.gapType]++;
  }

  return {
    totalAPIs,
    documentedAPIs,
    documentationRate: totalAPIs > 0 ? (documentedAPIs / totalAPIs) * 100 : 100,
    gapsBySeverity,
    gapsByType,
  };
}

// ========================================
// フォーマット関数
// ========================================

/**
 * ドキュメントギャップをMarkdown形式で出力
 */
export function formatDocGapsMarkdown(result: DocAnalysisResult): string {
  const lines: string[] = [];

  lines.push("## 📝 ドキュメント分析レポート");
  lines.push("");

  // サマリー
  lines.push("### サマリー");
  lines.push("");
  lines.push(`- **総API数**: ${result.summary.totalAPIs}`);
  lines.push(`- **ドキュメント率**: ${result.summary.documentationRate.toFixed(1)}%`);
  lines.push(`- **検出されたギャップ**: ${result.gaps.length} 件`);
  lines.push("");

  if (result.gaps.length === 0) {
    lines.push("✅ ドキュメントのギャップは検出されませんでした。");
    return lines.join("\n");
  }

  // 重要度別サマリー
  const { gapsBySeverity } = result.summary;
  if (gapsBySeverity.critical > 0 || gapsBySeverity.high > 0) {
    lines.push("### ⚠️ 重要度別");
    lines.push("");
    if (gapsBySeverity.critical > 0) {
      lines.push(`- 🔴 **Critical**: ${gapsBySeverity.critical} 件`);
    }
    if (gapsBySeverity.high > 0) {
      lines.push(`- 🟠 **High**: ${gapsBySeverity.high} 件`);
    }
    if (gapsBySeverity.medium > 0) {
      lines.push(`- 🟡 **Medium**: ${gapsBySeverity.medium} 件`);
    }
    if (gapsBySeverity.low > 0) {
      lines.push(`- 🟢 **Low**: ${gapsBySeverity.low} 件`);
    }
    lines.push("");
  }

  // 詳細リスト
  lines.push("### 詳細");
  lines.push("");

  const groupedByFile = groupGapsByFile(result.gaps);

  for (const [filePath, fileGaps] of groupedByFile) {
    lines.push(`#### \`${filePath}\``);
    lines.push("");

    for (const gap of fileGaps) {
      const icon = getSeverityIcon(gap.severity);
      const typeLabel = getGapTypeLabel(gap.gapType);
      lines.push(`- ${icon} **${gap.symbolName}** (L${gap.lineNumber}): ${typeLabel}`);
      lines.push(`  - ${gap.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * PRコメント用の簡潔なフォーマット
 */
export function formatDocGapsForPR(result: DocAnalysisResult, maxItems: number = 5): string {
  const lines: string[] = [];

  if (result.gaps.length === 0) {
    return "";
  }

  lines.push("## 📝 ドキュメント提案");
  lines.push("");
  lines.push(`以下の公開APIにドキュメントを追加することを推奨します：`);
  lines.push("");

  // 重要度の高いものから表示
  const criticalAndHigh = result.gaps.filter(
    g => g.severity === "CRITICAL" || g.severity === "HIGH"
  );

  const toShow = criticalAndHigh.slice(0, maxItems);

  for (const gap of toShow) {
    const icon = getSeverityIcon(gap.severity);
    lines.push(`${icon} **\`${gap.symbolName}\`** - ${gap.description}`);
    lines.push(`   - 📍 ${gap.filePath}:${gap.lineNumber}`);
  }

  if (criticalAndHigh.length > maxItems) {
    lines.push(`\n... 他 ${criticalAndHigh.length - maxItems} 件の提案があります`);
  }

  return lines.join("\n");
}

function groupGapsByFile(gaps: DocumentationGap[]): Map<string, DocumentationGap[]> {
  const grouped = new Map<string, DocumentationGap[]>();

  for (const gap of gaps) {
    const existing = grouped.get(gap.filePath) || [];
    existing.push(gap);
    grouped.set(gap.filePath, existing);
  }

  return grouped;
}

function getSeverityIcon(severity: DocSeverity): string {
  switch (severity) {
    case "CRITICAL": return "🔴";
    case "HIGH": return "🟠";
    case "MEDIUM": return "🟡";
    case "LOW": return "🟢";
  }
}

function getGapTypeLabel(gapType: DocGapType): string {
  const labels: Record<DocGapType, string> = {
    MISSING_JSDOC: "JSDoc/TSDocなし",
    INCOMPLETE_JSDOC: "不完全なJSDoc",
    OUTDATED_JSDOC: "古いJSDoc",
    MISSING_PARAM_DOC: "パラメータ説明なし",
    MISSING_RETURN_DOC: "戻り値説明なし",
    MISSING_EXAMPLE: "使用例なし",
    MISSING_TYPE_DOC: "型定義説明なし",
    MISSING_README: "READMEセクションなし",
  };
  return labels[gapType];
}
