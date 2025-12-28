# CodeHorse 技術仕様書

このドキュメントでは、CodeHorseの内部アルゴリズム、イベント駆動アーキテクチャ、RAGシステムの詳細な実装について説明します。

## 目次

- [1. システムアーキテクチャ概要](#1-システムアーキテクチャ概要)
- [2. イベント駆動アーキテクチャ](#2-イベント駆動アーキテクチャ)
- [3. RAG（検索拡張生成）システム](#3-rag検索拡張生成システム)
- [4. AIレビュー生成アルゴリズム](#4-aiレビュー生成アルゴリズム)
- [5. Diff解析アルゴリズム](#5-diff解析アルゴリズム)
- [6. パフォーマンス最適化](#6-パフォーマンス最適化)

---

## 1. システムアーキテクチャ概要

### 1.1 コアモジュール構成

```
src/lib/
├── ai/                 # AIレビュー生成
│   ├── review.ts           # メインレビューロジック
│   ├── prompts.ts          # システム/ユーザープロンプト
│   ├── schemas.ts          # Zodスキーマ定義
│   └── client.ts           # AIモデル設定
│
├── diff/               # Diff解析
│   ├── parser.ts           # gitdiff-parserラッパー
│   ├── filter.ts           # ファイルフィルタリング
│   └── types.ts            # 型定義
│
├── rag/                # RAG検索
│   ├── search.ts           # ベクトル検索
│   └── context-builder.ts  # コンテキスト構築
│
├── pinecone/           # ベクトルDB
│   ├── client.ts           # Pineconeクライアント
│   ├── embeddings.ts       # 埋め込み生成
│   └── types.ts            # 型定義
│
├── indexer/            # コードインデックス
│   ├── index-repository.ts # リポジトリインデックス
│   ├── ast-chunker.ts      # ASTベースチャンキング
│   ├── generic-chunker.ts  # 汎用チャンキング
│   └── chunker.ts          # チャンカーファクトリ
│
├── tokenizer/          # トークンカウント
│   └── index.ts            # tiktoken実装
│
└── github/             # GitHub API
    ├── client.ts           # Octokitクライアント
    └── types.ts            # Webhook型定義
```

---

## 2. イベント駆動アーキテクチャ

### 2.1 Inngestイベント一覧

| イベント名 | トリガー | 処理内容 |
|-----------|---------|---------|
| `github/pull_request.opened` | PR作成 | フルレビュー生成 |
| `github/pull_request.synchronize` | PRへのプッシュ | 増分レビュー生成 |
| `github/comment.created` | PRコメント | AIチャット応答 |
| `github/repository.index` | Appインストール | 初回インデックス |
| `repository/index.requested` | 手動トリガー | リポジトリ再インデックス |
| `repository/push` | プッシュ | 増分インデックス |

### 2.2 PRレビューイベントフロー

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Webhook受信                            │
│               github/pull_request.opened                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: データベースセットアップ                                │
│  ─────────────────────────────────                               │
│  • Repository レコード作成/取得                                  │
│  • PullRequest レコード作成/取得                                 │
│  • Review レコード作成（status: PROCESSING）                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 2: PRデータ取得                                           │
│  ────────────────────                                            │
│  • GitHub APIからPR詳細取得（title, body, author）              │
│  • Unified Diff形式でDiff取得                                   │
│  • 300+ファイルの場合: listFiles APIにフォールバック            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 3: Diff解析                                               │
│  ────────────────                                                │
│  • gitdiff-parserでパース                                       │
│  • レビュー対象ファイルのフィルタリング                         │
│  • 行番号・diffPosition計算                                     │
│  • フィルタ済みDiffを再構築                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 4: RAGコンテキスト取得                                    │
│  ──────────────────────────                                      │
│  • Pineconeのインデックス存在確認                               │
│  • Diffから検索クエリ生成（関数名、インポート等）               │
│  • マルチクエリ検索実行                                         │
│  • 関連コードコンテキスト構築                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 5: AIレビュー生成                                         │
│  ─────────────────────                                           │
│  • プロンプト構築（システム + PR情報 + Diff + RAG）             │
│  • トークン数確認・必要に応じて切り詰め                         │
│  • Gemini 2.0 Flash APIコール                                   │
│  • JSONレスポンスパース                                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 6: レビュー保存                                           │
│  ────────────────────                                            │
│  • Reviewレコード更新（summary, walkthrough, diagram）          │
│  • ReviewCommentレコード作成（各インラインコメント）            │
│  • status: COMPLETED に更新                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 7: GitHubへ投稿                                           │
│  ─────────────────────                                           │
│  • サマリーコメントをPRに投稿                                   │
│  • インラインコメントを各行に投稿                               │
│  • 重要度に応じたイベント設定（REQUEST_CHANGES等）              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 並行性制御

```typescript
// src/inngest/functions/review-pr.ts
{
  id: "review-pr",
  concurrency: {
    limit: 1,                              // 同時実行数
    key: "event.data.installationId",      // Installation単位で制御
  },
  retries: 3,                              // 失敗時リトライ回数
}
```

**設計理由**:
- GitHub APIのレート制限回避
- 同一リポジトリへの競合書き込み防止
- 安定したリソース利用

### 2.4 増分レビューフロー

```
github/pull_request.synchronize
    │
    ├── Step 1: 重複チェック
    │   └── 同一コミットのレビューが存在するかDB確認
    │
    ├── Step 2: 増分Diff取得
    │   └── beforeSha...afterSha 間のDiffを取得
    │
    └── Step 3-7: フルレビューと同様
        └── ただしサマリーに「増分レビュー」と明記
```

---

## 3. RAG（検索拡張生成）システム

### 3.1 システム概要

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAGパイプライン                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  コード      │    │  埋め込み    │    │  Pinecone    │       │
│  │  チャンキング │───▶│  生成       │───▶│  ストレージ  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                                        │               │
│         │                                        │               │
│         ▼                                        ▼               │
│  ┌──────────────┐                        ┌──────────────┐       │
│  │  AST解析     │                        │  ベクトル    │       │
│  │  (ts-morph)  │                        │  検索        │       │
│  └──────────────┘                        └──────────────┘       │
│                                                  │               │
│                                                  ▼               │
│                                          ┌──────────────┐       │
│                                          │  コンテキスト │       │
│                                          │  構築        │       │
│                                          └──────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 埋め込み生成

**設定** (`src/lib/pinecone/embeddings.ts`):

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| モデル | `text-embedding-3-small` | OpenAI埋め込みモデル |
| 次元数 | 1536 | ベクトル次元 |
| 最大トークン | 4,000 | 1チャンクあたり（実際の上限は8,192） |
| トークン推定 | 1トークン ≈ 2文字 | コードの複雑性を考慮した保守的な推定 |

**チャンクフォーマット**:

```typescript
function formatChunkForEmbedding(chunk: CodeChunk): string {
  const parts = [
    `File: ${chunk.filePath}`,
    `Language: ${chunk.language}`,
    `Type: ${chunk.chunkType}`,
    `Name: ${chunk.name}`,
  ];

  if (chunk.signature) {
    parts.push(`Signature: ${chunk.signature}`);
  }

  parts.push("", `Code: ${chunk.content}`);

  return parts.join("\n");
}
```

**埋め込みに含まれるメタデータ**:
- ファイルパス
- プログラミング言語
- チャンクタイプ（function, class, interface等）
- 名前（関数名、クラス名等）
- シグネチャ（関数の引数・戻り値等）

### 3.3 ASTベースコードチャンキング

**TypeScript/JavaScript用** (`src/lib/indexer/ast-chunker.ts`):

```
パーサー: ts-morph（TypeScript Compiler APIラッパー）

トークン制限:
├── MAX_CHUNK_TOKENS: 2,000トークン
├── MIN_CHUNK_TOKENS: 50トークン
└── クラス > 2,000トークン → メソッド単位に分割
```

**抽出されるチャンクタイプ**:

| タイプ | 説明 | 例 |
|--------|------|-----|
| `function` | 関数宣言 | `function foo() {}` |
| `class` | クラス宣言 | `class Bar {}` |
| `method` | クラスメソッド | `bar.method()` |
| `interface` | インターフェース | `interface IFoo {}` |
| `type` | 型エイリアス | `type Foo = {...}` |
| `variable` | 変数宣言 | `const obj = {...}` |
| `arrow` | アロー関数 | `const fn = () => {}` |

**チャンキングアルゴリズム**:

```typescript
async function chunkTypeScriptFile(content: string, filePath: string): Promise<CodeChunk[]> {
  // 1. ts-morphでASTにパース
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("temp.ts", content);

  const chunks: CodeChunk[] = [];

  // 2. トップレベル宣言を抽出
  for (const declaration of sourceFile.getStatements()) {
    if (isFunctionDeclaration(declaration)) {
      chunks.push(extractFunctionChunk(declaration));
    }
    else if (isClassDeclaration(declaration)) {
      const classChunk = extractClassChunk(declaration);

      // 3. 大きなクラスはメソッド単位に分割
      if (countTokens(classChunk.content) > MAX_CHUNK_TOKENS) {
        chunks.push(extractClassSignatureChunk(declaration));
        for (const method of declaration.getMethods()) {
          chunks.push(extractMethodChunk(method));
        }
      } else {
        chunks.push(classChunk);
      }
    }
    // ... 他の宣言タイプ
  }

  // 4. 小さなチャンクを最適化（マージ）
  return optimizeChunks(chunks);
}

function optimizeChunks(chunks: CodeChunk[]): CodeChunk[] {
  // MIN_CHUNK_TOKENS未満のチャンクを隣接チャンクとマージ
  return chunks.filter(c => countTokens(c.content) >= MIN_CHUNK_TOKENS);
}
```

**汎用チャンキング** (`src/lib/indexer/generic-chunker.ts`):

対象言語: Python, Go, Rust, Java, Kotlin, Swift, C/C++, C#, PHP, Ruby

```typescript
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  python: [
    /^(async\s+)?def\s+(\w+)\s*\(/gm,      // 関数定義
    /^class\s+(\w+)/gm,                      // クラス定義
  ],
  go: [
    /^func\s+(\([^)]*\)\s+)?(\w+)\s*\(/gm,  // 関数/メソッド定義
    /^type\s+(\w+)\s+struct/gm,              // 構造体定義
  ],
  rust: [
    /^(pub\s+)?(async\s+)?fn\s+(\w+)/gm,    // 関数定義
    /^(pub\s+)?struct\s+(\w+)/gm,            // 構造体定義
    /^(pub\s+)?impl\s+(\w+)/gm,              // 実装ブロック
  ],
  // ... 他の言語
};
```

### 3.4 Pineconeベクトルストレージ

**ネームスペース構成**:

```
Pinecone Index: "codehorse"
├── owner1/repo1/           # ネームスペース
│   ├── vector_1
│   ├── vector_2
│   └── ...
├── owner1/repo2/
└── owner2/repo1/
```

**ベクトルID生成**:

```typescript
function generateVectorId(
  repositoryId: string,
  filePath: string,
  chunkType: string,
  name: string,
  startLine: number
): string {
  const compositeKey = `${repositoryId}:${filePath}:${chunkType}:${name}:${startLine}`;
  return Buffer.from(compositeKey).toString("base64url");
}
```

**メタデータスキーマ**:

```typescript
interface CodeChunkMetadata {
  // リポジトリ情報
  repositoryId: string;
  owner: string;
  repo: string;

  // ファイル・チャンク情報
  filePath: string;
  language: string;
  chunkType: string;
  name: string;

  // 位置情報
  startLine: number;
  endLine: number;

  // コンテキスト
  parentName?: string;      // 所属クラス名等
  signature?: string;       // 関数シグネチャ

  // インデックス情報
  commitSha: string;
  indexedAt: string;        // ISO 8601形式
}
```

**バッチ操作制限**:

| 操作 | 制限 | 説明 |
|------|------|------|
| Upsert | 100ベクトル/バッチ | Pinecone API制限 |
| Query | topK=10, minScore=0.5 | デフォルト設定 |
| Delete | メタデータフィルタ | ファイルパス単位 |

### 3.5 検索とコンテキスト構築

**クエリ生成** (`src/lib/rag/search.ts`):

```typescript
function generateQueriesFromDiff(diff: ParsedDiff): string[] {
  const queries: Set<string> = new Set();

  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const change of hunk.changes) {
        if (change.type === "insert") {
          // 関数名を抽出
          const funcMatch = change.content.match(/function\s+(\w+)/);
          if (funcMatch) {
            queries.add(`${funcMatch[1]} in ${file.newPath}`);
          }

          // インポートを抽出
          const importMatch = change.content.match(/import.*from\s+['"]([^'"]+)['"]/);
          if (importMatch) {
            queries.add(`usage of ${importMatch[1]}`);
          }
        }
      }
    }
  }

  // 最大10クエリに制限
  return Array.from(queries).slice(0, 10);
}
```

**マルチクエリ検索**:

```typescript
async function searchWithMultipleQueries(
  queries: string[],
  namespace: string
): Promise<SearchResult[]> {
  const allResults: Map<string, SearchResult> = new Map();

  for (const query of queries) {
    const embedding = await generateEmbedding(query);
    const results = await pinecone.query({
      vector: embedding,
      topK: 5,
      filter: { score: { $gte: 0.5 } },
      namespace,
    });

    // 重複排除（スコアが高い方を保持）
    for (const result of results) {
      const existing = allResults.get(result.id);
      if (!existing || result.score > existing.score) {
        allResults.set(result.id, result);
      }
    }
  }

  // スコア順にソートして上位15件を返す
  return Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
}
```

**コンテキスト構築** (`src/lib/rag/context-builder.ts`):

```typescript
const MAX_CONTEXT_TOKENS = 8000;

async function buildContext(
  searchResults: SearchResult[],
  installationId: number,
  owner: string,
  repo: string
): Promise<string> {
  const contextParts: string[] = [];
  let currentTokens = 0;

  for (let i = 0; i < searchResults.length; i++) {
    const result = searchResults[i];

    // ファイル内容を取得
    const content = await getFileContent(
      installationId,
      owner,
      repo,
      result.metadata.filePath,
      result.metadata.commitSha
    );

    // 関連行を抽出
    const lines = content.split("\n");
    const relevantLines = lines.slice(
      result.metadata.startLine - 1,
      result.metadata.endLine
    );

    // コンテキストブロックを構築
    const block = formatContextBlock({
      index: i + 1,
      name: result.metadata.name,
      chunkType: result.metadata.chunkType,
      filePath: result.metadata.filePath,
      startLine: result.metadata.startLine,
      endLine: result.metadata.endLine,
      score: result.score,
      content: relevantLines.join("\n"),
    });

    const blockTokens = countTokens(block);

    // トークン制限チェック
    if (currentTokens + blockTokens > MAX_CONTEXT_TOKENS) {
      break;
    }

    contextParts.push(block);
    currentTokens += blockTokens;
  }

  return contextParts.join("\n\n");
}

function formatContextBlock(params: ContextBlockParams): string {
  return `### Related Code ${params.index}: ${params.name} (${params.chunkType})
**File:** \`${params.filePath}\` (lines ${params.startLine}-${params.endLine})
**Relevance:** ${Math.round(params.score * 100)}%

\`\`\`
${params.content}
\`\`\``;
}
```

---

## 4. AIレビュー生成アルゴリズム

### 4.1 プロンプト構成

**システムプロンプト** (`src/lib/ai/prompts.ts`):

```typescript
const REVIEW_SYSTEM_PROMPT = `あなたは経験豊富なシニアソフトウェアエンジニアです。
コードレビューを行う際は以下の原則に従ってください：

1. **建設的**: 批判ではなく改善提案を
2. **具体的**: 曖昧な指摘は避け、具体例を示す
3. **優先順位付け**: 重要な問題から順に指摘
4. **説明的**: なぜその変更が必要かを説明

## 重要度レベル

- **CRITICAL**: セキュリティ脆弱性、データ損失リスク、本番障害の可能性
- **IMPORTANT**: バグ、パフォーマンス問題、メンテナンス性の大幅な低下
- **INFO**: ベストプラクティス、コード品質向上の提案
- **NITPICK**: スタイル、命名規則、軽微な改善

日本語でレビューを出力してください。`;
```

**ユーザープロンプト構成**:

```
┌─────────────────────────────────────────┐
│  1. PRメタデータ                         │
│  ─────────────────                       │
│  • タイトル                              │
│  • 説明（body）                          │
│  • 変更ファイル一覧（+/- 行数）          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  2. Diffコンテンツ                       │
│  ────────────────                        │
│  • フィルタ済みUnified Diff              │
│  • トークン制限に応じて切り詰め          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  3. RAGコンテキスト（オプション）        │
│  ───────────────────────────            │
│  • 関連コードセクション                  │
│  • 関連度スコア                          │
│  • ファイルパスと行番号                  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  4. JSON出力指示                         │
│  ────────────────                        │
│  • 必須スキーマ定義                      │
│  • JSONのみ出力                          │
│  • コードブロック形式                    │
└─────────────────────────────────────────┘
```

### 4.2 トークン管理

**トークナイザー** (`src/lib/tokenizer/index.ts`):

```typescript
import { encoding_for_model } from "tiktoken";

// GPT-4oエンコーディング（o200k_base）を使用
const encoder = encoding_for_model("gpt-4o");

export function countTokens(text: string): number {
  return encoder.encode(text).length;
}

export function truncateToTokenLimit(text: string, limit: number): string {
  const tokens = encoder.encode(text);
  if (tokens.length <= limit) {
    return text;
  }

  // 制限内に切り詰め
  const truncatedTokens = tokens.slice(0, limit);
  return encoder.decode(truncatedTokens) + "\n\n... (truncated)";
}
```

**トークン予算配分** (`src/lib/ai/review.ts`):

```typescript
const MAX_INPUT_TOKENS = 100000;

async function generateReview(params: GenerateReviewParams): Promise<GeneratedReview> {
  // 基本トークン数を計算
  const baseTokens = countTokens(REVIEW_SYSTEM_PROMPT)
                   + countTokens(params.prTitle)
                   + countTokens(params.prBody || "");

  // RAGコンテキストのトークン数
  const ragTokens = params.ragContext ? countTokens(params.ragContext) : 0;

  // Diff用の利用可能トークン数
  const availableTokens = MAX_INPUT_TOKENS - baseTokens - ragTokens - 1000; // バッファ

  // 必要に応じてDiffを切り詰め
  let truncatedDiff = params.diffContent;
  if (countTokens(params.diffContent) > availableTokens) {
    console.warn(`[AI Review] Diff truncated: ${countTokens(params.diffContent)} → ${availableTokens} tokens`);
    truncatedDiff = truncateToTokenLimit(params.diffContent, availableTokens);
  }

  // プロンプト構築して生成...
}
```

### 4.3 AIモデル設定

```typescript
// src/lib/ai/client.ts
export const MODEL_CONFIG = {
  review: {
    model: google("gemini-2.0-flash"),  // Gemini 2.0 Flash
    temperature: 0.3,                    // 低いランダム性（一貫性重視）
    maxTokens: 8000,                     // 出力最大トークン
  },
  embedding: {
    model: "text-embedding-3-small",     // OpenAI埋め込みモデル
    dimensions: 1536,
  },
};
```

### 4.4 JSONパースアルゴリズム

```typescript
function parseAIResponse(text: string): ReviewResult {
  let jsonStr = text;

  // パターン1: ```json ... ``` コードブロック
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    // パターン2: 生のJSONオブジェクト
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return ReviewResultSchema.parse(parsed);  // Zodバリデーション
  } catch (error) {
    // フォールバック: 最小限のレビュー結果
    return {
      summary: `レビュー生成中にエラーが発生しました: ${error.message}`,
      walkthrough: [],
      comments: [],
    };
  }
}
```

### 4.5 出力スキーマ

```typescript
// src/lib/ai/schemas.ts
import { z } from "zod";

export const ReviewResultSchema = z.object({
  summary: z.string().describe("PRの変更内容の総合的なサマリー（1-3段落）"),

  walkthrough: z.array(z.object({
    path: z.string(),
    summary: z.string(),
    changeType: z.enum(["add", "modify", "delete", "rename"]),
  })),

  comments: z.array(z.object({
    path: z.string(),
    line: z.number(),
    body: z.string(),
    severity: z.enum(["CRITICAL", "IMPORTANT", "INFO", "NITPICK"]),
    suggestion: z.string().optional(),
  })),

  diagram: z.string().optional().describe("Mermaidダイアグラム"),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;
```

---

## 5. Diff解析アルゴリズム

### 5.1 gitdiff-parserラッパー

**行番号計算アルゴリズム** (`src/lib/diff/parser.ts`):

```typescript
function calculateLineNumbers(hunk: RawHunk): ParsedChange[] {
  const changes: ParsedChange[] = [];
  let currentNewLine = hunk.newStart;
  let currentOldLine = hunk.oldStart;
  let diffPosition = 1;  // hunk内での位置

  for (const change of hunk.changes) {
    let lineNumber: number;

    switch (change.type) {
      case "delete":
        // 削除行: 旧ファイルの行番号を使用
        lineNumber = change.oldLineNumber ?? currentOldLine;
        currentOldLine++;
        break;

      case "insert":
        // 追加行: 新ファイルの行番号を使用
        lineNumber = change.newLineNumber ?? currentNewLine;
        currentNewLine++;
        break;

      case "normal":
        // 変更なし: 両方の行番号を進める
        lineNumber = change.newLineNumber ?? currentNewLine;
        currentNewLine++;
        currentOldLine++;
        break;
    }

    changes.push({
      type: change.type,
      content: change.content,
      lineNumber,
      diffPosition,
    });

    diffPosition++;
  }

  return changes;
}
```

**重要なポイント**:
- `lineNumber`: GitHubインラインコメントAPI用（新ファイルの行番号）
- `diffPosition`: 一部のGitHub APIで使用（diff内の相対位置）
- ライブラリが行番号を返さない場合、hunkオフセットから計算

### 5.2 ファイルフィルタリング

**除外パターン** (`src/lib/diff/filter.ts`):

```typescript
const EXCLUDED_PATTERNS = [
  // ロックファイル
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Gemfile.lock",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",

  // ビルド出力
  ".next/",
  "dist/",
  "build/",
  "out/",
  "node_modules/",
  ".vercel/",

  // 生成ファイル
  "*.min.js",
  "*.min.css",
  "*.map",
  "*.d.ts",        // 型定義（生成物）

  // バージョン管理
  ".git/",
  "vendor/",
  ".env",
  ".env.*",

  // システムファイル
  ".DS_Store",
  "Thumbs.db",

  // 言語固有
  "*.pyc",
  "__pycache__/",
  "*.class",
  "target/",        // Rust/Java
  ".idea/",
  ".vscode/",
];
```

**レビュー対象拡張子**:

```typescript
const REVIEWABLE_EXTENSIONS: Record<string, string> = {
  // JavaScript/TypeScript
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // サーバーサイド
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".php": "php",

  // フロントエンド
  ".html": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".astro": "astro",

  // スタイル
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",

  // 設定
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",

  // ドキュメント
  ".md": "markdown",
  ".mdx": "markdown",

  // データベース
  ".sql": "sql",

  // インフラ
  ".sh": "shell",
  ".dockerfile": "dockerfile",
};
```

### 5.3 Diff再構築

```typescript
function reconstructFilteredDiff(parsedDiff: ParsedDiff): string {
  const parts: string[] = [];

  for (const file of parsedDiff.files) {
    // ファイルヘッダー
    parts.push(`diff --git a/${file.oldPath} b/${file.newPath}`);
    parts.push(`--- a/${file.oldPath}`);
    parts.push(`+++ b/${file.newPath}`);

    // 各hunk
    for (const hunk of file.hunks) {
      parts.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);

      for (const change of hunk.changes) {
        const prefix = change.type === "insert" ? "+"
                     : change.type === "delete" ? "-"
                     : " ";
        parts.push(`${prefix}${change.content}`);
      }
    }
  }

  return parts.join("\n");
}
```

---

## 6. パフォーマンス最適化

### 6.1 並行性制御

```typescript
// Installation単位での順次処理
// 理由: GitHub APIレート制限、競合書き込み防止
concurrency: {
  limit: 1,
  key: "event.data.installationId",
}
```

### 6.2 バッチ処理

| 処理 | バッチサイズ | 理由 |
|------|-------------|------|
| ファイル取得 | 10ファイル | メモリ使用量制限 |
| 埋め込み生成 | 100テキスト | OpenAI API制限 |
| ベクトルUpsert | 100ベクトル | Pinecone API制限 |

### 6.3 トークン予算管理

```
┌─────────────────────────────────────────┐
│  MAX_INPUT_TOKENS = 100,000             │
├─────────────────────────────────────────┤
│  システムプロンプト    ~2,000           │
│  PRメタデータ          ~500             │
│  RAGコンテキスト       ~8,000           │
│  バッファ              ~1,000           │
├─────────────────────────────────────────┤
│  Diff用                ~88,500          │
└─────────────────────────────────────────┘
```

### 6.4 遅延初期化

```typescript
// OpenAI/Pineconeクライアントは必要時に初期化
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}
```

### 6.5 増分インデックス

```typescript
// プッシュイベントで変更ファイルのみ更新
async function incrementalIndex(event: RepositoryPushEvent) {
  const { changedFiles } = event.data;

  // 削除されたファイルのベクトルを削除
  for (const file of changedFiles.deleted) {
    await deleteVectorsByFilePath(file);
  }

  // 追加/変更されたファイルを再インデックス
  const filesToIndex = [...changedFiles.added, ...changedFiles.modified];
  for (const file of filesToIndex) {
    const content = await fetchFileContent(file);
    const chunks = await chunkFile(content, file);
    const embeddings = await generateEmbeddings(chunks);
    await upsertVectors(embeddings);
  }
}
```

### 6.6 300+ファイルPRの処理

```typescript
// 大きなPRの場合、listFiles APIにフォールバック
async function getPullRequestDiff(octokit, owner, repo, prNumber): Promise<string> {
  try {
    // 通常のDiff取得を試行
    const response = await octokit.rest.pulls.get({
      owner, repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    return response.data;
  } catch (error) {
    // 422/406エラーの場合、ファイル単位で取得
    if (error.status === 422 || error.status === 406) {
      console.log("[GitHub] Diff too large, using listFiles API");
      return getPullRequestDiffFromFiles(octokit, owner, repo, prNumber);
    }
    throw error;
  }
}

async function getPullRequestDiffFromFiles(...): Promise<string> {
  const allFiles = [];
  let page = 1;

  // ページネーションで全ファイル取得
  while (true) {
    const response = await octokit.rest.pulls.listFiles({
      owner, repo,
      pull_number: prNumber,
      per_page: 100,
      page,
    });

    allFiles.push(...response.data);

    if (response.data.length < 100) break;
    page++;
  }

  // 各ファイルのpatchを結合してUnified Diff形式に
  return allFiles
    .filter(f => f.patch)
    .map(f => `diff --git a/${f.filename} b/${f.filename}\n${f.patch}`)
    .join("\n\n");
}
```

---

## 7. エラーハンドリング

### 7.1 リトライ戦略

```typescript
// src/lib/github/client.ts
const RETRY_OPTIONS = {
  retries: 5,
  factor: 2,              // 指数バックオフ
  minTimeout: 1000,       // 初回待機: 1秒
  maxTimeout: 30000,      // 最大待機: 30秒
};

async function rateLimitedRequest<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(async () => {
    try {
      return await fn();
    } catch (error) {
      // レート制限: Retry-Afterヘッダーを尊重
      if (error.status === 403 || error.status === 429) {
        const retryAfter = error.response?.headers?.["retry-after"];
        if (retryAfter) {
          await sleep(parseInt(retryAfter) * 1000);
        }
        throw error;  // リトライ
      }

      // 5xxエラー: リトライ
      if (error.status >= 500) {
        throw error;
      }

      // 4xxエラー: 即座に失敗
      throw new AbortError(error);
    }
  }, RETRY_OPTIONS);
}
```

### 7.2 グレースフルデグラデーション

```typescript
// RAGコンテキスト取得失敗時
try {
  ragContext = await buildContext(searchResults, ...);
} catch (error) {
  console.warn("[RAG] Context building failed, continuing without context");
  ragContext = undefined;
}

// AIレスポンスパース失敗時
try {
  result = ReviewResultSchema.parse(parsed);
} catch (error) {
  result = {
    summary: `レビュー生成中にエラーが発生しました`,
    walkthrough: files.map(f => ({
      path: f.newPath,
      summary: `${f.type} changes`,
      changeType: f.type,
    })),
    comments: [],
  };
}
```

---

## 8. セキュリティ考慮事項

### 8.1 Webhook検証

```typescript
// src/lib/github/verify-webhook.ts
export async function verifyWebhookSignature(
  payload: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### 8.2 認証情報管理

- 環境変数で管理（`.env`）
- GitHub Private Keyは改行をエスケープして保存
- Pinecone/OpenAI APIキーはサーバーサイドのみ

### 8.3 データ分離

- Pineconeネームスペースでリポジトリごとに分離
- データベースでは`installationId`でアクセス制御
- セッションベース認証（7日間有効）

---

## 付録: ファイル一覧

| ディレクトリ | ファイル数 | 主要ファイル |
|-------------|-----------|-------------|
| `src/lib/ai/` | 4 | review.ts, prompts.ts, schemas.ts, client.ts |
| `src/lib/diff/` | 3 | parser.ts, filter.ts, types.ts |
| `src/lib/rag/` | 2 | search.ts, context-builder.ts |
| `src/lib/pinecone/` | 3 | client.ts, embeddings.ts, types.ts |
| `src/lib/indexer/` | 4 | index-repository.ts, ast-chunker.ts, generic-chunker.ts, chunker.ts |
| `src/lib/tokenizer/` | 1 | index.ts |
| `src/lib/github/` | 3 | client.ts, types.ts, verify-webhook.ts |
| `src/inngest/` | 5 | client.ts, events.ts, functions/*.ts |
