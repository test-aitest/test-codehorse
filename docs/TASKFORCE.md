CodeHorse: 詳細実装ロードマップ

概要

仕様書の 3 フェーズを 17 のサブフェーズに分割し、各サブフェーズ
でビルド・動作確認が可能な状態を維持します。

---

全体構造

フェーズ 1: MVP 基盤 (8 サブフェーズ)
├── 1.1: プロジェクト基盤セットアップ (Next.js 16 +
Shadcn UI)
├── 1.2: データベース設計と Prisma 設定 (拡張スキーマ)
├── 1.3: Better Auth 認証基盤 (GitHub OAuth)
├── 1.4: GitHub App 基盤と Webhook 受信 (署名検証)
├── 1.5: Inngest 非同期ジョブ基盤
├── 1.6: GitHub API 堅牢化 (p-limit/p-retry) ★ 重要
├── 1.7: Diff 解析とトークン計算 (tiktoken) ★ 重要
└── 1.8: 基本 AI レビューパイプライン

フェーズ 2: RAG & Intelligence (6 サブフェーズ)
├── 2.1: Pinecone 基盤セットアップ
├── 2.2: AST チャンキングエンジン (ts-morph)
├── 2.3: リポジトリインデキシングワーカー
├── 2.4: RAG 検索とコンテキスト注入
├── 2.5: 増分レビュー機能
└── 2.6: チャットボット応答機能

フェーズ 3: SaaS & UX (6 サブフェーズ)
├── 3.1: ダッシュボード UI 基盤
├── 3.2: リポジトリ管理画面
├── 3.3: レビュー履歴画面
├── 3.4: Polar.sh 課金統合
├── 3.5: 使用量制限と料金プラン
└── 3.6: 設定画面と YAML エディタ

---

フェーズ 1: MVP 基盤構築

1.1: プロジェクト基盤セットアップ

実装内容:

- Next.js 16 + TypeScript 初期化
- Tailwind CSS 4 + Shadcn UI 設定
- ESLint + Prettier 設定
- 基本ディレクトリ構造作成

主要ファイル:
src/app/layout.tsx, page.tsx, globals.css
src/components/ui/ (Shadcn)
src/lib/utils.ts
next.config.ts, tailwind.config.ts

終了条件:

- npm run build 成功
- npm run dev でローカル起動
- Shadcn UI の Button が表示

---

1.2: データベース設計と Prisma 設定

実装内容:

- PostgreSQL 接続設定
- 完全な Prisma スキーマ（仕様書の拡張版）
- Better Auth 必須テーブル (User, Account, Session,
  Verification)
- コアモデル (Repository, PullRequest, Review,
  ReviewComment)
- 課金モデル (Subscription)
- Enum 定義 (IndexStatus, ReviewStatus, Severity 等)

主要ファイル:
prisma/schema.prisma
src/lib/prisma.ts

終了条件:

- npx prisma generate 成功
- npx prisma db push 成功
- Prisma Studio でテーブル確認

---

1.3: Better Auth 認証基盤

実装内容:

- Better Auth 設定（GitHub OAuth プロバイダー）
- 認証 API Route (/api/auth/[...all])
- サインイン/サインアップページ
- 認証ミドルウェア
- ダッシュボード用認証必須レイアウト

主要ファイル:
src/lib/auth.ts
src/lib/auth-client.ts
src/app/api/auth/[...all]/route.ts
src/app/(auth)/sign-in/page.tsx
src/middleware.ts

終了条件:

- GitHub OAuth でサインイン可能
- セッションが DB に保存
- 未認証時にリダイレクト

---

1.4: GitHub App 基盤と Webhook 受信

実装内容:

- Webhook 受信エンドポイント
- HMAC 署名検証 (X-Hub-Signature-256)
- イベントタイプ別ルーティング
- GitHub App インストールトークン取得

主要ファイル:
src/app/api/webhooks/github/route.ts
src/lib/github/app.ts
src/lib/github/verify-webhook.ts
src/lib/github/types.ts

終了条件:

- 署名検証が動作（不正署名で 401）
- 正しい署名で 200 返却
- イベントログ出力

---

1.5: Inngest 非同期ジョブ基盤

実装内容:

- Inngest クライアント設定
- イベント型定義
- レビュージョブ（スタブ）
- インデキシングジョブ（スタブ）
- Webhook からのイベント送信

