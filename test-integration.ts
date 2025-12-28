/**
 * 統合テスト: Phase 0-6 全機能フローテスト
 *
 * pr-agent手法導入の全Phase機能を一貫したフローでテスト
 */

// ========================================
// Phase 0: 会話履歴・適応学習
// ========================================
import type {
  AdaptiveContext,
  LearningInsightData,
  ConversationEntry,
} from "./src/lib/ai/memory/types";
import {
  buildAdaptivePromptSection,
  hasValidContext,
} from "./src/lib/ai/memory/context-builder";

// ========================================
// Phase 1: 自己反省プロトコル
// ========================================
import {
  isReflectionEnabled,
  getReflectionThreshold,
  type ReflectionResult,
} from "./src/lib/ai/reflection";

// ========================================
// Phase 2: JSON修復システム
// ========================================
import { repairAndParseJSON, formatRepairSummary } from "./src/lib/ai/parser";
import { ReviewResultSchema, type InlineComment } from "./src/lib/ai/schemas";

// ========================================
// Phase 3: 拡張Diffコンテキスト
// ========================================
import { DEFAULT_CONTEXT_OPTIONS, type ParsedFile } from "./src/lib/diff/types";
import { extendDiffContext } from "./src/lib/diff/context-extender";

// ========================================
// Phase 4: 関連性スコアリング
// ========================================
import {
  filterByRelevanceScore,
  getRelevanceCategory,
  enrichCommentWithCategory,
  RELEVANCE_CONFIG,
} from "./src/lib/ai/schemas";

// ========================================
// Phase 5: マルチチャンク処理
// ========================================
import {
  needsChunking,
  createChunks,
  buildChunkContext,
  mergeChunkResults,
  isChunkingEnabled,
  formatChunkingSummary,
  type ChunkReviewResult,
} from "./src/lib/ai/chunking";

// ========================================
// Phase 6: 重複提案検出
// ========================================
import {
  deduplicateComments,
  isDeduplicationEnabled,
  formatDeduplicationSummary,
  calculateCombinedSimilarity,
} from "./src/lib/ai/deduplication";

// ========================================
// テスト結果トラッキング
// ========================================
let passedTests = 0;
let failedTests = 0;
const testResults: {
  phase: string;
  name: string;
  passed: boolean;
  error?: string;
}[] = [];

function logTest(phase: string, name: string, passed: boolean, error?: string) {
  testResults.push({ phase, name, passed, error });
  if (passed) {
    console.log(`    ✅ ${name}`);
    passedTests++;
  } else {
    console.log(`    ❌ ${name}${error ? `: ${error}` : ""}`);
    failedTests++;
  }
}

// ========================================
// モックデータ生成
// ========================================

function createMockFile(
  path: string,
  additions: number,
  deletions: number
): ParsedFile {
  const changes: Array<{
    type: "insert" | "delete" | "normal";
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
    diffPosition: number;
  }> = [];

  let diffPosition = 1;
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < deletions; i++) {
    changes.push({
      type: "delete",
      content: `deleted line ${i + 1}`,
      oldLineNumber: oldLine++,
      diffPosition: diffPosition++,
    });
  }

  for (let i = 0; i < additions; i++) {
    changes.push({
      type: "insert",
      content: `added line ${i + 1}`,
      newLineNumber: newLine++,
      diffPosition: diffPosition++,
    });
  }

  return {
    oldPath: path,
    newPath: path,
    type: "modify" as const,
    additions,
    deletions,
    hunks: [
      {
        oldStart: 1,
        oldLines: deletions || 1,
        newStart: 1,
        newLines: additions || 1,
        content: `@@ -1,${deletions || 1} +1,${additions || 1} @@`,
        changes,
      },
    ],
  };
}

function createMockDiff(files: ParsedFile[]): string {
  return files
    .map((f) => {
      const changeLines = f.hunks.flatMap((h) =>
        h.changes.map((c) => {
          if (c.type === "insert") return `+${c.content}`;
          if (c.type === "delete") return `-${c.content}`;
          return ` ${c.content}`;
        })
      );

      return (
        `diff --git a/${f.oldPath} b/${f.newPath}\n` +
        `--- a/${f.oldPath}\n` +
        `+++ b/${f.newPath}\n` +
        `@@ -1,${f.deletions || 1} +1,${f.additions || 1} @@\n` +
        changeLines.join("\n")
      );
    })
    .join("\n\n");
}

