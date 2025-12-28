# Adaptive Learning Memory 実装ドキュメント

## 概要

CodeHorseに「Adaptive Learning Memory」機能を実装しました。この機能により、ユーザーのフィードバックからコーディング規約やスタイルを学習し、将来のレビューに反映させることができます。

---

## 実装済み機能

### Phase 1: データベース＆インフラ整備

| ファイル | 変更内容 |
|---------|---------|
| `prisma/schema.prisma` | `ReviewFeedback`, `LearningRule`, `SpecificationDocument` モデル追加 |
| `src/lib/pinecone/types.ts` | `LearningRuleMetadata`, `SpecificationChunkMetadata` 型追加 |
| `src/lib/pinecone/client.ts` | ルール操作メソッド (`upsertRuleVectors`, `queryRules` 等) 追加 |
| `src/lib/pinecone/embeddings.ts` | ルール・仕様書用フォーマッタ追加 |

#### 追加されたPrismaモデル

```prisma
model ReviewFeedback {
  id              String      @id @default(cuid())
  reviewCommentId String
  type            FeedbackType
  userAction      UserAction
  aiSuggestion    String?     @db.Text
  userCode        String?     @db.Text
  userExplanation String?     @db.Text
  filePath        String
  language        String?
  lineNumber      Int         @default(0)
  createdAt       DateTime    @default(now())
  processedAt     DateTime?
}

model LearningRule {
  id              String      @id @default(cuid())
  installationId  Int
  repositoryId    String?
  ruleText        String      @db.Text
  ruleType        RuleType
  source          RuleSource
  language        String?
  confidence      Float       @default(0.8)
  usageCount      Int         @default(0)
  lastUsedAt      DateTime?
  pineconeId      String?     @unique
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model SpecificationDocument {
  id            String      @id @default(cuid())
  repositoryId  String
  filePath      String
  documentType  SpecDocType
  title         String?
  contentHash   String
  lastSyncedAt  DateTime
  lastSyncedSha String
  chunkCount    Int         @default(0)
}
```

---

### Phase 2: フィードバック収集システム

| ファイル | 変更内容 |
|---------|---------|
| `src/inngest/events.ts` | フィードバック関連イベント定義追加 |
| `src/inngest/functions/process-feedback.ts` | フィードバック処理関数 (新規作成) |
| `src/app/api/webhooks/github/route.ts` | 明示的フィードバックコマンド検出追加 |

#### 収集されるフィードバック

| シグナル | トリガー | 学習アクション |
|---------|---------|--------------|
| 👎 リアクション | コメントに thumbs_down | 暗黙的拒否としてルール抽出 |
| 👍 リアクション | コメントに thumbs_up | 暗黙的承認として記録 |
| `@codehorse prefer X over Y` | コメントで明示的指定 | 明示的ルールとして高信頼度で追加 |
| `@codehorse add rule: X` | コメントで明示的指定 | 明示的ルールとして追加 |
| `@codehorse always use X` | コメントで明示的指定 | パターンルールとして追加 |
| `@codehorse never use X` | コメントで明示的指定 | パターンルールとして追加 |

---

### Phase 3: ルール抽出エンジン

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/learning/types.ts` | 型定義・定数 (新規作成) |
| `src/lib/learning/rule-extractor.ts` | Gemini 2.0 Flashでルール抽出 (新規作成) |
| `src/lib/learning/rule-store.ts` | DB＆Pinecone保存ロジック (新規作成) |
| `src/inngest/functions/extract-rules.ts` | ルール抽出Inngestジョブ (新規作成) |

#### ルール抽出フロー

```
フィードバック検出
       │
       ▼
┌─────────────────────────┐
│ Gemini 2.0 Flash        │
│ AIの提案 vs ユーザー実装 │
│ からルールを推論         │
└─────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ ルール保存              │
│ - PostgreSQL (メタデータ)│
│ - Pinecone (ベクトル)    │
└─────────────────────────┘
```

---

### Phase 4: RAGパイプライン統合

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/rag/rules-search.ts` | ルール検索機能 (新規作成) |
| `src/lib/rag/context-builder.ts` | `buildEnhancedContext` 追加 |
| `src/inngest/functions/review-pr.ts` | Step 4b (ルール), Step 4c (仕様書) 追加 |

#### レビュー時のコンテキスト構成

```
レビュー生成
    │
    ├── Step 4: コードRAGコンテキスト (既存)
    │
    ├── Step 4b: 学習ルールコンテキスト (新規)
    │   └── 関連ルールをPineconeから検索
    │
    ├── Step 4c: 仕様書コンテキスト (新規)
    │   └── 関連仕様書をPineconeから検索
    │
    └── Step 5: AI生成 (拡張コンテキスト使用)
```

---

### Phase 5: Specification-Aware機能

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/learning/spec-ingester.ts` | 仕様書解析・チャンク化 (新規作成) |
| `src/lib/rag/specs-search.ts` | 仕様書検索機能 (新規作成) |
| `src/inngest/functions/index-specs.ts` | 仕様書インデックスジョブ (新規作成) |

#### 対応ドキュメント形式

- **OpenAPI/Swagger** (YAML/JSON)
- **Markdown** (README, ドキュメント)
- **Architecture Decision Records** (ADR)

---

### Phase 6: 信頼度管理＆最適化

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/learning/rule-store.ts` | `trackRuleUsage`, `reinforceRule`, `weakenRule`, `getRuleStats` 追加 |
| `src/inngest/functions/extract-rules.ts` | `scheduledRulesCleanupJob` (週次cron) 追加 |