主要ファイル:
src/inngest/client.ts
src/inngest/events.ts
src/inngest/functions/index.ts
src/inngest/functions/review-pr.ts (スタブ)
src/app/api/inngest/route.ts

終了条件:

- Inngest Dev Server 起動
- Webhook からイベントがキューに入る
- Inngest UI でジョブ確認

---

1.6: GitHub API 堅牢化 (p-limit/p-retry) ★ 重要

実装内容:

- p-limit による同時実行制限（5 並列）
- p-retry による自動再試行（5 回、指数バックオフ）
- 429/403 エラー時の待機処理
- 堅牢な Octokit ラッパー関数群

主要ファイル:
src/lib/github/client.ts

API 関数:

- getInstallationOctokit()
- rateLimitedRequest()
- getPullRequestDiff()
- getPullRequestFiles()
- getFileContent()
- createPullRequestReview()

終了条件:

- 並列リクエストが 5 件に制限
- 5xx エラーで自動リトライ
- 429 エラーで retry-after 待機

---

1.7: Diff 解析とトークン計算 (tiktoken) ★ 重要

実装内容:

- gitdiff-parser による Diff 構造化
- tiktoken による正確なトークン計算
- レビュー対象ファイルフィルタリング
- トークン制限内でのチャンキング

主要ファイル:
src/lib/diff/parser.ts
src/lib/diff/filter.ts
src/lib/diff/types.ts
src/lib/tokenizer/index.ts
src/lib/tokenizer/chunker.ts

終了条件:

- Diff が正しくパース
- トークン数が正確に計算
- ロックファイル等が除外

---

1.8: 基本 AI レビューパイプライン

実装内容:

- Vercel AI SDK + Gemini 統合
- Zod スキーマによる出力構造化
- プロンプトエンジニアリング
- GitHub へのコメント投稿
- Inngest ステップ実行パターン

主要ファイル:
src/lib/ai/client.ts
src/lib/ai/prompts.ts
src/lib/ai/review.ts
src/lib/ai/schemas.ts
src/inngest/functions/review-pr.ts (完全実装)

終了条件:

- PR イベントでレビュー生成
- GitHub にサマリー投稿
- インラインコメント投稿
- DB にレビュー保存

---

フェーズ 2: RAG & Intelligence

2.1: Pinecone 基盤セットアップ

実装内容:

- Pinecone クライアント設定
- Namespace 管理（リポジトリ分離）
- Embedding 生成（text-embedding-004）
- ベクトル upsert/query

主要ファイル:
src/lib/pinecone/client.ts
src/lib/pinecone/embeddings.ts
src/lib/pinecone/types.ts

終了条件:

- Pinecone 接続成功
- Embedding 生成動作
- upsert/query 動作

---

2.2: AST チャンキングエンジン

実装内容:

- ts-morph による AST 解析
- 関数/クラス/インターフェース単位のチャンク化
- トークン制限超過時の再分割
- メタデータ付与（行番号、スコープ等）

主要ファイル:
src/lib/indexer/ast-chunker.ts
src/lib/indexer/types.ts

終了条件:

- TypeScript が関数単位でチャンク化
- 大きなクラスがメソッド単位で分割
- メタデータが正しく付与

---

2.3: リポジトリインデキシングワーカー

実装内容:

- ファイルツリー取得
- 対象ファイルフィルタリング
- バッチ Embedding 生成
- Pinecone へのアップサート
- インデックス状態管理

主要ファイル:
src/lib/indexer/index-repository.ts
src/inngest/functions/index-repository.ts

終了条件:

- リポジトリ全体がインデックス化
- IndexStatus が COMPLETED に更新
- Pinecone にベクトル保存

---

2.4: RAG 検索とコンテキスト注入

実装内容:

- Diff からの検索クエリ生成
- 関連コード検索
- トークン制限内でのコンテキスト構築
- レビュープロンプトへの注入

主要ファイル:
src/lib/rag/search.ts
src/lib/rag/context-builder.ts

終了条件:

- Diff から適切なクエリ生成
- 関連コードが取得される
- AI レビューにコンテキスト反映

---

2.5: 増分レビュー機能

実装内容:

- synchronize イベント処理
- 増分 Diff 取得（beforeSha...afterSha）
- 重複レビュー防止
- 増分レビューコメント

主要ファイル:
src/inngest/functions/review-pr-incremental.ts

終了条件:

- PR 更新で増分レビュー実行
- 同じコミットはスキップ
- 増分であることがコメントに明記

---