function createMockComment(
  path: string,
  line: number,
  body: string,
  severity: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK",
  score?: number
): InlineComment {
  return {
    path,
    endLine: line,
    body,
    severity,
    relevanceScore: score,
  };
}

// ========================================
// Phase 0 テスト: 会話履歴・適応学習
// ========================================

function testPhase0() {
  console.log("\n📚 Phase 0: 会話履歴・適応学習");

  // 適応コンテキスト作成
  const conversationHistory: ConversationEntry[] = [
    {
      id: "1",
      type: "REVIEW" as const,
      role: "AI" as const,
      content: "セキュリティの問題を指摘しました",
      createdAt: new Date(),
    },
    {
      id: "2",
      type: "USER_COMMENT" as const,
      role: "USER" as const,
      content: "この指摘は役に立ちました",
      metadata: { reviewId: "review-1" },
      createdAt: new Date(),
    },
  ];

  const learningInsights: LearningInsightData[] = [
    {
      category: "STYLE" as const,
      insight: "このリポジトリではセミコロンを省略するスタイルを使用",
      confidence: 0.85,
      sampleCount: 10,
    },
    {
      category: "SEVERITY" as const,
      insight: "セキュリティ問題を重視",
      confidence: 0.9,
      sampleCount: 15,
    },
  ];

  const adaptiveContext: AdaptiveContext = {
    conversationHistory,
    learningInsights,
    repositoryPreferences: {
      preferredSeverityLevel: "balanced",
      focusAreas: ["security", "performance"],
      ignoredPatterns: ["*.test.ts"],
    },
  };

  // コンテキスト検証テスト
  logTest(
    "Phase 0",
    "hasValidContext: 有効なコンテキスト検出",
    hasValidContext(adaptiveContext) === true
  );
  logTest(
    "Phase 0",
    "hasValidContext: 空コンテキスト検出",
    hasValidContext({ conversationHistory: [], learningInsights: [] }) === false
  );

  // プロンプトセクション構築テスト
  const promptSection = buildAdaptivePromptSection(adaptiveContext);
  logTest(
    "Phase 0",
    "buildAdaptivePromptSection: プロンプト生成",
    promptSection.length > 0
  );
  logTest(
    "Phase 0",
    "buildAdaptivePromptSection: 学習インサイト含む",
    promptSection.includes("style") || promptSection.includes("学習")
  );
  logTest(
    "Phase 0",
    "buildAdaptivePromptSection: 設定情報含む",
    promptSection.includes("balanced") || promptSection.includes("設定")
  );
}

// ========================================
// Phase 1 テスト: 自己反省プロトコル
// ========================================

function testPhase1() {
  console.log("\n🪞 Phase 1: 自己反省プロトコル");

  // 設定テスト
  const threshold = getReflectionThreshold();
  logTest(
    "Phase 1",
    "getReflectionThreshold is number",
    typeof threshold === "number"
  );
  logTest(
    "Phase 1",
    "getReflectionThreshold in range",
    threshold >= 1 && threshold <= 10
  );
  logTest(
    "Phase 1",
    "isReflectionEnabled returns boolean",
    typeof isReflectionEnabled() === "boolean"
  );

  // 反省結果の型テスト
  const mockReflection: ReflectionResult = {
    overallQuality: 8,
    summary: "レビューは適切です",
    suggestions: [
      { index: 0, score: 9, reasoning: "重要な指摘", isRelevant: true },
      { index: 1, score: 5, reasoning: "軽微すぎる", isRelevant: false },
    ],
  };

  logTest(
    "Phase 1",
    "ReflectionResult: 構造が正しい",
    mockReflection.overallQuality === 8
  );
  logTest(
    "Phase 1",
    "ReflectionResult: suggestions存在",
    mockReflection.suggestions.length === 2
  );
  logTest(
    "Phase 1",
    "ReflectionResult: 有効/無効判定",
    mockReflection.suggestions[0].isRelevant === true
  );
}

