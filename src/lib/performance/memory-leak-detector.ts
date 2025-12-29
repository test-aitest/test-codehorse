/**
 * Phase 8: Memory Leak Detector
 *
 * メモリリークの可能性があるパターンを検出
 */

import type { DetectedPerformanceIssue } from "./types";

// ========================================
// 検出パターン
// ========================================

/**
 * クリアされていないインターバル/タイムアウトを検出
 */
export function detectUnclearedTimers(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // setInterval/setTimeoutの使用を追跡
  const timerCalls: Array<{
    type: "interval" | "timeout";
    lineNumber: number;
    varName: string | null;
  }> = [];

  // clearInterval/clearTimeoutの使用を追跡
  const clearCalls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // setInterval検出
    const intervalMatch = line.match(
      /(?:const|let|var)?\s*(\w+)?\s*=?\s*setInterval\s*\(/
    );
    if (intervalMatch) {
      timerCalls.push({
        type: "interval",
        lineNumber,
        varName: intervalMatch[1] || null,
      });
    }

    // setTimeout検出
    const timeoutMatch = line.match(
      /(?:const|let|var)?\s*(\w+)?\s*=?\s*setTimeout\s*\(/
    );
    if (timeoutMatch) {
      timerCalls.push({
        type: "timeout",
        lineNumber,
        varName: timeoutMatch[1] || null,
      });
    }

    // clearInterval/clearTimeout検出
    const clearIntervalMatch = line.match(/clearInterval\s*\(\s*(\w+)\s*\)/);
    if (clearIntervalMatch) {
      clearCalls.add(clearIntervalMatch[1]);
    }
    const clearTimeoutMatch = line.match(/clearTimeout\s*\(\s*(\w+)\s*\)/);
    if (clearTimeoutMatch) {
      clearCalls.add(clearTimeoutMatch[1]);
    }
  }

  // クリアされていないタイマーを報告
  for (const timer of timerCalls) {
    // 変数に保存されていない場合
    if (!timer.varName) {
      issues.push({
        issueType: "MEMORY_LEAK",
        severity: timer.type === "interval" ? "WARNING" : "INFO",
        filePath,
        lineNumber: timer.lineNumber,
        description: `${timer.type === "interval" ? "setInterval" : "setTimeout"}が変数に保存されていません。クリーンアップが不可能です。`,
        suggestion: `タイマーIDを変数に保存し、コンポーネントのアンマウント時や不要になった時点でclear${timer.type === "interval" ? "Interval" : "Timeout"}を呼び出してください。`,
        codeSnippet: lines[timer.lineNumber - 1 - lineOffset]?.trim(),
        estimatedImpact: timer.type === "interval" ? "HIGH" : "MEDIUM",
        patternId: `uncleared-${timer.type}`,
      });
    }
    // 変数に保存されているがクリアされていない場合（setIntervalのみ警告）
    else if (timer.type === "interval" && !clearCalls.has(timer.varName)) {
      // useEffectのクリーンアップ内にあるかチェック
      if (!isInUseEffectCleanup(code, timer.lineNumber - lineOffset)) {
        issues.push({
          issueType: "MEMORY_LEAK",
          severity: "WARNING",
          filePath,
          lineNumber: timer.lineNumber,
          description: `setInterval（${timer.varName}）がクリアされていない可能性があります。`,
          suggestion: `Reactコンポーネントの場合はuseEffectのクリーンアップ関数内で、通常の関数の場合は適切なタイミングでclearInterval(${timer.varName})を呼び出してください。`,
          codeSnippet: lines[timer.lineNumber - 1 - lineOffset]?.trim(),
          estimatedImpact: "HIGH",
          patternId: "uncleared-interval",
        });
      }
    }
  }

  return issues;
}

/**
 * 削除されていないイベントリスナーを検出
 */
export function detectUnremovedEventListeners(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // addEventListener/removeEventListenerを追跡
  const addListenerCalls: Array<{
    lineNumber: number;
    target: string;
    event: string;
    handler: string;
  }> = [];
  const removeListenerSignatures = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // addEventListener検出
    const addMatch = line.match(
      /(\w+)\.addEventListener\s*\(\s*['"](\w+)['"]\s*,\s*(\w+)/
    );
    if (addMatch) {
      addListenerCalls.push({
        lineNumber,
        target: addMatch[1],
        event: addMatch[2],
        handler: addMatch[3],
      });
    }

    // removeEventListener検出
    const removeMatch = line.match(
      /(\w+)\.removeEventListener\s*\(\s*['"](\w+)['"]\s*,\s*(\w+)/
    );
    if (removeMatch) {
      removeListenerSignatures.add(`${removeMatch[1]}-${removeMatch[2]}-${removeMatch[3]}`);
    }
  }

  // 削除されていないリスナーを報告
  for (const listener of addListenerCalls) {
    const signature = `${listener.target}-${listener.event}-${listener.handler}`;
    if (!removeListenerSignatures.has(signature)) {
      // useEffectのクリーンアップ内にあるかチェック
      if (!isInUseEffectCleanup(code, listener.lineNumber - lineOffset)) {
        issues.push({
          issueType: "MEMORY_LEAK",
          severity: "WARNING",
          filePath,
          lineNumber: listener.lineNumber,
          description: `イベントリスナー（${listener.event}）がremoveEventListenerで削除されていません。`,
          suggestion: `コンポーネントのアンマウント時や不要になった時点で${listener.target}.removeEventListener('${listener.event}', ${listener.handler})を呼び出してください。`,
          codeSnippet: lines[listener.lineNumber - 1 - lineOffset]?.trim(),
          estimatedImpact: "MEDIUM",
          patternId: "unremoved-event-listener",
        });
      }
    }
  }

  return issues;
}

/**
 * クロージャによるメモリリークパターンを検出
 */
export function detectClosureLeaks(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // 大きなオブジェクトをクロージャでキャプチャするパターン
    // 例: イベントハンドラ内でDOM要素を参照
    if (/addEventListener\s*\(.+function/.test(line)) {
      const nextLines = lines.slice(i, i + 10).join("\n");
      if (/\bthis\b|\bdocument\b|\bwindow\b/.test(nextLines)) {
        issues.push({
          issueType: "MEMORY_LEAK",
          severity: "INFO",
          filePath,
          lineNumber,
          description:
            "イベントハンドラ内でthis、document、またはwindowへの参照があります。クロージャがこれらのオブジェクトを保持し続ける可能性があります。",
          suggestion:
            "必要な値のみを変数にコピーしてクロージャ内で使用するか、WeakMapを使用してください。",
          codeSnippet: line.trim(),
          estimatedImpact: "LOW",
          patternId: "closure-leak",
        });
      }
    }
  }

  return issues;
}

/**
 * グローバル状態への蓄積を検出
 */
export function detectGlobalStateAccumulation(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // グローバル変数への配列プッシュを検出
  const globalArrays = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // モジュールレベルの配列定義
    if (/^(?:const|let|var)\s+(\w+)\s*:\s*\w+\[\]\s*=\s*\[\]/.test(line)) {
      const match = line.match(/^(?:const|let|var)\s+(\w+)/);
      if (match) {
        globalArrays.add(match[1]);
      }
    }

    // グローバル配列へのpush
    const pushMatch = line.match(/(\w+)\.push\s*\(/);
    if (pushMatch && globalArrays.has(pushMatch[1])) {
      // 対応するクリア操作がないか確認
      if (!code.includes(`${pushMatch[1]} = []`) && !code.includes(`${pushMatch[1]}.length = 0`)) {
        issues.push({
          issueType: "MEMORY_LEAK",
          severity: "INFO",
          filePath,
          lineNumber,
          description: `モジュールレベルの配列（${pushMatch[1]}）に要素が追加されていますが、クリアされていません。`,
          suggestion:
            "定期的に配列をクリアするか、Map/SetやWeakMapを使用して自動的にガベージコレクションされるようにしてください。",
          codeSnippet: line.trim(),
          estimatedImpact: "MEDIUM",
          patternId: "growing-global-array",
        });
      }
    }
  }

  return issues;
}

/**
 * 全てのメモリリーク検出を実行
 */
export function detectMemoryLeaks(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];

  issues.push(...detectUnclearedTimers(code, filePath, lineOffset));
  issues.push(...detectUnremovedEventListeners(code, filePath, lineOffset));
  issues.push(...detectClosureLeaks(code, filePath, lineOffset));
  issues.push(...detectGlobalStateAccumulation(code, filePath, lineOffset));

  return issues;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 指定行がuseEffectのクリーンアップ関数内にあるかチェック
 */
function isInUseEffectCleanup(code: string, lineIndex: number): boolean {
  const lines = code.split("\n");
  const line = lines[lineIndex];

  // 簡易チェック: return文の後にある場合
  // より正確にはAST解析が必要
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 20; i--) {
    if (/useEffect\s*\(/.test(lines[i])) {
      // useEffect内にいる
      const useEffectBlock = lines.slice(i, lineIndex + 1).join("\n");
      // return () => {} のパターンがあるかチェック
      if (/return\s*\(\s*\)\s*=>\s*\{/.test(useEffectBlock)) {
        // その行がreturnの後にあるかチェック
        const returnIndex = useEffectBlock.indexOf("return");
        const linePosition = useEffectBlock.indexOf(line);
        if (linePosition > returnIndex) {
          return true;
        }
      }
      break;
    }
  }

  return false;
}

/**
 * メモリリーク検出が有効かチェック
 */
export function isMemoryLeakDetectionEnabled(): boolean {
  return process.env.DETECT_MEMORY_LEAKS !== "false";
}
