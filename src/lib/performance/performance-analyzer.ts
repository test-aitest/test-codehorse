/**
 * Phase 8: Performance Analyzer
 *
 * メインのパフォーマンス分析エンジン
 * 各種検出器を統合し、総合的な分析を実行
 */

import type { PerformanceIssueType, PerformanceSeverity } from "@prisma/client";
import type {
  DetectedPerformanceIssue,
  PerformanceAnalysisResult,
  PerformanceAnalysisOptions,
  PerformanceAnalysisStats,
} from "./types";
import { DEFAULT_PERFORMANCE_OPTIONS } from "./types";
import { detectNPlusOneQueries, detectPrismaNPlusOne } from "./n-plus-one-detector";
import { detectMemoryLeaks } from "./memory-leak-detector";
import { detectReactRerenderIssues } from "./react-render-analyzer";

// ========================================
// メイン分析関数
// ========================================

/**
 * ファイルのパフォーマンス分析を実行
 */
export function analyzeFilePerformance(
  code: string,
  filePath: string,
  options: PerformanceAnalysisOptions = DEFAULT_PERFORMANCE_OPTIONS
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];

  // ファイル除外パターンチェック
  if (shouldExcludeFile(filePath, options.excludePatterns)) {
    return issues;
  }

  // N+1クエリ検出
  if (options.detectNPlusOne !== false) {
    issues.push(...detectNPlusOneQueries(code, filePath));
    issues.push(...detectPrismaNPlusOne(code, filePath));
  }

  // メモリリーク検出
  if (options.detectMemoryLeaks !== false) {
    issues.push(...detectMemoryLeaks(code, filePath));
  }

  // React再レンダリング検出
  if (options.detectReactRerenders !== false) {
    issues.push(...detectReactRerenderIssues(code, filePath));
  }

  // 非効率なループ検出
  if (options.detectInefficientLoops !== false) {
    issues.push(...detectInefficientLoops(code, filePath));
  }

  // 大きなバンドルインポート検出
  if (options.detectLargeBundleImports !== false) {
    issues.push(...detectLargeBundleImports(code, filePath));
  }

  // 重要度フィルタリング
  const filteredIssues = filterBySeverity(issues, options.minSeverity);

  // 最大件数制限
  return options.maxIssues
    ? filteredIssues.slice(0, options.maxIssues)
    : filteredIssues;
}

/**
 * 複数ファイルのパフォーマンス分析を実行
 */
export function analyzePerformance(
  files: Array<{ path: string; content: string }>,
  options: PerformanceAnalysisOptions = DEFAULT_PERFORMANCE_OPTIONS
): PerformanceAnalysisResult {
  const startTime = Date.now();
  const allIssues: DetectedPerformanceIssue[] = [];
  let filesAnalyzed = 0;

  for (const file of files) {
    // インクルードパターンチェック
    if (options.includePatterns && options.includePatterns.length > 0) {
      if (!matchesPatterns(file.path, options.includePatterns)) {
        continue;
      }
    }

    const fileIssues = analyzeFilePerformance(file.content, file.path, {
      ...options,
      maxIssues: undefined, // 個別ファイルでは制限しない
    });
    allIssues.push(...fileIssues);
    filesAnalyzed++;

    // 全体の最大件数に達したら終了
    if (options.maxIssues && allIssues.length >= options.maxIssues) {
      break;
    }
  }

  const analysisTimeMs = Date.now() - startTime;

  // 最終的な件数制限
  const limitedIssues = options.maxIssues
    ? allIssues.slice(0, options.maxIssues)
    : allIssues;

  return {
    issues: limitedIssues,
    filesAnalyzed,
    analysisTimeMs,
    stats: calculateStats(limitedIssues),
  };
}

// ========================================
// 追加の検出器
// ========================================

/**
 * 非効率なループパターンを検出
 */