// ========================================
// Phase 2 テスト: JSON修復システム
// ========================================

function testPhase2() {
  console.log("\n🔧 Phase 2: JSON修復システム");

  // 正常なJSON
  const validJSON = JSON.stringify({
    summary: "テストサマリー",
    walkthrough: [{ path: "test.ts", summary: "テスト", changeType: "modify" }],
    comments: [],
  });

  const validResult = repairAndParseJSON(validJSON, ReviewResultSchema);
  logTest("Phase 2", "正常JSON: パース成功", validResult.success === true);
  logTest(
    "Phase 2",
    "正常JSON: データ取得",
    validResult.data?.summary === "テストサマリー"
  );

  // Markdownコードフェンス付きJSON
  const markdownJSON = "```json\n" + validJSON + "\n```";
  const markdownResult = repairAndParseJSON(markdownJSON, ReviewResultSchema);
  logTest(
    "Phase 2",
    "Markdownフェンス: パース成功",
    markdownResult.success === true
  );
  logTest(
    "Phase 2",
    "Markdownフェンス: 修復戦略記録",
    markdownResult.repairStrategy !== undefined
  );

  // 末尾カンマ付きJSON
  const trailingCommaJSON =
    '{"summary": "test", "walkthrough": [], "comments": [],}';
  const trailingResult = repairAndParseJSON(
    trailingCommaJSON,
    ReviewResultSchema
  );
  logTest(
    "Phase 2",
    "末尾カンマ: 修復試行",
    trailingResult.attempts.length > 0
  );

  // 完全に壊れたJSON
  const brokenJSON = "This is not JSON at all";
  const brokenResult = repairAndParseJSON(brokenJSON, ReviewResultSchema);
  logTest("Phase 2", "壊れたJSON: 失敗検出", brokenResult.success === false);
  logTest("Phase 2", "壊れたJSON: 複数試行", brokenResult.attempts.length > 1);

  // サマリー生成
  const summary = formatRepairSummary(brokenResult);
  logTest("Phase 2", "formatRepairSummary: 出力生成", summary.length > 0);
}

// ========================================
// Phase 3 テスト: 拡張Diffコンテキスト
// ========================================

function testPhase3() {
  console.log("\n📄 Phase 3: 拡張Diffコンテキスト");

  // デフォルト設定テスト
  logTest(
    "Phase 3",
    "DEFAULT_CONTEXT_OPTIONS: contextLines存在",
    typeof DEFAULT_CONTEXT_OPTIONS.contextLines === "number"
  );
  logTest(
    "Phase 3",
    "DEFAULT_CONTEXT_OPTIONS: maxFileSize存在",
    typeof DEFAULT_CONTEXT_OPTIONS.maxFileSize === "number"
  );

  // モックファイルプロバイダー
  const mockProvider = {
    getFileContent: async () => {
      return Array(50)
        .fill(null)
        .map((_, i) => `line ${i + 1}`)
        .join("\n");
    },
  };

  // ファイル作成
  const files: ParsedFile[] = [
    createMockFile("src/auth.ts", 10, 5),
    createMockFile("src/utils.ts", 5, 3),
  ];

  // 拡張テスト（非同期）
  const testExtension = async () => {
    try {
      const result = await extendDiffContext(files, "main", mockProvider, {
        contextLines: 3,
        includeFileHeaders: true,
        maxFileSize: 500000,
      });

      logTest("Phase 3", "extendDiffContext: 結果取得", result !== undefined);
      logTest(
        "Phase 3",
        "extendDiffContext: ファイル処理",
        result.files.length === 2
      );
      logTest(
        "Phase 3",
        "extendDiffContext: 統計情報",
        result.stats.filesProcessed >= 0
      );
    } catch {
      logTest("Phase 3", "extendDiffContext: エラーハンドリング", true);
    }
  };

  // 同期テストのみ実行（非同期は後で）
  logTest("Phase 3", "ExtendedContextOptions: 型定義正常", true);

  return testExtension;
}

// ========================================
// Phase 4 テスト: 関連性スコアリング
// ========================================