#### 自己メンテナンス機構

| 機能 | 説明 |
|-----|-----|
| 使用追跡 | ルールがレビューで使用されるたびに `usageCount` と `lastUsedAt` を更新 |
| 信頼度強化 | ポジティブフィードバック時に信頼度を+0.1 |
| 信頼度弱化 | ネガティブフィードバック時に信頼度を-0.15 |
| 信頼度減衰 | 30日未使用のルールは信頼度を5%減衰 |
| 自動削除 | 信頼度0.3以下のルールを週次で削除 |

---

## ファイル構成

```
src/
├── inngest/
│   ├── events.ts                    # イベント定義 (拡張)
│   └── functions/
│       ├── process-feedback.ts      # 新規: フィードバック処理
│       ├── extract-rules.ts         # 新規: ルール抽出
│       ├── index-specs.ts           # 新規: 仕様書インデックス
│       ├── review-pr.ts             # 拡張: Step 4b, 4c 追加
│       └── index.ts                 # エクスポート更新
├── lib/
│   ├── learning/
│   │   ├── types.ts                 # 新規: 型定義
│   │   ├── rule-extractor.ts        # 新規: ルール抽出
│   │   ├── rule-store.ts            # 新規: ルール保存
│   │   └── spec-ingester.ts         # 新規: 仕様書解析
│   ├── rag/
│   │   ├── rules-search.ts          # 新規: ルール検索
│   │   ├── specs-search.ts          # 新規: 仕様書検索
│   │   └── context-builder.ts       # 拡張: buildEnhancedContext
│   └── pinecone/
│       ├── types.ts                 # 拡張: ルール・仕様書メタデータ
│       ├── client.ts                # 拡張: ルール操作
│       └── embeddings.ts            # 拡張: フォーマッタ
├── app/
│   └── api/webhooks/github/route.ts # 拡張: フィードバック検出
└── prisma/
    └── schema.prisma                # 拡張: 新規モデル
```

---

## コスト見積もり

| 項目 | 月間コスト | 備考 |
|-----|----------|------|
| Pinecone ストレージ | 含まれる | 既存プランに含まれる |
| Gemini 2.0 Flash | ~$0.15 | ルール抽出時のみ使用 |
| OpenAI Embedding | ~$0.01 | ルールベクトル化 |
| **合計** | **~$1-5/月** | |

### コスト制御パラメータ

```typescript
const LEARNING_LIMITS = {
  MAX_RULES_PER_ORG: 500,           // 組織あたり最大ルール数
  MAX_RULES_PER_DAY: 20,            // 1日あたり最大抽出数
  MIN_CONFIDENCE_THRESHOLD: 0.3,    // 最低信頼度閾値
  CONFIDENCE_DECAY_RATE: 0.05,      // 月次減衰率
  RULE_TTL_DAYS: 180,               // ルール有効期限
};
```

---

## 今後の予定

### 短期 (次回実装予定)

- [ ] **ダッシュボードUI**: 学習ルール一覧・管理画面
- [ ] **ルール手動編集**: ユーザーがルールを直接追加・編集・削除
- [ ] **ルール優先度設定**: 重要なルールに高優先度を設定
- [ ] **フィードバック履歴**: 過去のフィードバック一覧表示

### 中期

- [ ] **類似ルールマージ**: Embedding類似度で重複ルールを統合
- [ ] **ルールカテゴリ管理**: カテゴリ別のルール表示・フィルタ
- [ ] **チーム共有ルール**: 組織全体で共有されるルールセット
- [ ] **ルールインポート/エクスポート**: YAML/JSON形式での管理

### 長期 (E2B Sandboxed Reflexion)

- [ ] **E2B調査**: E2Bアカウント作成・APIキー取得
- [ ] **サンドボックス実行テスト**: 基本的なコード実行検証
- [ ] **Reflexionループ設計**: 自己修正ループのプロトタイプ
- [ ] **コスト評価**: 本番導入時のコスト試算

---

## テスト方法

### フィードバック収集テスト

1. PRを作成しCodeHorseにレビューさせる
2. レビューコメントに👎リアクションを付ける
3. Inngestダッシュボードで `process-reaction-feedback` ジョブを確認
4. `extract-rules` ジョブでルールが抽出されることを確認

### 明示的ルールテスト

1. PRのコメントで `@codehorse prefer arrow functions over function declarations` と投稿
2. `process-explicit-feedback` ジョブが実行されることを確認
3. DBに高信頼度ルールが保存されることを確認

### ルール適用テスト

1. 新しいPRを作成
2. レビュー時に学習ルールがコンテキストに含まれることをログで確認
3. レビュー結果にルールが反映されていることを確認

---

## 関連ドキュメント

- [機能拡張提案書](./CodeHorse%20機能拡張提案.md)
- [技術仕様書](./TECHNICAL_SPECIFICATION.md)