export function detectInefficientLoops(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // ループ内でのDOM操作
    if (isInLoop(lines, i) && /document\.(getElementById|querySelector|getElementsBy)/.test(line)) {
      issues.push({
        issueType: "EXCESSIVE_DOM_ACCESS",
        severity: "WARNING",
        filePath,
        lineNumber,
        description: "ループ内でDOM要素を毎回取得しています。パフォーマンスが低下します。",
        suggestion:
          "DOM要素をループの外で一度だけ取得し、変数にキャッシュしてください。\n\n```javascript\nconst element = document.getElementById('myId');\nfor (let i = 0; i < items.length; i++) {\n  // element を使用\n}\n```",
        codeSnippet: line.trim(),
        estimatedImpact: "MEDIUM",
        patternId: "loop-dom-access",
      });
    }

    // 配列のlengthを毎回参照
    const forLoopMatch = line.match(/for\s*\(\s*(?:let|var)\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<\s*(\w+)\.length\s*;/);
    if (forLoopMatch) {
      // ループ内で配列が変更されていないかチェック（簡易）
      const loopBody = extractLoopBody(lines, i);
      const arrayName = forLoopMatch[1];
      if (!loopBody.includes(`${arrayName}.push`) && !loopBody.includes(`${arrayName}.pop`)) {
        issues.push({
          issueType: "INEFFICIENT_LOOP",
          severity: "INFO",
          filePath,
          lineNumber,
          description: `ループ条件で毎回 ${arrayName}.length を評価しています。`,
          suggestion: `配列の長さを変数にキャッシュすることを検討してください。\n\n\`\`\`javascript\nconst len = ${arrayName}.length;\nfor (let i = 0; i < len; i++) {\n  // ...\n}\n\`\`\``,
          codeSnippet: line.trim(),
          estimatedImpact: "LOW",
          patternId: "uncached-array-length",
        });
      }
    }

    // ネストされたループでの検索
    if (/\.find\s*\(|\.includes\s*\(|\.indexOf\s*\(/.test(line) && isInLoop(lines, i)) {
      issues.push({
        issueType: "INEFFICIENT_LOOP",
        severity: "WARNING",
        filePath,
        lineNumber,
        description: "ループ内で線形検索を行っています。O(n²)の計算量になる可能性があります。",
        suggestion:
          "事前にMapまたはSetを作成して、O(1)で検索できるようにしてください。\n\n```javascript\nconst itemSet = new Set(items);\nfor (const item of otherItems) {\n  if (itemSet.has(item)) {\n    // ...\n  }\n}\n```",
        codeSnippet: line.trim(),
        estimatedImpact: "MEDIUM",
        patternId: "nested-loop-search",
      });
    }
  }

  return issues;
}

/**
 * 大きなバンドルインポートを検出
 */
export function detectLargeBundleImports(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // 大きなライブラリのパターン
  const largeBundlePatterns = [
    {
      pattern: /import\s+(?:\*\s+as\s+)?_?\s*from\s+['"]lodash['"]/,
      library: "lodash",
      suggestion: "lodash-esから個別関数をインポートしてください: import { debounce } from 'lodash-es'",
    },
    {
      pattern: /import\s+(?:\*\s+as\s+)?moment\s+from\s+['"]moment['"]/,
      library: "moment",
      suggestion: "date-fnsまたはdayjsへの移行を検討してください。これらはより軽量です。",
    },
    {
      pattern: /import\s+\{[^}]*\}\s+from\s+['"]@mui\/material['"]/,
      library: "@mui/material",
      suggestion: "@mui/material/Buttonのように直接パスでインポートしてください。",
    },
    {
      pattern: /import\s+\{[^}]*\}\s+from\s+['"]antd['"]/,
      library: "antd",
      suggestion: "antd/es/buttonのように直接パスでインポートするか、babel-plugin-importを使用してください。",
    },
    {
      pattern: /import\s+(?:\*\s+as\s+)?(?:_|icons)\s+from\s+['"]@fortawesome\/free-solid-svg-icons['"]/,
      library: "@fortawesome/free-solid-svg-icons",
      suggestion: "使用するアイコンのみを個別にインポートしてください: import { faUser } from '@fortawesome/free-solid-svg-icons'",
    },
    {
      pattern: /import\s+\*\s+as\s+\w+\s+from\s+['"]rxjs['"]/,
      library: "rxjs",
      suggestion: "rxjs/operatorsから必要な演算子のみをインポートしてください。",
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    for (const { pattern, library, suggestion } of largeBundlePatterns) {
      if (pattern.test(line)) {
        issues.push({
          issueType: "LARGE_BUNDLE_IMPORT",
          severity: "WARNING",
          filePath,
          lineNumber,
          description: `${library}の全体インポートはバンドルサイズを増加させます。`,
          suggestion,
          codeSnippet: line.trim(),
          estimatedImpact: "MEDIUM",
          patternId: `large-bundle-${library.replace(/[/@]/g, "-")}`,
        });
        break;
      }
    }

    // 動的インポートの欠如を検出（大きなコンポーネント）
    if (/import\s+\w+\s+from\s+['"].*(?:Modal|Dialog|Drawer|Chart|Editor|Map)['"]/.test(line)) {
      // モーダルやチャートなどは遅延ロードが推奨
      if (!line.includes("lazy") && !line.includes("dynamic")) {
        issues.push({
          issueType: "MISSING_LAZY_LOAD",
          severity: "INFO",
          filePath,
          lineNumber,
          description: "大きなコンポーネントが通常インポートされています。初期バンドルサイズが増加します。",
          suggestion:
            "React.lazyまたはNext.jsのdynamic importを使用して遅延ロードを検討してください。\n\n```javascript\nconst Modal = React.lazy(() => import('./Modal'));\n// または Next.js\nconst Modal = dynamic(() => import('./Modal'), { ssr: false });\n```",
          codeSnippet: line.trim(),
          estimatedImpact: "LOW",
          patternId: "missing-lazy-load",
        });
      }
    }
  }

  return issues;
}

/**
 * ブロッキング操作を検出
 */
export function detectBlockingOperations(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // 同期的なファイル操作
    if (/fs\.(readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync)/.test(line)) {
      issues.push({
        issueType: "BLOCKING_OPERATION",
        severity: "WARNING",
        filePath,
        lineNumber,
        description: "同期的なファイル操作がメインスレッドをブロックします。",
        suggestion:
          "非同期バージョン（readFile, writeFileなど）を使用するか、fs/promisesを使用してください。\n\n```javascript\nimport { readFile } from 'fs/promises';\nconst content = await readFile('file.txt', 'utf-8');\n```",
        codeSnippet: line.trim(),
        estimatedImpact: "MEDIUM",
        patternId: "sync-file-operation",
      });
    }

    // alert/confirm/prompt（ブラウザ環境）
    if (/\b(alert|confirm|prompt)\s*\(/.test(line) && !line.includes("window.")) {
      issues.push({
        issueType: "BLOCKING_OPERATION",
        severity: "INFO",
        filePath,
        lineNumber,
        description: "alert/confirm/promptはUIをブロックします。",
        suggestion:
          "カスタムモーダルやトースト通知を使用することを検討してください。",
        codeSnippet: line.trim(),
        estimatedImpact: "LOW",
        patternId: "blocking-dialog",
      });
    }

    // 長時間実行される可能性のある同期処理
    if (/JSON\.parse\s*\(.{50,}\)/.test(line)) {
      issues.push({
        issueType: "BLOCKING_OPERATION",
        severity: "INFO",
        filePath,
        lineNumber,
        description: "大きなJSONの同期的なパースはメインスレッドをブロックする可能性があります。",
        suggestion:
          "Web Workerを使用するか、ストリーミングパーサーの使用を検討してください。",
        codeSnippet: line.trim().substring(0, 80) + "...",
        estimatedImpact: "LOW",
        patternId: "large-json-parse",
      });
    }
  }

  return issues;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * ファイルを除外すべきかチェック
 */
function shouldExcludeFile(filePath: string, excludePatterns?: string[]): boolean {
  if (!excludePatterns || excludePatterns.length === 0) {
    return false;
  }

  return excludePatterns.some((pattern) => {
    // 簡易グロブマッチング
    const regex = globToRegex(pattern);
    return regex.test(filePath);
  });
}

/**
 * パターンにマッチするかチェック
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const regex = globToRegex(pattern);
    return regex.test(filePath);
  });
}

/**
 * グロブパターンを正規表現に変換
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "___DOUBLE_STAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLE_STAR___/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/**
 * 重要度でフィルタリング
 */
function filterBySeverity(
  issues: DetectedPerformanceIssue[],
  minSeverity?: PerformanceSeverity
): DetectedPerformanceIssue[] {
  if (!minSeverity || minSeverity === "INFO") {
    return issues;
  }

  const severityOrder: Record<PerformanceSeverity, number> = {
    CRITICAL: 3,
    WARNING: 2,
    INFO: 1,
  };

  const minLevel = severityOrder[minSeverity];
  return issues.filter((issue) => severityOrder[issue.severity] >= minLevel);
}

/**
 * 統計情報を計算
 */
function calculateStats(issues: DetectedPerformanceIssue[]): PerformanceAnalysisStats {
  const byType: Record<PerformanceIssueType, number> = {
    N_PLUS_ONE_QUERY: 0,
    MEMORY_LEAK: 0,
    UNNECESSARY_RERENDER: 0,
    INEFFICIENT_LOOP: 0,
    LARGE_BUNDLE_IMPORT: 0,
    BLOCKING_OPERATION: 0,
    MISSING_MEMOIZATION: 0,
    EXCESSIVE_DOM_ACCESS: 0,
    UNOPTIMIZED_IMAGE: 0,
    MISSING_LAZY_LOAD: 0,
  };

  const bySeverity: Record<PerformanceSeverity, number> = {
    CRITICAL: 0,
    WARNING: 0,
    INFO: 0,
  };

  const byImpact: Record<"HIGH" | "MEDIUM" | "LOW", number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const issue of issues) {
    byType[issue.issueType]++;
    bySeverity[issue.severity]++;
    if (issue.estimatedImpact) {
      byImpact[issue.estimatedImpact]++;
    }
  }

  return { byType, bySeverity, byImpact };
}

/**
 * 指定行がループ内にあるかチェック
 */
function isInLoop(lines: string[], lineIndex: number): boolean {
  let braceCount = 0;
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    braceCount += (line.match(/\}/g) || []).length;
    braceCount -= (line.match(/\{/g) || []).length;

    if (braceCount < 0) {
      // ループ開始を検出
      if (/for\s*\(|while\s*\(|\.forEach\s*\(|\.map\s*\(/.test(line)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * ループ本体を抽出
 */
function extractLoopBody(lines: string[], loopStartIndex: number): string {
  let braceCount = 0;
  const bodyLines: string[] = [];
  let started = false;

  for (let i = loopStartIndex; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      if (char === "{") {
        braceCount++;
        started = true;
      } else if (char === "}") {
        braceCount--;
      }
    }

    if (started) {
      bodyLines.push(line);
    }

    if (started && braceCount === 0) {
      break;
    }
  }

  return bodyLines.join("\n");
}

/**
 * パフォーマンス分析が有効かチェック
 */
export function isPerformanceAnalysisEnabled(): boolean {
  return process.env.PERFORMANCE_ANALYSIS_ENABLED !== "false";
}