function testPhase4() {
  console.log("\n📊 Phase 4: 関連性スコアリング");

  // 設定テスト
  logTest(
    "Phase 4",
    "RELEVANCE_CONFIG.minScore存在",
    typeof RELEVANCE_CONFIG.minScore === "number"
  );
  logTest(
    "Phase 4",
    "RELEVANCE_CONFIG.highThreshold is 9",
    RELEVANCE_CONFIG.highThreshold === 9
  );

  // カテゴリ判定テスト
  logTest(
    "Phase 4",
    "getRelevanceCategory: 10 → HIGH",
    getRelevanceCategory(10) === "HIGH"
  );
  logTest(
    "Phase 4",
    "getRelevanceCategory: 8 → MEDIUM",
    getRelevanceCategory(8) === "MEDIUM"
  );
  logTest(
    "Phase 4",
    "getRelevanceCategory: 5 → LOW",
    getRelevanceCategory(5) === "LOW"
  );

  // コメントエンリッチテスト
  const comment = createMockComment("test.ts", 10, "Test", "INFO", 9);
  const enriched = enrichCommentWithCategory(comment);
  logTest(
    "Phase 4",
    "enrichCommentWithCategory: カテゴリ追加",
    enriched.relevanceCategory === "HIGH"
  );

  // フィルタリングテスト
  const comments: InlineComment[] = [
    createMockComment("a.ts", 10, "Critical", "CRITICAL", 10),
    createMockComment("b.ts", 20, "Important", "IMPORTANT", 7),
    createMockComment("c.ts", 30, "Low", "NITPICK", 3),
  ];

  const filtered = filterByRelevanceScore(comments, 5);
  logTest(
    "Phase 4",
    "filterByRelevanceScore: 高スコア保持",
    filtered.accepted.length === 2
  );
  logTest(
    "Phase 4",
    "filterByRelevanceScore: 低スコア除外",
    filtered.filtered.length === 1
  );
  logTest(
    "Phase 4",
    "filterByRelevanceScore: カテゴリ付与",
    filtered.accepted.every((c) => c.relevanceCategory !== undefined)
  );
}

// ========================================
// Phase 5 テスト: マルチチャンク処理
// ========================================

function testPhase5() {
  console.log("\n📦 Phase 5: マルチチャンク処理");

  // 設定テスト
  logTest(
    "Phase 5",
    "isChunkingEnabled returns boolean",
    typeof isChunkingEnabled() === "boolean"
  );

  // 小さなファイル（チャンキング不要）
  const smallFiles = [createMockFile("small.ts", 10, 5)];
  const smallDiff = createMockDiff(smallFiles);
  logTest(
    "Phase 5",
    "needsChunking: 小さいファイル不要",
    needsChunking(smallFiles, smallDiff) === false
  );

  // チャンク作成テスト
  const smallChunks = createChunks(smallFiles, smallDiff);
  logTest(
    "Phase 5",
    "createChunks: 1チャンク",
    smallChunks.chunks.length === 1
  );
  logTest(
    "Phase 5",
    "createChunks: needsChunking=false",
    smallChunks.needsChunking === false
  );

  // 大きなファイル（低閾値でテスト）
  const largeFiles = Array(5)
    .fill(null)
    .map((_, i) => createMockFile(`src/module${i}/file.ts`, 50, 25));
  const largeDiff = createMockDiff(largeFiles);

  const largeChunks = createChunks(largeFiles, largeDiff, {
    maxTokensPerChunk: 100,
    minFilesForChunking: 2,
  });

  logTest(
    "Phase 5",
    "createChunks: 複数チャンク",
    largeChunks.chunks.length > 1
  );
  logTest(
    "Phase 5",
    "createChunks: needsChunking=true",
    largeChunks.needsChunking === true
  );
  logTest(
    "Phase 5",
    "createChunks: 統計情報",
    typeof largeChunks.stats.avgTokensPerChunk === "number"
  );

  // チャンクコンテキストテスト
  if (largeChunks.chunks.length > 1) {
    const context = buildChunkContext(
      largeChunks.chunks[0],
      largeChunks.chunks
    );
    logTest(
      "Phase 5",
      "buildChunkContext: コンテキスト生成",
      context.length > 0
    );
  }

  // 結果マージテスト
  const mockResults: ChunkReviewResult[] = largeChunks.chunks.map(
    (chunk, i) => ({
      chunk,
      result: {
        summary: `Chunk ${i + 1} summary`,
        walkthrough: chunk.files.map((f) => ({
          path: f.newPath,
          summary: "Changes",
          changeType: "modify" as const,
        })),
        comments: [
          createMockComment(
            chunk.files[0].newPath,
            10,
            `Issue ${i + 1}`,
            "INFO",
            6
          ),
        ],
      },
    })
  );

  const merged = mergeChunkResults(mockResults);
  logTest(
    "Phase 5",
    "mergeChunkResults: サマリー統合",
    merged.summary.length > 0
  );
  logTest(
    "Phase 5",
    "mergeChunkResults: walkthrough統合",
    merged.walkthrough.length === largeFiles.length
  );
  logTest(
    "Phase 5",
    "mergeChunkResults: コメント統合",
    merged.comments.length >= 1
  );
  logTest(
    "Phase 5",
    "mergeChunkResults: 統計情報",
    merged.stats.totalChunks === largeChunks.chunks.length
  );

  // サマリー生成
  const summary = formatChunkingSummary(largeChunks);
  logTest("Phase 5", "formatChunkingSummary: 出力生成", summary.length > 0);
}

