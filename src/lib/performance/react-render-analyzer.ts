/**
 * Phase 8: React Render Analyzer
 *
 * 不要なReact再レンダリングを引き起こすパターンを検出
 */

import type { DetectedPerformanceIssue } from "./types";

// ========================================
// インライン定義検出
// ========================================

/**
 * JSX内のインラインオブジェクト/配列を検出
 */
export function detectInlineDefinitions(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // JSX属性内のパターン
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // style={{...}} パターン（許可されるケースも多いが警告）
    if (/style\s*=\s*\{\s*\{/.test(line)) {
      issues.push({
        issueType: "UNNECESSARY_RERENDER",
        severity: "INFO",
        filePath,
        lineNumber,
        description:
          "インラインスタイルオブジェクトが毎回のレンダリングで新しく作成されています。",
        suggestion:
          "スタイルオブジェクトをコンポーネント外で定義するか、useMemoを使用してメモ化してください。\n\n```tsx\nconst styles = { color: 'red' }; // コンポーネント外\n// または\nconst styles = useMemo(() => ({ color: 'red' }), []);\n```",
        codeSnippet: line.trim(),
        estimatedImpact: "LOW",
        patternId: "inline-style-object",
      });
    }

    // props={[...]} パターン（配列）
    if (/\w+\s*=\s*\{\s*\[/.test(line) && !line.includes("children")) {
      issues.push({
        issueType: "UNNECESSARY_RERENDER",
        severity: "WARNING",
        filePath,
        lineNumber,
        description:
          "インライン配列がpropsとして渡されています。毎回のレンダリングで新しい参照が作成されます。",
        suggestion:
          "配列をuseMemoでメモ化するか、コンポーネント外で定義してください。\n\n```tsx\nconst items = useMemo(() => ['a', 'b', 'c'], []);\n```",
        codeSnippet: line.trim(),
        estimatedImpact: "MEDIUM",
        patternId: "inline-array-prop",
      });
    }

    // callback={() => ...} パターン
    if (
      /\w+\s*=\s*\{\s*\(\s*\)\s*=>\s*/.test(line) ||
      /\w+\s*=\s*\{\s*function\s*\(/.test(line)
    ) {
      // onClick, onChangeなどは許容されることが多いが警告
      const isEventHandler = /on[A-Z]\w+\s*=/.test(line);
      if (!isEventHandler) {
        issues.push({
          issueType: "UNNECESSARY_RERENDER",
          severity: "WARNING",
          filePath,
          lineNumber,
          description:
            "インライン関数がpropsとして渡されています。毎回のレンダリングで新しい参照が作成されます。",
          suggestion:
            "useCallbackを使用して関数をメモ化してください。\n\n```tsx\nconst handleClick = useCallback(() => {\n  // ロジック\n}, [dependencies]);\n```",
          codeSnippet: line.trim(),
          estimatedImpact: "MEDIUM",
          patternId: "inline-function-prop",
        });
      }
    }
  }

  return issues;
}

/**
 * useMemo/useCallback依存配列の問題を検出
 */
export function detectHookDependencyIssues(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // useMemo/useCallbackの空の依存配列で複雑な計算
    if (/use(Memo|Callback)\s*\(.+,\s*\[\s*\]\s*\)/.test(line)) {
      // 複数行にわたる場合を考慮
      const multiLine = lines
        .slice(i, Math.min(i + 5, lines.length))
        .join("\n");
      if (/\[\s*\]\s*\)/.test(multiLine)) {
        // 問題がある可能性（依存関係が本当にないか確認が必要）
        // ここでは警告しない（false positiveが多い）
      }
    }

    // useEffectで全ての依存関係が含まれていない可能性
    if (/useEffect\s*\(/.test(line)) {
      const effectBlock = lines
        .slice(i, Math.min(i + 20, lines.length))
        .join("\n");
      const depsMatch = effectBlock.match(/\]\s*,\s*\[([^\]]*)\]\s*\)/);
      if (depsMatch) {
        const deps = depsMatch[1];
        // 空の依存配列でstateを使用している場合
        if (deps.trim() === "" && /set[A-Z]\w+\s*\(/.test(effectBlock)) {
          // state更新があるが依存配列が空
          // これは意図的な場合もあるので、INFOレベル
        }
      }
    }

    // useCallbackが依存なしで定義されているが内部でstateを参照
    if (/useCallback\s*\(/.test(line)) {
      const callbackBlock = lines
        .slice(i, Math.min(i + 15, lines.length))
        .join("\n");
      if (/\[\s*\]\s*\)/.test(callbackBlock)) {
        // 空の依存配列
        // 内部でpropsやstateを参照していないかチェック
        // 簡易チェック：変数参照がある場合
        const bodyMatch = callbackBlock.match(
          /useCallback\s*\(\s*(?:\([^)]*\)|[^,]+)\s*=>\s*\{([^}]+)\}/
        );
        if (bodyMatch) {
          const body = bodyMatch[1];
          // propsやuseStateの値を参照している可能性
          if (/\b(?:props|state)\b/.test(body)) {
            issues.push({
              issueType: "MISSING_MEMOIZATION",
              severity: "INFO",
              filePath,
              lineNumber,
              description:
                "useCallbackの依存配列が空ですが、内部でpropsまたはstateを参照している可能性があります。",
              suggestion:
                "依存配列に必要な値を含めてください。空の配列は、コールバックが外部の値に依存しない場合にのみ使用してください。",
              codeSnippet: line.trim(),
              estimatedImpact: "LOW",
              patternId: "missing-callback-deps",
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * React.memoの欠如を検出
 */
export function detectMissingMemo(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // コンポーネント定義を検出
  const componentDefinitions: Array<{ name: string; lineNumber: number }> = [];
  const memoizedComponents = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // React.memoでラップされているコンポーネント
    const memoMatch = line.match(
      /(?:const|export\s+const)\s+(\w+)\s*=\s*(?:React\.)?memo\s*\(/
    );
    if (memoMatch) {
      memoizedComponents.add(memoMatch[1]);
    }

    // 関数コンポーネント定義（大文字始まり）
    const funcMatch = line.match(
      /(?:export\s+)?(?:const|function)\s+([A-Z]\w+)\s*(?::\s*\w+\s*)?[=\(]/
    );
    if (funcMatch) {
      // Reactコンポーネントかどうか確認（JSXを返す）
      const nextLines = lines
        .slice(i, Math.min(i + 30, lines.length))
        .join("\n");
      if (/<\w+/.test(nextLines) || /return\s*\(/.test(nextLines)) {
        componentDefinitions.push({
          name: funcMatch[1],
          lineNumber,
        });
      }
    }
  }

  // メモ化されていないコンポーネントを報告
  // ただし、ルートコンポーネントやページコンポーネントは除外
  const skipPatterns = ["App", "Page", "Layout", "Provider", "Root"];
  for (const comp of componentDefinitions) {
    if (
      !memoizedComponents.has(comp.name) &&
      !skipPatterns.some((p) => comp.name.includes(p))
    ) {
      // 子コンポーネントとして使用されているか確認
      const isUsedAsChild = new RegExp(`<${comp.name}[\\s/>]`).test(code);
      if (isUsedAsChild) {
        issues.push({
          issueType: "MISSING_MEMOIZATION",
          severity: "INFO",
          filePath,
          lineNumber: comp.lineNumber,
          description: `コンポーネント「${comp.name}」がReact.memoでメモ化されていません。親の再レンダリング時に常に再レンダリングされます。`,
          suggestion: `propsが頻繁に変わらない場合は、React.memoでラップすることを検討してください。\n\n\`\`\`tsx\nconst ${comp.name} = React.memo(function ${comp.name}(props) {\n  // ...\n});\n\`\`\``,
          codeSnippet: lines[comp.lineNumber - 1 - lineOffset]?.trim(),
          estimatedImpact: "LOW",
          patternId: "missing-react-memo",
        });
      }
    }
  }

  return issues;
}

/**
 * 高コストな計算のメモ化欠如を検出
 */
export function detectMissingUseMemo(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  const issues: DetectedPerformanceIssue[] = [];
  const lines = code.split("\n");

  // 高コストな操作のパターン
  const expensivePatterns = [
    { pattern: /\.filter\s*\([^)]+\)\.map\s*\(/, name: "filter + map" },
    { pattern: /\.reduce\s*\([^)]+\)/, name: "reduce" },
    { pattern: /\.sort\s*\([^)]*\)/, name: "sort" },
    { pattern: /JSON\.parse\s*\(/, name: "JSON.parse" },
    {
      pattern: /Object\.keys\s*\([^)]+\)\.map\s*\(/,
      name: "Object.keys + map",
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1 + lineOffset;

    // useMemo内でなければ警告
    const isInUseMemo = isLineInUseMemo(lines, i);

    for (const { pattern, name } of expensivePatterns) {
      if (pattern.test(line) && !isInUseMemo) {
        // コンポーネント内かチェック（簡易）
        if (isInFunctionComponent(lines, i)) {
          issues.push({
            issueType: "MISSING_MEMOIZATION",
            severity: "INFO",
            filePath,
            lineNumber,
            description: `高コストな計算（${name}）がuseMemoなしで毎レンダリング実行されています。`,
            suggestion: `計算結果をuseMemoでメモ化することを検討してください。\n\n\`\`\`tsx\nconst result = useMemo(() => {\n  return ${line.trim()}\n}, [dependencies]);\n\`\`\``,
            codeSnippet: line.trim(),
            estimatedImpact: "MEDIUM",
            patternId: "missing-usememo",
          });
          break;
        }
      }
    }
  }

  return issues;
}

/**
 * 全てのReact再レンダリング問題を検出
 */
export function detectReactRerenderIssues(
  code: string,
  filePath: string,
  lineOffset: number = 0
): DetectedPerformanceIssue[] {
  // Reactコンポーネントファイルでない場合はスキップ
  if (!isReactFile(code, filePath)) {
    return [];
  }

  const issues: DetectedPerformanceIssue[] = [];

  issues.push(...detectInlineDefinitions(code, filePath, lineOffset));
  issues.push(...detectHookDependencyIssues(code, filePath, lineOffset));
  issues.push(...detectMissingMemo(code, filePath, lineOffset));
  issues.push(...detectMissingUseMemo(code, filePath, lineOffset));

  return issues;
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * Reactファイルかどうかを判定
 */
function isReactFile(code: string, filePath: string): boolean {
  // 拡張子チェック
  if (!/\.(tsx|jsx)$/.test(filePath)) {
    // .ts/.jsでもReactを使用している場合
    if (!/import\s+.*\s+from\s+['"]react['"]/.test(code)) {
      return false;
    }
  }
  return true;
}

/**
 * 指定行がuseMemo内にあるかチェック
 */
function isLineInUseMemo(lines: string[], lineIndex: number): boolean {
  // 前方を探索してuseMemoの開始を探す
  let braceCount = 0;
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    braceCount += (line.match(/\}/g) || []).length;
    braceCount -= (line.match(/\{/g) || []).length;

    if (/useMemo\s*\(/.test(line)) {
      return braceCount < 0;
    }
  }
  return false;
}

/**
 * 指定行が関数コンポーネント内にあるかチェック
 */
function isInFunctionComponent(lines: string[], lineIndex: number): boolean {
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    // 関数コンポーネント定義
    if (/(?:function|const)\s+[A-Z]\w+\s*[=(]/.test(line)) {
      return true;
    }
    // モジュールレベルに達したら終了
    if (
      /^(?:import|export|const|let|var)\s+/.test(line) &&
      i < lineIndex - 50
    ) {
      break;
    }
  }
  return false;
}

/**
 * React再レンダリング検出が有効かチェック
 */
export function isReactRerenderDetectionEnabled(): boolean {
  return process.env.DETECT_REACT_RERENDERS !== "false";
}
