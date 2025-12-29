/**
 * Phase 4: Edge Case Detector
 *
 * 関数の潜在的なエッジケースを検出
 */

import type { FunctionInfo, ParameterInfo } from "./function-analyzer";

// ========================================
// 型定義
// ========================================

export interface EdgeCase {
  /** エッジケースの説明 */
  description: string;
  /** カテゴリ */
  category: EdgeCaseCategory;
  /** 優先度 */
  priority: "high" | "medium" | "low";
  /** テストで使用する入力値の例 */
  testInput?: string;
  /** 期待される動作 */
  expectedBehavior?: string;
}

export type EdgeCaseCategory =
  | "null_undefined"     // null/undefined
  | "empty"              // 空配列、空文字列、空オブジェクト
  | "boundary"           // 境界値（0, -1, MAX_INT など）
  | "type_coercion"      // 型変換
  | "async"              // 非同期関連
  | "error_handling"     // エラーハンドリング
  | "special_chars"      // 特殊文字
  | "concurrency"        // 並行処理
  | "state"              // 状態依存
  | "performance"        // パフォーマンス関連

export interface EdgeCaseAnalysis {
  /** 関数情報 */
  functionInfo: FunctionInfo;
  /** 検出されたエッジケース */
  edgeCases: EdgeCase[];
  /** テストの難易度 */
  testDifficulty: "easy" | "medium" | "hard";
  /** 推奨テスト数 */
  recommendedTestCount: number;
}

// ========================================
// メイン関数
// ========================================

/**
 * 関数のエッジケースを検出
 */
export function detectEdgeCases(func: FunctionInfo): EdgeCaseAnalysis {
  const edgeCases: EdgeCase[] = [];

  // パラメータベースのエッジケース
  for (const param of func.parameters) {
    edgeCases.push(...detectParameterEdgeCases(param));
  }

  // 関数本体ベースのエッジケース
  edgeCases.push(...detectBodyEdgeCases(func));

  // 戻り値ベースのエッジケース
  edgeCases.push(...detectReturnTypeEdgeCases(func));

  // 非同期関連のエッジケース
  if (func.isAsync) {
    edgeCases.push(...detectAsyncEdgeCases(func));
  }

  // 使用APIベースのエッジケース
  edgeCases.push(...detectAPIEdgeCases(func));

  // 重複を除去
  const uniqueEdgeCases = deduplicateEdgeCases(edgeCases);

  // テスト難易度を計算
  const testDifficulty = calculateTestDifficulty(func, uniqueEdgeCases);

  // 推奨テスト数を計算
  const recommendedTestCount = calculateRecommendedTests(uniqueEdgeCases, testDifficulty);

  return {
    functionInfo: func,
    edgeCases: uniqueEdgeCases,
    testDifficulty,
    recommendedTestCount,
  };
}

// ========================================
// パラメータベースの検出
// ========================================