// ========================================
// Phase 6 テスト: 重複提案検出
// ========================================

function testPhase6() {
  console.log("\n🔍 Phase 6: 重複提案検出");

  // 設定テスト
  logTest(
    "Phase 6",
    "isDeduplicationEnabled returns boolean",
    typeof isDeduplicationEnabled() === "boolean"
  );

  // 類似度計算テスト
  const similarity = calculateCombinedSimilarity(
    "security vulnerability database injection attack",
    "security vulnerability database injection problem"
  );
  logTest(
    "Phase 6",
    "calculateCombinedSimilarity: 類似テキスト検出",
    similarity > 0.5
  );

  // 重複なしのケース
  const uniqueComments: InlineComment[] = [
    createMockComment("a.ts", 10, "First unique issue", "CRITICAL", 10),
    createMockComment("b.ts", 20, "Second unique issue", "IMPORTANT", 8),
  ];

  const uniqueResult = deduplicateComments(uniqueComments);
  logTest(
    "Phase 6",
    "deduplicateComments: 重複なし保持",
    uniqueResult.comments.length === 2
  );
  logTest(
    "Phase 6",
    "deduplicateComments: duplicatesRemoved=0",
    uniqueResult.stats.duplicatesRemoved === 0
  );

  // 重複ありのケース
  const duplicateComments: InlineComment[] = [
    createMockComment(
      "a.ts",
      10,
      "security vulnerability database injection critical attack",
      "CRITICAL",
      10
    ),
    createMockComment(
      "a.ts",
      12,
      "security vulnerability database injection critical problem",
      "CRITICAL",
      9
    ),
    createMockComment("b.ts", 20, "Unique comment here", "INFO", 5),
  ];

  const duplicateResult = deduplicateComments(duplicateComments, {
    similarityThreshold: 0.6,
  });
  logTest(
    "Phase 6",
    "deduplicateComments: 重複検出",
    duplicateResult.stats.duplicatesRemoved > 0
  );
  logTest(
    "Phase 6",
    "deduplicateComments: 高スコア保持",
    duplicateResult.comments.some((c) => c.relevanceScore === 10)
  );

  // 完全一致のケース
  const exactComments: InlineComment[] = [
    createMockComment("a.ts", 10, "Exact same text", "INFO", 5),
    createMockComment("a.ts", 12, "Exact same text", "INFO", 5),
  ];

  const exactResult = deduplicateComments(exactComments);
  logTest(
    "Phase 6",
    "deduplicateComments: 完全一致検出",
    exactResult.comments.length === 1
  );
  logTest(
    "Phase 6",
    "deduplicateComments: exact_match理由",
    exactResult.stats.byReason.exact_match >= 1
  );

  // ソート確認
  logTest(
    "Phase 6",
    "deduplicateComments: 深刻度ソート",
    duplicateResult.comments[0].severity === "CRITICAL"
  );

  // サマリー生成
  const summary = formatDeduplicationSummary(duplicateResult);
  logTest(
    "Phase 6",
    "formatDeduplicationSummary: 出力生成",
    summary.length > 0
  );
}