2.6: チャットボット応答機能

実装内容:

- @codehorse メンション検出
- スレッドコンテキスト取得
- AI 応答生成
- 返信投稿

主要ファイル:
src/lib/ai/chat.ts
src/inngest/functions/chat-response.ts

終了条件:

- メンションで応答
- スレッドコンテキスト保持
- 自己コメントに非反応

---

フェーズ 3: SaaS & UX

3.1: ダッシュボード UI 基盤

実装内容:

- ダッシュボードレイアウト
- サイドバーナビゲーション
- 統計カード
- アクティビティグラフ（Recharts）

主要ファイル:
src/app/(dashboard)/layout.tsx
src/app/(dashboard)/page.tsx
src/components/dashboard/sidebar.tsx
src/components/dashboard/stats-card.tsx

終了条件:

- レイアウト表示
- サイドバー動作
- 統計情報表示

---

3.2: リポジトリ管理画面

実装内容:

- リポジトリ一覧（無限スクロール）
- 連携/解除機能
- インデックス状態表示
- Re-index ボタン

主要ファイル:
src/app/(dashboard)/repositories/page.tsx
src/components/repositories/repository-list.tsx
src/components/repositories/connect-dialog.tsx

終了条件:

- リポジトリ一覧表示
- 連携/解除動作
- Re-index 動作

---

3.3: レビュー履歴画面

実装内容:

- レビュー一覧（時系列）
- レビュー詳細表示
- コメント一覧
- Mermaid ダイアグラム表示

主要ファイル:
src/app/(dashboard)/reviews/page.tsx
src/app/(dashboard)/reviews/[id]/page.tsx
src/components/reviews/review-detail.tsx

終了条件:

- レビュー一覧表示
- 詳細閲覧可能
- Mermaid レンダリング

---

3.4: Polar.sh 課金統合

実装内容:

- Polar Webhook 受信
- サブスクリプション状態同期
- 課金フローリダイレクト

主要ファイル:
src/app/api/webhooks/polar/route.ts
src/lib/polar/client.ts
src/lib/polar/subscriptions.ts

終了条件:

- Webhook でサブスクリプション同期
- DB の Subscription 更新

---

3.5: 使用量制限と料金プラン

実装内容:

- プラン別制限定義
- 使用量追跡
- 制限超過時の通知

主要ファイル:
src/lib/billing/limits.ts
src/lib/billing/usage-tracker.ts
src/lib/billing/enforcement.ts

プラン制限:
| 機能 | Free | Pro |
|--------------|----------------|--------|
| リポジトリ数 | 1 (Public のみ) | 無制限 |
| 月間レビュー | 50 | 無制限 |
| RAG | 無効 | 有効 |

終了条件:

- 制限が適用される
- 使用量がダッシュボード表示
- 超過時に GitHub 通知

---

3.6: 設定画面と YAML エディタ

実装内容:

- プロフィール設定
- リポジトリ設定
- YAML エディタ（リアルタイムバリデーション）

主要ファイル:
src/app/(dashboard)/settings/page.tsx
src/components/settings/yaml-editor.tsx

終了条件:

- 設定が保存される
- YAML バリデーション動作

---

各サブフェーズ終了時の検証手順

# 1. 型チェック

npx tsc --noEmit

# 2. Lint チェック

npm run lint

# 3. ビルド

npm run build

# 4. 開発サーバー起動確認

npm run dev

# 5. Prisma 状態確認（該当する場合）

npx prisma db push
npx prisma studio

---

環境変数一覧

# Database

DATABASE_URL="postgresql://..."

# Better Auth

BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"

# GitHub App

GITHUB_APP_ID="..."
GITHUB_PRIVATE_KEY="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
GITHUB_WEBHOOK_SECRET="..."
GITHUB_APP_SLUG="codehorse"

# Inngest

INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="..."

# AI

GOOGLE_GENERATIVE_AI_API_KEY="..."
OPENAI_API_KEY="..."

# Pinecone

PINECONE_API_KEY="..."
PINECONE_INDEX_NAME="codehorse"

# Polar

POLAR_ACCESS_TOKEN="..."
POLAR_WEBHOOK_SECRET="..."

---

重要な制約事項（仕様書より）

1. トークン計算: 必ず tiktoken を使用。文字数スライス禁止
2. API 堅牢性: p-limit（5 並列）+ p-retry（5 回リトライ）必須
3. 拡張スキーマ: RepoConfig 等を最初から反映