function detectParameterEdgeCases(param: ParameterInfo): EdgeCase[] {
  const cases: EdgeCase[] = [];
  const typeLower = param.type.toLowerCase();

  // null/undefined のケース
  if (param.isOptional || typeLower.includes("null") || typeLower.includes("undefined")) {
    cases.push({
      description: `${param.name} が undefined の場合`,
      category: "null_undefined",
      priority: "high",
      testInput: "undefined",
      expectedBehavior: "適切にハンドリングされる",
    });
  }

  // 文字列型
  if (typeLower.includes("string")) {
    cases.push({
      description: `${param.name} が空文字列の場合`,
      category: "empty",
      priority: "high",
      testInput: '""',
    });
    cases.push({
      description: `${param.name} に特殊文字が含まれる場合`,
      category: "special_chars",
      priority: "medium",
      testInput: '"<script>alert(1)</script>"',
    });
    cases.push({
      description: `${param.name} が非常に長い文字列の場合`,
      category: "boundary",
      priority: "low",
      testInput: '"a".repeat(10000)',
    });
  }

  // 数値型
  if (typeLower.includes("number") || typeLower === "int" || typeLower === "float") {
    cases.push({
      description: `${param.name} が 0 の場合`,
      category: "boundary",
      priority: "high",
      testInput: "0",
    });
    cases.push({
      description: `${param.name} が負の数の場合`,
      category: "boundary",
      priority: "high",
      testInput: "-1",
    });
    cases.push({
      description: `${param.name} が NaN の場合`,
      category: "boundary",
      priority: "medium",
      testInput: "NaN",
    });
    cases.push({
      description: `${param.name} が Infinity の場合`,
      category: "boundary",
      priority: "low",
      testInput: "Infinity",
    });
  }

  // 配列型
  if (typeLower.includes("[]") || typeLower.includes("array")) {
    cases.push({
      description: `${param.name} が空配列の場合`,
      category: "empty",
      priority: "high",
      testInput: "[]",
    });
    cases.push({
      description: `${param.name} が1要素の配列の場合`,
      category: "boundary",
      priority: "medium",
      testInput: "[item]",
    });
    cases.push({
      description: `${param.name} に重複要素がある場合`,
      category: "state",
      priority: "low",
      testInput: "[a, a, b]",
    });
  }

  // オブジェクト型
  if (typeLower.includes("object") || typeLower.includes("{")) {
    cases.push({
      description: `${param.name} が空オブジェクトの場合`,
      category: "empty",
      priority: "medium",
      testInput: "{}",
    });
    cases.push({
      description: `${param.name} に null の場合`,
      category: "null_undefined",
      priority: "high",
      testInput: "null",
    });
  }

  // boolean型
  if (typeLower === "boolean") {
    cases.push({
      description: `${param.name} が true の場合`,
      category: "boundary",
      priority: "high",
      testInput: "true",
    });
    cases.push({
      description: `${param.name} が false の場合`,
      category: "boundary",
      priority: "high",
      testInput: "false",
    });
  }

  // Date型
  if (typeLower.includes("date")) {
    cases.push({
      description: `${param.name} が無効な日付の場合`,
      category: "boundary",
      priority: "medium",
      testInput: 'new Date("invalid")',
    });
    cases.push({
      description: `${param.name} がエポック時間0の場合`,
      category: "boundary",
      priority: "low",
      testInput: "new Date(0)",
    });
  }

  return cases;
}

// ========================================
// 関数本体ベースの検出
// ========================================