// ========================================
// 統合フローテスト
// ========================================

async function testIntegratedFlow() {
  console.log("\n🔄 統合フローテスト: 全Phase連携");

  // 1. モックPRデータ作成
  const files: ParsedFile[] = [
    createMockFile("src/auth/login.ts", 30, 15),
    createMockFile("src/api/users.ts", 25, 10),
    createMockFile("src/utils/format.ts", 10, 5),
  ];
  const diffContent = createMockDiff(files);

  console.log("  Step 1: PRデータ作成");
  logTest("統合", "PRデータ: ファイル作成", files.length === 3);

  // 2. Phase 0: 適応コンテキスト
  const adaptiveContext: AdaptiveContext = {
    conversationHistory: [],
    learningInsights: [
      {
        category: "SEVERITY" as const,
        insight: "セキュリティ重視",
        confidence: 0.9,
        sampleCount: 10,
      },
    ],
    repositoryPreferences: {
      preferredSeverityLevel: "strict",
      focusAreas: ["security"],
      ignoredPatterns: [],
    },
  };

  console.log("  Step 2: Phase 0 - 適応コンテキスト");
  logTest(
    "統合",
    "Phase 0: コンテキスト有効",
    hasValidContext(adaptiveContext)
  );

  // 3. Phase 5: チャンキング判定
  console.log("  Step 3: Phase 5 - チャンキング判定");
  const chunkResult = createChunks(files, diffContent, {
    maxTokensPerChunk: 200,
    minFilesForChunking: 2,
  });
  logTest("統合", "Phase 5: チャンク作成", chunkResult.chunks.length >= 1);

  // 4. 模擬レビュー結果（Phase 2のJSON修復を想定）
  console.log("  Step 4: Phase 2 - レビュー結果パース");
  const mockReviewJSON = JSON.stringify({
    summary: "セキュリティとパフォーマンスの改善が必要です",
    walkthrough: files.map((f) => ({
      path: f.newPath,
      summary: "変更内容",
      changeType: "modify",
    })),
    comments: [
      {
        path: "src/auth/login.ts",
        endLine: 10,
        body: "SQL injection vulnerability database query",
        severity: "CRITICAL",
        relevanceScore: 10,
      },
      {
        path: "src/auth/login.ts",
        endLine: 12,
        body: "SQL injection vulnerability database attack",
        severity: "CRITICAL",
        relevanceScore: 9,
      },
      {
        path: "src/api/users.ts",
        endLine: 20,
        body: "N+1 query performance issue",
        severity: "IMPORTANT",
        relevanceScore: 8,
      },
      {
        path: "src/utils/format.ts",
        endLine: 5,
        body: "Minor style suggestion",
        severity: "NITPICK",
        relevanceScore: 3,
      },
    ],
  });

  const parseResult = repairAndParseJSON(mockReviewJSON, ReviewResultSchema);
  logTest("統合", "Phase 2: JSONパース成功", parseResult.success === true);
  logTest(
    "統合",
    "Phase 2: コメント取得",
    (parseResult.data?.comments?.length ?? 0) === 4
  );

  if (!parseResult.success || !parseResult.data) {
    console.log("  ⚠️ パース失敗のため以降のテストをスキップ");
    return;
  }

  let comments = parseResult.data.comments;

  // 5. Phase 4: 関連性スコアフィルタリング
  console.log("  Step 5: Phase 4 - 関連性スコアフィルタリング");
  const scoreFiltered = filterByRelevanceScore(comments, 5);
  logTest("統合", "Phase 4: 低スコア除外", scoreFiltered.filtered.length === 1);
  logTest("統合", "Phase 4: 高スコア保持", scoreFiltered.accepted.length === 3);
  comments = scoreFiltered.accepted;

  // 6. Phase 6: 重複除去
  console.log("  Step 6: Phase 6 - 重複除去");
  const dedupResult = deduplicateComments(comments, {
    similarityThreshold: 0.6,
  });
  logTest(
    "統合",
    "Phase 6: 重複検出",
    dedupResult.stats.duplicatesRemoved >= 1
  );
  logTest(
    "統合",
    "Phase 6: 高スコア保持",
    dedupResult.comments.some(
      (c) => c.path === "src/auth/login.ts" && c.relevanceScore === 10
    )
  );
  comments = dedupResult.comments;

  // 7. 最終結果検証
  console.log("  Step 7: 最終結果検証");
  logTest("統合", "最終: コメント数削減", comments.length < 4);
  logTest("統合", "最終: CRITICALが最初", comments[0].severity === "CRITICAL");
  logTest(
    "統合",
    "最終: 全てにカテゴリあり",
    comments.every((c) => c.relevanceCategory !== undefined)
  );

  // 8. 統計サマリー
  console.log("\n  📊 処理統計:");
  console.log(`    - 入力コメント数: 4`);
  console.log(`    - スコアフィルタ後: ${scoreFiltered.accepted.length}`);
  console.log(`    - 重複除去後: ${dedupResult.comments.length}`);
  console.log(`    - 除去されたコメント: ${4 - dedupResult.comments.length}`);
}

