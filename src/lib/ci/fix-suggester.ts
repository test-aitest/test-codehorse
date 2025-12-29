/**
 * Phase 9: CI Fix Suggester
 *
 * CI失敗に対する修正提案を生成
 */

import type {
  ParsedCILog,
  FixSuggestion,
  CIAnalysisOptions,
} from "./types";

// ========================================
// メイン提案生成関数
// ========================================

/**
 * 修正提案を生成
 */
export function generateFixSuggestions(
  parsedLog: ParsedCILog,
  options: CIAnalysisOptions = {}
): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];
  const isJa = options.language === "ja";

  switch (parsedLog.failureType) {
    case "TEST_FAILURE":
      suggestions.push(...generateTestFailureSuggestions(parsedLog, isJa));
      break;

    case "TYPE_ERROR":
      suggestions.push(...generateTypeErrorSuggestions(parsedLog, isJa));
      break;

    case "LINT_ERROR":
      suggestions.push(...generateLintErrorSuggestions(parsedLog, isJa));
      break;

    case "BUILD_ERROR":
      suggestions.push(...generateBuildErrorSuggestions(parsedLog, isJa));
      break;

    case "DEPENDENCY_ERROR":
      suggestions.push(...generateDependencyErrorSuggestions(parsedLog, isJa));
      break;

    case "TIMEOUT":
      suggestions.push(...generateTimeoutSuggestions(parsedLog, isJa));
      break;

    case "OUT_OF_MEMORY":
      suggestions.push(...generateOOMSuggestions(parsedLog, isJa));
      break;

    case "PERMISSION_ERROR":
      suggestions.push(...generatePermissionErrorSuggestions(parsedLog, isJa));
      break;

    case "CONFIGURATION_ERROR":
      suggestions.push(...generateConfigErrorSuggestions(parsedLog, isJa));
      break;

    default:
      suggestions.push(...generateGenericSuggestions(parsedLog, isJa));
      break;
  }

  // 優先度順にソート
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

// ========================================
// テスト失敗の修正提案
// ========================================

function generateTestFailureSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  // 期待値と実際の値が異なる場合
  for (const test of parsedLog.failedTests) {
    if (test.expected && test.actual) {
      suggestions.push({
        title: isJa ? "テストの期待値を確認" : "Check test expectations",
        description: isJa
          ? `テスト「${test.testName}」で期待値と実際の値が異なります。\n期待値: ${test.expected}\n実際: ${test.actual}`
          : `Test "${test.testName}" has mismatched values.\nExpected: ${test.expected}\nActual: ${test.actual}`,
        type: "code_change",
        priority: "high",
        autoApplicable: false,
      });
    }
  }

  // 一般的なテスト失敗の提案
  if (parsedLog.failedTests.length > 0) {
    suggestions.push({
      title: isJa ? "ローカルでテストを実行" : "Run tests locally",
      description: isJa
        ? "ローカル環境でテストを実行して問題を再現してください。"
        : "Run tests locally to reproduce the issue.",
      type: "manual_action",
      priority: "high",
      command: "npm test -- --watch",
      autoApplicable: false,
    });

    // スナップショットの更新提案
    if (parsedLog.failedTests.some(t => t.errorMessage?.includes("snapshot"))) {
      suggestions.push({
        title: isJa ? "スナップショットを更新" : "Update snapshots",
        description: isJa
          ? "スナップショットが古くなっている可能性があります。更新を検討してください。"
          : "Snapshots may be outdated. Consider updating them.",
        type: "manual_action",
        priority: "medium",
        command: "npm test -- -u",
        autoApplicable: false,
      });
    }
  }

  return suggestions;
}

// ========================================
// 型エラーの修正提案
// ========================================

function generateTypeErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  for (const error of parsedLog.typeErrors.slice(0, 5)) {
    // 型の不一致
    if (error.expectedType && error.actualType) {
      suggestions.push({
        title: isJa ? `型を修正: ${error.filePath}` : `Fix type: ${error.filePath}`,
        description: isJa
          ? `型 '${error.actualType}' は型 '${error.expectedType}' に割り当てられません。\n場所: ${error.filePath}:${error.lineNumber}`
          : `Type '${error.actualType}' is not assignable to type '${error.expectedType}'.\nLocation: ${error.filePath}:${error.lineNumber}`,
        type: "code_change",
        priority: "high",
        codeChange: {
          filePath: error.filePath,
          lineNumber: error.lineNumber,
          after: `// TODO: Fix type - expected ${error.expectedType}`,
        },
        autoApplicable: false,
      });
    }

    // プロパティが存在しない
    if (error.message.includes("does not exist on type")) {
      const propMatch = error.message.match(/Property '(\w+)' does not exist on type '([^']+)'/);
      if (propMatch) {
        suggestions.push({
          title: isJa ? `プロパティ '${propMatch[1]}' を追加` : `Add property '${propMatch[1]}'`,
          description: isJa
            ? `型 '${propMatch[2]}' にプロパティ '${propMatch[1]}' が存在しません。型定義を更新するか、オプショナルチェイニングを使用してください。`
            : `Property '${propMatch[1]}' does not exist on type '${propMatch[2]}'. Update the type definition or use optional chaining.`,
          type: "code_change",
          priority: "high",
          autoApplicable: false,
        });
      }
    }
  }

  // TypeScript設定の確認
  if (parsedLog.typeErrors.length > 10) {
    suggestions.push({
      title: isJa ? "tsconfig.jsonを確認" : "Check tsconfig.json",
      description: isJa
        ? "多数の型エラーがあります。TypeScript設定の strict オプションを確認してください。"
        : "Many type errors detected. Check the strict options in tsconfig.json.",
      type: "config_change",
      priority: "medium",
      autoApplicable: false,
    });
  }

  return suggestions;
}

// ========================================
// Lintエラーの修正提案
// ========================================

function generateLintErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  // 自動修正可能なエラーがあれば
  const fixableRules = [
    "semi",
    "quotes",
    "indent",
    "no-trailing-spaces",
    "eol-last",
    "comma-dangle",
    "object-curly-spacing",
    "arrow-parens",
  ];

  const hasFixableErrors = parsedLog.lintErrors.some(e => fixableRules.includes(e.rule));

  if (hasFixableErrors) {
    suggestions.push({
      title: isJa ? "自動修正を実行" : "Run auto-fix",
      description: isJa
        ? "一部のLintエラーは自動修正可能です。"
        : "Some lint errors can be auto-fixed.",
      type: "manual_action",
      priority: "high",
      command: "npm run lint -- --fix",
      autoApplicable: true,
    });
  }

  // Prettierエラー
  if (parsedLog.lintErrors.some(e => e.rule.includes("prettier"))) {
    suggestions.push({
      title: isJa ? "Prettierで整形" : "Format with Prettier",
      description: isJa
        ? "コードフォーマットの問題があります。Prettierを実行してください。"
        : "Code formatting issues detected. Run Prettier.",
      type: "manual_action",
      priority: "high",
      command: "npx prettier --write .",
      autoApplicable: true,
    });
  }

  // 未使用変数
  const unusedVarErrors = parsedLog.lintErrors.filter(
    e => e.rule === "no-unused-vars" || e.rule === "@typescript-eslint/no-unused-vars"
  );
  if (unusedVarErrors.length > 0) {
    suggestions.push({
      title: isJa ? "未使用変数を削除" : "Remove unused variables",
      description: isJa
        ? `${unusedVarErrors.length}個の未使用変数があります。削除または使用してください。`
        : `${unusedVarErrors.length} unused variables found. Remove or use them.`,
      type: "code_change",
      priority: "medium",
      autoApplicable: false,
    });
  }

  return suggestions;
}

// ========================================
// ビルドエラーの修正提案
// ========================================

function generateBuildErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  for (const error of parsedLog.buildErrors) {
    // Module not found
    if (error.message.includes("Module not found")) {
      const moduleMatch = error.message.match(/Module not found:?\s*(?:Error:)?\s*(?:Can't resolve\s+)?['"]?([^'"]+)['"]?/i);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        suggestions.push({
          title: isJa ? `モジュール '${moduleName}' をインストール` : `Install module '${moduleName}'`,
          description: isJa
            ? `モジュール '${moduleName}' が見つかりません。インストールしてください。`
            : `Module '${moduleName}' not found. Install it.`,
          type: "dependency_update",
          priority: "high",
          command: `npm install ${moduleName}`,
          autoApplicable: true,
        });
      }
    }

    // SyntaxError
    if (error.message.includes("SyntaxError")) {
      suggestions.push({
        title: isJa ? "構文エラーを修正" : "Fix syntax error",
        description: isJa
          ? `ファイル ${error.filePath || "不明"} に構文エラーがあります: ${error.message}`
          : `Syntax error in file ${error.filePath || "unknown"}: ${error.message}`,
        type: "code_change",
        priority: "high",
        codeChange: error.filePath
          ? {
              filePath: error.filePath,
              lineNumber: error.lineNumber,
              after: "// Fix syntax error here",
            }
          : undefined,
        autoApplicable: false,
      });
    }
  }

  // キャッシュクリア
  suggestions.push({
    title: isJa ? "ビルドキャッシュをクリア" : "Clear build cache",
    description: isJa
      ? "ビルドキャッシュが破損している可能性があります。"
      : "Build cache may be corrupted.",
    type: "manual_action",
    priority: "medium",
    command: "rm -rf node_modules/.cache && npm run build",
    autoApplicable: false,
  });

  return suggestions;
}

// ========================================
// 依存関係エラーの修正提案
// ========================================

function generateDependencyErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  for (const error of parsedLog.dependencyErrors) {
    switch (error.errorType) {
      case "NOT_FOUND":
        suggestions.push({
          title: isJa
            ? `パッケージ '${error.packageName}' を確認`
            : `Check package '${error.packageName}'`,
          description: isJa
            ? `パッケージ '${error.packageName}' が見つかりません。パッケージ名が正しいか確認してください。`
            : `Package '${error.packageName}' not found. Verify the package name is correct.`,
          type: "dependency_update",
          priority: "high",
          autoApplicable: false,
        });
        break;

      case "PEER_DEPENDENCY":
        suggestions.push({
          title: isJa
            ? `peer dependency '${error.packageName}' をインストール`
            : `Install peer dependency '${error.packageName}'`,
          description: isJa
            ? `peer dependency が不足しています: ${error.packageName}`
            : `Missing peer dependency: ${error.packageName}`,
          type: "dependency_update",
          priority: "high",
          command: `npm install ${error.packageName}`,
          autoApplicable: true,
        });
        break;

      case "VERSION_MISMATCH":
        suggestions.push({
          title: isJa ? "依存関係の競合を解決" : "Resolve dependency conflicts",
          description: isJa
            ? "依存関係のバージョンが競合しています。package-lock.jsonを削除して再インストールを試してください。"
            : "Dependency versions are conflicting. Try deleting package-lock.json and reinstalling.",
          type: "manual_action",
          priority: "high",
          command: "rm -rf node_modules package-lock.json && npm install",
          autoApplicable: false,
        });
        break;

      default:
        break;
    }
  }

  // 一般的な依存関係の提案
  if (parsedLog.dependencyErrors.length > 0) {
    suggestions.push({
      title: isJa ? "node_modulesを再インストール" : "Reinstall node_modules",
      description: isJa
        ? "依存関係の状態をクリアにするため、node_modulesを削除して再インストールしてください。"
        : "Clear dependency state by deleting node_modules and reinstalling.",
      type: "manual_action",
      priority: "medium",
      command: "rm -rf node_modules && npm ci",
      autoApplicable: false,
    });
  }

  return suggestions;
}

// ========================================
// タイムアウトの修正提案
// ========================================

function generateTimeoutSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  suggestions.push({
    title: isJa ? "タイムアウト設定を増やす" : "Increase timeout setting",
    description: isJa
      ? "CIのタイムアウト設定を増やすことを検討してください。"
      : "Consider increasing the CI timeout setting.",
    type: "config_change",
    priority: "high",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "処理を最適化" : "Optimize processing",
    description: isJa
      ? "テストやビルドの処理時間を短縮できないか確認してください。並列実行やキャッシュの活用を検討してください。"
      : "Check if you can reduce test or build processing time. Consider parallel execution or caching.",
    type: "manual_action",
    priority: "medium",
    autoApplicable: false,
  });

  return suggestions;
}

// ========================================
// メモリ不足の修正提案
// ========================================

function generateOOMSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  suggestions.push({
    title: isJa ? "Node.jsのメモリ制限を増やす" : "Increase Node.js memory limit",
    description: isJa
      ? "NODE_OPTIONS環境変数でメモリ制限を増やしてください。"
      : "Increase memory limit using NODE_OPTIONS environment variable.",
    type: "config_change",
    priority: "high",
    command: "NODE_OPTIONS=\"--max-old-space-size=4096\" npm run build",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "メモリ使用量を最適化" : "Optimize memory usage",
    description: isJa
      ? "ビルドプロセスを分割したり、並列処理を減らすことでメモリ使用量を削減できます。"
      : "Reduce memory usage by splitting build process or reducing parallelism.",
    type: "manual_action",
    priority: "medium",
    autoApplicable: false,
  });

  return suggestions;
}

// ========================================
// パーミッションエラーの修正提案
// ========================================

function generatePermissionErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  suggestions.push({
    title: isJa ? "ファイル権限を確認" : "Check file permissions",
    description: isJa
      ? "ファイルまたはディレクトリへのアクセス権限を確認してください。"
      : "Check access permissions for files or directories.",
    type: "manual_action",
    priority: "high",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "CIのトークン権限を確認" : "Check CI token permissions",
    description: isJa
      ? "GitHub Actionsのトークンに必要な権限があるか確認してください。"
      : "Verify that the GitHub Actions token has the required permissions.",
    type: "config_change",
    priority: "high",
    autoApplicable: false,
  });

  return suggestions;
}

// ========================================
// 設定エラーの修正提案
// ========================================

function generateConfigErrorSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  suggestions.push({
    title: isJa ? "設定ファイルを検証" : "Validate configuration file",
    description: isJa
      ? "CI設定ファイル（workflow.yml等）の構文を確認してください。"
      : "Check the syntax of the CI configuration file (workflow.yml, etc.).",
    type: "config_change",
    priority: "high",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "設定ファイルのスキーマを確認" : "Check configuration schema",
    description: isJa
      ? "設定ファイルが正しいスキーマに従っているか確認してください。"
      : "Verify that the configuration file follows the correct schema.",
    type: "manual_action",
    priority: "medium",
    autoApplicable: false,
  });

  return suggestions;
}

// ========================================
// 汎用的な修正提案
// ========================================

function generateGenericSuggestions(parsedLog: ParsedCILog, isJa: boolean): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  suggestions.push({
    title: isJa ? "ログを詳しく確認" : "Review logs in detail",
    description: isJa
      ? "完全なCIログを確認して、エラーの根本原因を特定してください。"
      : "Review the complete CI logs to identify the root cause of the error.",
    type: "manual_action",
    priority: "high",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "ローカルで再現" : "Reproduce locally",
    description: isJa
      ? "ローカル環境で同じコマンドを実行して問題を再現してください。"
      : "Run the same commands locally to reproduce the issue.",
    type: "manual_action",
    priority: "medium",
    autoApplicable: false,
  });

  suggestions.push({
    title: isJa ? "CIキャッシュをクリア" : "Clear CI cache",
    description: isJa
      ? "キャッシュが古くなっている可能性があります。CIのキャッシュをクリアして再実行してください。"
      : "Cache may be stale. Clear the CI cache and re-run.",
    type: "manual_action",
    priority: "low",
    autoApplicable: false,
  });

  return suggestions;
}
