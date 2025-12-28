# CodeHorse - AI コードレビュー SaaS

CodeHorseは、GitHubのプルリクエストに対して自動的にAIによるコードレビューを提供するSaaSアプリケーションです。CodeRabbitにインスパイアされ、Google Gemini AIを活用して高品質なコードレビューを生成します。

## 目次

- [概要](#概要)
- [主要機能](#主要機能)
- [技術スタック](#技術スタック)
- [アーキテクチャ](#アーキテクチャ)
- [プロジェクト構成](#プロジェクト構成)
- [セットアップ](#セットアップ)
- [使用方法](#使用方法)
- [ワークフロー](#ワークフロー)

---

## 概要

CodeHorseは以下の機能を提供するAIコードレビューサービスです：

- **自動PRレビュー**: プルリクエストが作成・更新されると自動的にAIレビューを生成
- **インラインコメント**: コードの具体的な行に対してレビューコメントを投稿
- **サマリーレポート**: PRの変更内容を要約し、Mermaidダイアグラムで可視化
- **RAG（検索拡張生成）**: 既存のコードベースを参照してより良いレビューを生成
- **Google Sheets連携**: テストケースの管理とClaude Codeによる自動更新

---

## 主要機能

### 1. AI コードレビュー

- **自動トリガー**: GitHub Webhookを通じてPR作成/更新時に自動実行
- **構造化レビュー**: サマリー、ファイルごとの変更概要、インラインコメントを生成
- **重要度レベル**: CRITICAL, IMPORTANT, INFO, NITPICK の4段階で問題を分類
- **修正提案**: 具体的なコード修正案を提示

### 2. リポジトリインデックス

- **AST ベースチャンキング**: 関数・クラス単位でコードを分割
- **ベクトル検索**: Pineconeを使用した類似コード検索
- **増分更新**: 変更されたファイルのみを再インデックス

### 3. ダッシュボード

- **レビュー一覧**: 過去のレビューを一覧表示
- **レビュー詳細**: インラインコメントとサマリーを確認
- **リポジトリ管理**: 接続リポジトリの設定
- **利用状況**: API使用量とトークン消費量の確認

### 4. Claude Code ハンドラー（ローカルツール）

- **レビュー適用**: AIの提案をローカルで自動適用
- **Google Sheets連携**: テストケースの自動更新
- **URLスキーム**: `codehorse://` プロトコルでワンクリック起動

---

## 技術スタック

### フロントエンド
| 技術 | 用途 |
|------|------|
| Next.js 16 | App Router、React Server Components |
| React 19 | UIフレームワーク |
| Tailwind CSS 4 | スタイリング |
| Radix UI | アクセシブルなUIコンポーネント |
| TypeScript 5 | 型安全性 |

### バックエンド
| 技術 | 用途 |
|------|------|
| Next.js API Routes | REST API エンドポイント |
| Inngest | 非同期ジョブ処理 |
| Prisma | ORM（PostgreSQL） |
| Better Auth | 認証（GitHub OAuth） |

### AI/ML
| 技術 | 用途 |
|------|------|
| Google Gemini 1.5 Flash | レビュー生成 |
| Pinecone | ベクトルデータベース（RAG） |
| tiktoken | トークンカウント |

### 外部サービス
| サービス | 用途 |
|----------|------|
| GitHub App | Webhook、PR操作 |
| Vercel | ホスティング |
| Google Sheets API | テストケース管理 |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  PR 作成    │    │  PR 更新    │    │  コメント   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             │ Webhook                            │
└─────────────────────────────┼───────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CodeHorse (Vercel)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  /api/webhooks/github                                       │ │
│  │  - Webhook 署名検証                                         │ │
│  │  - イベントルーティング                                     │ │
│  └────────────────────────────┬───────────────────────────────┘ │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Inngest (非同期ジョブ)                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │ │
│  │  │ review-pr    │  │ index-repo   │  │ chat-response│      │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │ │
│  └─────────┼─────────────────┼─────────────────┼──────────────┘ │
│            │                 │                 │                 │
│            ▼                 ▼                 ▼                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  Diff Parser    │ │  AST Chunker    │ │  Chat AI        │   │
│  │  + RAG Search   │ │  + Embeddings   │ │                 │   │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘   │
│           │                   │                   │              │
│           ▼                   ▼                   │              │
│  ┌─────────────────┐ ┌─────────────────┐         │              │
│  │  Google Gemini  │ │   Pinecone      │         │              │
│  │  (AI Review)    │ │   (Vectors)     │         │              │
│  └────────┬────────┘ └─────────────────┘         │              │
│           │                                       │              │
│           └───────────────────────────────────────┘              │
│                               │                                  │
│                               ▼                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL (Prisma)                                        │ │
│  │  - Users, Repositories, PullRequests, Reviews, Comments     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GitHub API
                              ▼
                    ┌─────────────────┐
                    │  PR コメント    │
                    │  投稿           │
                    └─────────────────┘
```

### ローカルハンドラー

```
┌─────────────────────────────────────────────────────────────────┐
│                    Local Machine                                 │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  codehorse://   │───▶│ codehorse-      │                     │
│  │  URL スキーム   │    │ handler CLI     │                     │
│  └─────────────────┘    └────────┬────────┘                     │
│                                  │                               │
│                                  ▼                               │
│                         ┌─────────────────┐                     │
│                         │  Claude Code    │                     │
│                         │  CLI            │                     │
│                         └────────┬────────┘                     │
│                                  │                               │
│         ┌────────────────────────┼───────────────────┐          │
│         ▼                        ▼                   ▼          │
│  ┌─────────────────┐    ┌─────────────────┐  ┌─────────────┐   │
│  │  コード修正     │    │  テストケース   │  │  Git Push   │   │
│  │  適用           │    │  更新           │  │             │   │
│  └─────────────────┘    └────────┬────────┘  └─────────────┘   │
│                                  │                               │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ Google Sheets API
                                   ▼
                         ┌─────────────────┐
                         │  Google Sheets  │
                         │  (テストケース) │
                         └─────────────────┘
```

---

## プロジェクト構成

```
/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/               # 認証ページ
│   │   │   └── sign-in/
│   │   ├── (dashboard)/          # ダッシュボード（要認証）
│   │   │   └── dashboard/
│   │   │       ├── page.tsx          # ダッシュボードトップ
│   │   │       ├── repositories/     # リポジトリ管理
│   │   │       ├── reviews/[id]/     # レビュー詳細
│   │   │       ├── settings/         # 設定
│   │   │       └── usage/            # 利用状況
│   │   └── api/                  # API エンドポイント
│   │       ├── auth/[...all]/        # Better Auth
│   │       ├── webhooks/github/      # GitHub Webhook
│   │       ├── inngest/              # Inngest
│   │       └── reviews/[id]/export/  # レビューエクスポート
│   │
│   ├── components/               # React コンポーネント
│   │   ├── ui/                       # Radix UI コンポーネント
│   │   ├── dashboard/                # ダッシュボード用
│   │   ├── auth/                     # 認証用
│   │   └── settings/                 # 設定用
│   │
│   ├── lib/                      # ビジネスロジック
│   │   ├── ai/                       # AI レビュー生成
│   │   │   ├── review.ts                 # メインロジック
│   │   │   ├── client.ts                 # AI クライアント設定
│   │   │   ├── prompts.ts                # プロンプトテンプレート
│   │   │   └── schemas.ts                # 出力スキーマ
│   │   │
│   │   ├── diff/                     # Diff 解析
│   │   │   ├── parser.ts                 # gitdiff-parser ラッパー
│   │   │   ├── filter.ts                 # ファイルフィルタリング
│   │   │   └── types.ts                  # 型定義
│   │   │
│   │   ├── github/                   # GitHub API
│   │   │   ├── client.ts                 # Octokit クライアント
│   │   │   ├── types.ts                  # Webhook 型
│   │   │   └── verify-webhook.ts         # 署名検証
│   │   │
│   │   ├── rag/                      # RAG システム
│   │   │   ├── search.ts                 # ベクトル検索
│   │   │   └── context-builder.ts        # コンテキスト構築
│   │   │
│   │   ├── indexer/                  # リポジトリインデックス
│   │   │   ├── index-repository.ts       # インデックス処理
│   │   │   ├── ast-chunker.ts            # AST ベースチャンキング
│   │   │   └── generic-chunker.ts        # 汎用チャンキング
│   │   │
│   │   ├── pinecone/                 # Pinecone クライアント
│   │   ├── tokenizer/                # トークンカウント
│   │   ├── auth.ts                   # Better Auth 設定
│   │   └── prisma.ts                 # Prisma クライアント
│   │
│   └── inngest/                  # バックグラウンドジョブ
│       ├── client.ts                 # Inngest クライアント
│       ├── events.ts                 # イベント型定義
│       └── functions/
│           ├── review-pr.ts              # PR レビュー処理
│           ├── index-repository.ts       # インデックス処理
│           └── chat-response.ts          # チャット応答
│
├── packages/
│   └── codehorse-handler/        # ローカル CLI ツール
│       └── src/
│           ├── index.ts              # CLI エントリーポイント
│           ├── api-client.ts         # API クライアント
│           ├── claude-invoker.ts     # Claude Code 呼び出し
│           ├── sheets-client.ts      # Google Sheets 操作
│           ├── test-case-parser.ts   # テストケースパーサー
│           └── config.ts             # 設定管理
│
├── prisma/
│   ├── schema.prisma             # データベーススキーマ
│   └── migrations/               # マイグレーションファイル
│
├── docs/                         # ドキュメント
├── scripts/                      # ユーティリティスクリプト
├── next.config.ts                # Next.js 設定
├── package.json
└── tsconfig.json
```

---

## セットアップ

### 必要条件

- Node.js 20+
- PostgreSQL 15+
- GitHub App（作成が必要）
- Google Cloud アカウント（Gemini API / Sheets API）
- Pinecone アカウント

### 環境変数

`.env.example` をコピーして `.env` を作成し、以下の変数を設定：

```bash
# データベース
DATABASE_URL="postgresql://user:pass@localhost:5432/codehorse"

# 認証
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"

# GitHub App
GITHUB_APP_ID="your-app-id"
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_CLIENT_ID="your-client-id"
GITHUB_CLIENT_SECRET="your-client-secret"
GITHUB_WEBHOOK_SECRET="your-webhook-secret"

# Inngest
INNGEST_EVENT_KEY="your-event-key"
INNGEST_SIGNING_KEY="your-signing-key"

# AI
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"

# Vector DB
PINECONE_API_KEY="your-pinecone-api-key"
PINECONE_INDEX_NAME="codehorse"
```

### インストール

```bash
# 依存関係のインストール
npm install --legacy-peer-deps

# Prisma クライアント生成
npx prisma generate

# データベースマイグレーション
npx prisma migrate dev

# 開発サーバー起動
npm run dev
```

### ハンドラーのセットアップ

```bash
cd packages/codehorse-handler

# ビルド
npm run build

# グローバルインストール（オプション）
npm link

# Google 認証設定
codehorse-handler config set-google-auth /path/to/credentials.json
```

---

## 使用方法

### 1. GitHub App のインストール

1. GitHub App を作成（または既存のものを使用）
2. リポジトリに App をインストール
3. CodeHorse にログインし、リポジトリを接続

### 2. PR レビューの自動取得

接続したリポジトリでPRを作成すると、自動的にAIレビューが生成されます。

レビュー内容：
- **サマリーコメント**: PRの概要、変更ファイル一覧、Mermaidダイアグラム
- **インラインコメント**: コードの具体的な行に対する指摘・提案

### 3. ローカルでの修正適用

レビュー詳細ページの「Apply with Claude Code」ボタンをクリックすると、ローカルのClaude Code CLIで修正を適用できます。

```bash
# URL スキームで起動
codehorse://apply?reviewId=xxx&token=yyy&apiUrl=zzz

# または手動で実行
codehorse-handler "codehorse://apply?..."
```

### 4. Google Sheets テストケース連携

PRの説明にGoogle SheetsのURLを含めると、テストケースを自動更新できます。

```markdown
## テストケース管理
https://docs.google.com/spreadsheets/d/xxxxx/edit
```

---

## ワークフロー

### PR レビューフロー

```
1. PR 作成/更新
   └─▶ GitHub Webhook 送信

2. Webhook 受信 (/api/webhooks/github)
   ├─▶ 署名検証
   └─▶ Inngest イベント発行

3. Inngest ジョブ実行 (review-pr)
   ├─▶ DB レコード作成（PR, Review）
   ├─▶ GitHub から Diff 取得
   ├─▶ Diff 解析（gitdiff-parser）
   ├─▶ RAG 検索（関連コード取得）
   ├─▶ AI レビュー生成（Gemini）
   ├─▶ JSON パース（summary, comments, diagram）
   └─▶ GitHub に投稿

4. GitHub PR にコメント表示
```

### リポジトリインデックスフロー

```
1. GitHub App インストール
   └─▶ Webhook 送信

2. Inngest ジョブ実行 (index-repository)
   ├─▶ リポジトリクローン
   ├─▶ AST ベースでコードチャンキング
   ├─▶ 埋め込みベクトル生成
   └─▶ Pinecone にアップロード

3. 増分更新（Push 時）
   └─▶ 変更ファイルのみ再インデックス
```

---

## データベーススキーマ

### 主要テーブル

| テーブル | 説明 |
|----------|------|
| User | ユーザー情報 |
| Repository | GitHubリポジトリ |
| UserRepository | ユーザー・リポジトリ関連 |
| PullRequest | プルリクエスト |
| Review | AIレビュー |
| ReviewComment | インラインコメント |
| Subscription | サブスクリプション |

### インデックスステータス

```
NOT_INDEXED → INDEXING → COMPLETED
                      └→ FAILED
```

### レビューステータス

```
PENDING → PROCESSING → COMPLETED
                    └→ FAILED
```

---

## トラブルシューティング

### レビューが生成されない

1. GitHub App が正しくインストールされているか確認
2. Webhook が正しく設定されているか確認
3. Inngest ダッシュボードでジョブのエラーを確認

### Vercel デプロイエラー

```bash
# Prisma generate を含むビルド
npm run build  # "prisma generate && next build"
```

### Google Sheets 連携エラー

1. サービスアカウントの認証情報が設定されているか確認
2. スプレッドシートがサービスアカウントと共有されているか確認

```bash
codehorse-handler config google-auth-status
```

---

## ライセンス

このプロジェクトはプライベートリポジトリです。

---

## 貢献

Issue や PR は歓迎します。大きな変更を行う前に、まず Issue で議論してください。