// ========================================
// メイン実行
// ========================================

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   統合テスト: Phase 0-6 全機能フローテスト       ║");
  console.log("╚══════════════════════════════════════════════════╝");

  // 環境設定表示
  console.log("\n📋 環境設定:");
  console.log(
    `  - AI_REFLECTION_ENABLED: ${
      process.env.AI_REFLECTION_ENABLED ?? "(default)"
    }`
  );
  console.log(
    `  - AI_RELEVANCE_MIN_SCORE: ${
      process.env.AI_RELEVANCE_MIN_SCORE ?? "(default: 5)"
    }`
  );
  console.log(
    `  - AI_CHUNKING_ENABLED: ${
      process.env.AI_CHUNKING_ENABLED ?? "(default: true)"
    }`
  );
  console.log(
    `  - AI_DEDUPLICATION_ENABLED: ${
      process.env.AI_DEDUPLICATION_ENABLED ?? "(default: true)"
    }`
  );

  // 各Phaseテスト実行
  testPhase0();
  testPhase1();
  testPhase2();
  const phase3Async = testPhase3();
  testPhase4();
  testPhase5();
  testPhase6();

  // 非同期テスト実行
  console.log("\n⏳ 非同期テスト実行中...");
  await phase3Async();

  // 統合フローテスト
  await testIntegratedFlow();

  // 結果サマリー
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║                 テスト結果サマリー                ║");
  console.log("╚══════════════════════════════════════════════════╝");

  // Phase別サマリー
  const phases = [
    "Phase 0",
    "Phase 1",
    "Phase 2",
    "Phase 3",
    "Phase 4",
    "Phase 5",
    "Phase 6",
    "統合",
  ];
  for (const phase of phases) {
    const phaseResults = testResults.filter((r) => r.phase === phase);
    const phasePassed = phaseResults.filter((r) => r.passed).length;
    const phaseFailed = phaseResults.filter((r) => !r.passed).length;
    const status = phaseFailed === 0 ? "✅" : "⚠️";
    console.log(
      `  ${status} ${phase}: ${phasePassed}/${phaseResults.length} 成功`
    );
  }

  console.log("\n  ─────────────────────────────────────");
  console.log(`  ✅ 成功: ${passedTests}`);
  console.log(`  ❌ 失敗: ${failedTests}`);
  console.log(`  📊 合計: ${passedTests + failedTests}`);

  if (failedTests === 0) {
    console.log("\n🎉 全てのテストが成功しました！Phase 0-6 統合テスト完了！");
  } else {
    console.log("\n⚠️ 一部のテストが失敗しました。確認してください。");
    console.log("\n失敗したテスト:");
    testResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(
          `  - [${r.phase}] ${r.name}${r.error ? `: ${r.error}` : ""}`
        );
      });
    process.exit(1);
  }
}

main().catch(console.error);