function detectBodyEdgeCases(func: FunctionInfo): EdgeCase[] {
  const cases: EdgeCase[] = [];
  const body = func.body;

  // 配列アクセス
  if (body.includes("[") && body.includes("]")) {
    cases.push({
      description: "配列の範囲外アクセス",
      category: "boundary",
      priority: "high",
      expectedBehavior: "エラーまたは undefined を返す",
    });
  }

  // 除算
  if (body.includes("/") && !body.includes("//")) {
    cases.push({
      description: "ゼロ除算",
      category: "boundary",
      priority: "high",
      expectedBehavior: "Infinity または NaN を返す、またはエラー",
    });
  }

  // 正規表現
  if (body.includes("RegExp") || body.includes("/.*?/") || body.match(/\/[^\/]+\//)) {
    cases.push({
      description: "正規表現のパフォーマンス（ReDoS）",
      category: "performance",
      priority: "medium",
      testInput: "非常に長いマッチしない文字列",
    });
  }

  // JSON.parse
  if (body.includes("JSON.parse")) {
    cases.push({
      description: "不正なJSONのパース",
      category: "error_handling",
      priority: "high",
      testInput: '"invalid json"',
      expectedBehavior: "SyntaxError をスロー",
    });
  }

  // try-catch がない場合のエラー処理
  if (!body.includes("try") && !body.includes("catch")) {
    if (func.dependencies.some(dep =>
      dep.includes("fetch") || dep.includes("axios") || dep.includes("prisma") || dep.includes("fs")
    )) {
      cases.push({
        description: "外部API/IO呼び出しの失敗",
        category: "error_handling",
        priority: "high",
        expectedBehavior: "エラーが適切に伝播される",
      });
    }
  }

  // Object.keys, Object.values, Object.entries
  if (body.includes("Object.keys") || body.includes("Object.values") || body.includes("Object.entries")) {
    cases.push({
      description: "オブジェクトが null/undefined の場合",
      category: "null_undefined",
      priority: "high",
      expectedBehavior: "TypeError をスロー",
    });
  }

  // .length アクセス
  if (body.includes(".length")) {
    cases.push({
      description: "null/undefined の .length アクセス",
      category: "null_undefined",
      priority: "high",
      expectedBehavior: "TypeError をスロー",
    });
  }

  // .map, .filter, .reduce などの配列メソッド
  if (body.match(/\.(map|filter|reduce|forEach|find|some|every)\(/)) {
    cases.push({
      description: "コールバック内でエラーが発生した場合",
      category: "error_handling",
      priority: "medium",
    });
  }

  return cases;
}

// ========================================
// 戻り値ベースの検出
// ========================================

function detectReturnTypeEdgeCases(func: FunctionInfo): EdgeCase[] {
  const cases: EdgeCase[] = [];
  const returnType = func.returnType.toLowerCase();

  // Promise型
  if (returnType.includes("promise")) {
    cases.push({
      description: "Promise が reject された場合",
      category: "async",
      priority: "high",
      expectedBehavior: "エラーが適切にハンドリングされる",
    });
  }

  // 配列を返す場合
  if (returnType.includes("[]") || returnType.includes("array")) {
    cases.push({
      description: "空配列を返す条件",
      category: "empty",
      priority: "medium",
    });
  }

  // null/undefined を返す可能性
  if (returnType.includes("null") || returnType.includes("undefined") || returnType.includes("|")) {
    cases.push({
      description: "null/undefined を返す条件",
      category: "null_undefined",
      priority: "high",
    });
  }

  return cases;
}

// ========================================
// 非同期関連の検出
// ========================================

function detectAsyncEdgeCases(func: FunctionInfo): EdgeCase[] {
  const cases: EdgeCase[] = [];
  const body = func.body;

  cases.push({
    description: "非同期処理のタイムアウト",
    category: "async",
    priority: "medium",
    expectedBehavior: "タイムアウト時の動作が定義されている",
  });

  // 複数の await
  const awaitCount = (body.match(/\bawait\b/g) || []).length;
  if (awaitCount > 1) {
    cases.push({
      description: "並列実行可能な await の最適化",
      category: "performance",
      priority: "low",
    });
    cases.push({
      description: "await の途中で失敗した場合の部分的な成功",
      category: "async",
      priority: "medium",
    });
  }

  // Promise.all
  if (body.includes("Promise.all")) {
    cases.push({
      description: "Promise.all で1つが reject された場合",
      category: "async",
      priority: "high",
      expectedBehavior: "全体が reject される",
    });
    cases.push({
      description: "Promise.all に空配列を渡した場合",
      category: "empty",
      priority: "medium",
      expectedBehavior: "空配列で resolve される",
    });
  }

  // Promise.race
  if (body.includes("Promise.race")) {
    cases.push({
      description: "Promise.race に空配列を渡した場合",
      category: "async",
      priority: "high",
      expectedBehavior: "永遠に pending 状態",
    });
  }

  return cases;
}

// ========================================
// API使用ベースの検出
// ========================================

function detectAPIEdgeCases(func: FunctionInfo): EdgeCase[] {
  const cases: EdgeCase[] = [];
  const usedAPIs = func.usedAPIs;

  if (usedAPIs.includes("fetch") || usedAPIs.includes("axios")) {
    cases.push({
      description: "ネットワークエラー（接続失敗）",
      category: "error_handling",
      priority: "high",
    });
    cases.push({
      description: "HTTPステータスコード 4xx/5xx",
      category: "error_handling",
      priority: "high",
    });
    cases.push({
      description: "レスポンスボディが空の場合",
      category: "empty",
      priority: "medium",
    });
  }

  if (usedAPIs.includes("fs")) {
    cases.push({
      description: "ファイルが存在しない場合",
      category: "error_handling",
      priority: "high",
    });
    cases.push({
      description: "ファイルへのアクセス権限がない場合",
      category: "error_handling",
      priority: "medium",
    });
  }

  if (usedAPIs.includes("prisma") || usedAPIs.includes("db") || usedAPIs.includes("database")) {
    cases.push({
      description: "データベース接続エラー",
      category: "error_handling",
      priority: "high",
    });
    cases.push({
      description: "レコードが見つからない場合",
      category: "empty",
      priority: "high",
    });
    cases.push({
      description: "一意性制約違反",
      category: "error_handling",
      priority: "medium",
    });
  }

  if (usedAPIs.includes("localStorage") || usedAPIs.includes("sessionStorage")) {
    cases.push({
      description: "ストレージが無効/利用不可の場合",
      category: "error_handling",
      priority: "medium",
    });
    cases.push({
      description: "ストレージ容量超過",
      category: "boundary",
      priority: "low",
    });
  }

  if (usedAPIs.includes("Date")) {
    cases.push({
      description: "タイムゾーンの違い",
      category: "state",
      priority: "medium",
    });
    cases.push({
      description: "夏時間の切り替わり",
      category: "boundary",
      priority: "low",
    });
  }

  return cases;
}

// ========================================
// ユーティリティ
// ========================================

/**
 * 重複するエッジケースを除去
 */
function deduplicateEdgeCases(cases: EdgeCase[]): EdgeCase[] {
  const seen = new Set<string>();
  return cases.filter(c => {
    const key = `${c.category}:${c.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * テスト難易度を計算
 */
function calculateTestDifficulty(
  func: FunctionInfo,
  edgeCases: EdgeCase[]
): "easy" | "medium" | "hard" {
  let score = 0;

  // パラメータ数
  score += func.parameters.length * 2;

  // 非同期
  if (func.isAsync) score += 3;

  // エッジケース数
  score += edgeCases.length;

  // 高優先度のエッジケース
  score += edgeCases.filter(c => c.priority === "high").length * 2;

  // 外部依存
  if (func.usedAPIs.length > 0) score += func.usedAPIs.length * 2;

  // スコアに基づいて難易度を判定
  if (score <= 5) return "easy";
  if (score <= 15) return "medium";
  return "hard";
}

/**
 * 推奨テスト数を計算
 */
function calculateRecommendedTests(
  edgeCases: EdgeCase[],
  difficulty: "easy" | "medium" | "hard"
): number {
  // 基本テスト（正常系）
  let count = 1;

  // 高優先度のエッジケース
  count += edgeCases.filter(c => c.priority === "high").length;

  // 中優先度のエッジケース（一部）
  count += Math.ceil(edgeCases.filter(c => c.priority === "medium").length * 0.5);

  // 難易度による調整
  if (difficulty === "easy") {
    count = Math.max(count, 2);
  } else if (difficulty === "hard") {
    count = Math.max(count, 5);
  }

  return Math.min(count, 10); // 最大10テスト
}

/**
 * エッジケースをMarkdown形式で出力
 */
export function formatEdgeCasesMarkdown(analysis: EdgeCaseAnalysis): string {
  const lines: string[] = [];

  lines.push(`### エッジケース分析: \`${analysis.functionInfo.name}\``);
  lines.push("");
  lines.push(`- **テスト難易度**: ${analysis.testDifficulty}`);
  lines.push(`- **推奨テスト数**: ${analysis.recommendedTestCount}`);
  lines.push("");

  const byCategory = new Map<EdgeCaseCategory, EdgeCase[]>();
  for (const c of analysis.edgeCases) {
    const list = byCategory.get(c.category) || [];
    list.push(c);
    byCategory.set(c.category, list);
  }

  for (const [category, cases] of byCategory) {
    lines.push(`#### ${getCategoryLabel(category)}`);
    for (const c of cases) {
      const priority = c.priority === "high" ? "🔴" : c.priority === "medium" ? "🟡" : "🟢";
      lines.push(`- ${priority} ${c.description}`);
      if (c.testInput) {
        lines.push(`  - 入力例: \`${c.testInput}\``);
      }
      if (c.expectedBehavior) {
        lines.push(`  - 期待動作: ${c.expectedBehavior}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getCategoryLabel(category: EdgeCaseCategory): string {
  const labels: Record<EdgeCaseCategory, string> = {
    null_undefined: "Null/Undefined ハンドリング",
    empty: "空値のハンドリング",
    boundary: "境界値",
    type_coercion: "型変換",
    async: "非同期処理",
    error_handling: "エラーハンドリング",
    special_chars: "特殊文字",
    concurrency: "並行処理",
    state: "状態依存",
    performance: "パフォーマンス",
  };
  return labels[category] || category;
}
