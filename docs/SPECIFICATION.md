# **CodeHorse: 次世代AIコードレビュー・プラットフォーム詳細設計仕様書**

## **1\. エグゼクティブ・サマリー**

### **1.1 プロジェクト概要**

本ドキュメントは、CodeRabbitに代表される高度なAIコードレビュー自動化SaaS、仮称「CodeHorse」を構築するための包括的な技術仕様書である。本プロジェクトの目的は、単なる構文チェックやLintツールを超え、コードベース全体の文脈（Context）を理解した上で、人間のシニアエンジニアに匹敵する洞察を提供するAIエージェントを開発することにある 1。

近年のAIコーディングアシスタント（GitHub Copilot, Cursor等）の普及により、コード生成の速度は飛躍的に向上したが、それをレビューする人間の認知能力は拡張されていない。この「AIコーディング・ボトルネック」を解消するため、CodeHorseはRetrieval-Augmented Generation (RAG) 技術を駆使し、変更されたコードだけでなく、その変更が影響を及ぼす可能性のある依存関係やアーキテクチャ全体を考慮したレビューを自動生成する 3。

### **1.2 コア・バリュープロポジションと技術的差別化**

CodeHorseは以下の技術的特性により、既存の静的解析ツールや単純なLLMラッパーと差別化を図る。

| 機能領域 | 従来のアプローチ | CodeHorseのアプローチ | 技術的根拠 |
| :---- | :---- | :---- | :---- |
| **コンテキスト認識** | 変更行のみを解析 (Diff Only) | **リポジトリ全体を理解 (RAG)** | ベクトルデータベース (Pinecone) とAST解析による意味検索 5 |
| **レビュー粒度** | 単発の指摘 | **対話型・増分レビュー** | 過去のレビュー履歴とスレッドコンテキストを保持し、修正コミットのみを再評価 7 |
| **フィードバック** | テキストのみ | **視覚的ダイアグラム生成** | 複雑なロジック変更を検出し、Mermaid.jsによるシーケンス図を自動生成 9 |
| **統合フロー** | コマンドライン実行 | **完全なGitHubネイティブ** | Webhookイベント駆動型アーキテクチャにより、PR作成・更新時に自動実行 11 |

## ---

**2\. システムアーキテクチャとデザインパターン**

本システムは、高いスケーラビリティと信頼性を確保するため、Next.js 16を中核としたサーバーレス・ファーストのイベント駆動型アーキテクチャを採用する。

### **2.1 ハイレベル・アーキテクチャ詳細**

システム全体は、GitHubからのイベントをトリガーとする非同期処理パイプラインとして設計される。同期的なHTTPレスポンス（Webhookの受信確認）と、バックグラウンドでの長時間実行プロセス（AI推論、インデキシング）を明確に分離することが、GitHubのタイムアウト制限（通常10秒以内）を回避するために不可欠である 13。

#### **データフローの詳細設計**

1. **イベント受信層 (Ingestion Layer)**:  
   * GitHub AppからのWebhook (pull\_request, issue\_comment 等) をNext.jsのAPI Routeで受信。  
   * HMAC署名 (X-Hub-Signature-256) の検証を行い、セキュリティを確保。  
   * リクエストを即座に **Inngest** のイベントバスへプッシュし、GitHub側には 200 OK を即座に返却する 12。  
2. **オーケストレーション層 (Orchestration Layer)**:  
   * **Inngest** がイベントキューを管理し、定義されたワークフロー（Step Functions）を実行する。  
   * ここでの重要な役割は、GitHub APIのレート制限（Rate Limiting）管理と、失敗したジョブの指数バックオフによるリトライ制御である 13。  
3. **処理層 (Processing Layer)**:  
   * **Indexing Worker**: リポジトリのクローン、AST（抽象構文木）によるコード解析、チャンク分割、埋め込みベクトル生成を行う。  
   * **Review Worker**: PRのDiff取得、RAGによる関連コードの検索、LLMへのプロンプト生成、レビュー結果のGitHubへの投稿を行う 1。  
4. **データ永続化層 (Persistence Layer)**:  
   * **PostgreSQL (Prisma)**: ユーザー情報、リポジトリ設定、サブスクリプション状態、レビュー履歴などの構造化データを管理。  
   * **Pinecone**: コードベースの意味論的ベクトルデータを格納。Namespace機能を利用してテナント（リポジトリ）間のデータ分離を強制する 5。

### **2.2 技術スタック選定とその根拠**

| コンポーネント | 選定技術 | 選定理由とアーキテクチャ上の利点 |
| :---- | :---- | :---- |
| **フレームワーク** | **Next.js 16 (App Router)** | React Server Components (RSC) による高速なダッシュボード描画と、Server Actionsによるバックエンドロジックの統合。Vercel AI SDKとの親和性が高い 1。 |
| **言語** | **TypeScript** | 複雑なGitHub Webhookペイロードの型定義や、AST解析時の型安全性確保に必須。コードベースの堅牢性を担保する 19。 |
| **非同期ジョブ** | **Inngest** | サーバーレス環境での長時間実行（Long-running tasks）を可能にするDurable Executionエンジン。Redis等のインフラ管理なしで信頼性の高いキューイングを実現 13。 |
| **ベクトルDB** | **Pinecone** | 完全マネージド型のサーバーレス・ベクトルDB。メタデータフィルタリング機能が強力で、RAGにおける高精度な検索が可能 5。 |
| **AIモデル** | **Google Gemini 1.5 Pro** | 100万トークンを超える巨大なコンテキストウィンドウを持ち、ファイル全体や大規模なDiffを一度に入力可能。RAGの検索漏れをカバーする「Long Context」アプローチに最適 1。 |
| **認証** | **Better Auth** | Next.js 16向けに設計された軽量かつ強力な認証ライブラリ。GitHub OAuthプロバイダーを標準サポートし、Prismaアダプターも完備 20。 |
| **決済・課金** | **Polar.sh** | 開発者ツール向けのMerchant of Record。GitHubリポジトリとの連携機能が豊富で、SaaSのサブスクリプション管理を簡素化できる 1。 |

## ---

**3\. データベース設計とスキーマ仕様 (Prisma)**

SaaSとしてのマルチテナンシー、GitHubエンティティとの同期、そしてAIレビューの履歴管理を実現するための詳細なデータモデルを設計する。

### **3.1 Entity Relationship Diagram (ERD) 記述**

主要なエンティティは User, Repository, PullRequest, Review であり、これらはGitHubのデータ構造と密接にリンクしている。特に重要なのは、GitHub側のID（不変）とアプリケーション側のID（UUID/CUID）のマッピングである。

### **3.2 詳細スキーマ定義 (schema.prisma)**

コード スニペット

datasource db {  
  provider \= "postgresql"  
  url      \= env("DATABASE\_URL")  
}

generator client {  
  provider \= "prisma-client-js"  
}

// \--------------------------------------------------------  
// 認証・ユーザー管理 (Better Auth準拠)  
// \--------------------------------------------------------  
model User {  
  id            String    @id @default(cuid())  
  email         String    @unique  
  name          String?  
  image         String? // GitHubアバターURL  
  githubId      String?   @unique // GitHubユーザーID (不変)  
  createdAt     DateTime  @default(now())  
  updatedAt     DateTime  @updatedAt  
    
  // リレーション  
  subscriptions Subscription  
  accounts      Account  
  sessions      Session  
  repositories  UserRepository // 多対多のリレーション（アクセス権管理）  
}

model Account {  
  id                    String  @id @default(cuid())  
  userId                String  
  type                  String  
  provider              String  // "github"  
  providerAccountId     String  // GitHub側の数値ID  
  refresh\_token         String? @db.Text  
  access\_token          String? @db.Text  
  expires\_at            Int?  
  token\_type            String?  
  scope                 String?  
  id\_token              String? @db.Text  
  session\_state         String?  
    
  user User @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)  
    
  @@unique(\[provider, providerAccountId\])  
}

model Session {  
  id           String   @id @default(cuid())  
  sessionToken String   @unique  
  userId       String  
  expires      DateTime  
  user         User     @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)  
}

// \--------------------------------------------------------  
// コア・ドメインモデル  
// \--------------------------------------------------------

model Repository {  
  id              String   @id @default(cuid())  
  githubRepoId    Int      @unique // GitHub API上のリポジトリID (不変)  
  owner           String   // GitHub Organization または User名  
  name            String   // リポジトリ名  
  full\_name       String   // "owner/name" 形式  
  html\_url        String  
  defaultBranch   String   @default("main")  
  isPrivate       Boolean  @default(false)  
    
  // インデキシング状態管理  
  lastIndexedAt   DateTime?  
  indexStatus     IndexStatus @default(NOT\_INDEXED)  
    
  // GitHub App インストール情報  
  installationId  Int      // Webhookペイロードに含まれるinstallation.id  
    
  // 設定 (YAMLの内容をキャッシュする場合)  
  config          Json?    //.codehorse.yaml のパース結果  
    
  // リレーション  
  pullRequests    PullRequest  
  users           UserRepository  
    
  createdAt       DateTime @default(now())  
  updatedAt       DateTime @updatedAt  
    
  @@index(\[installationId\])  
}

// ユーザーとリポジトリの多対多結合（権限管理用）  
model UserRepository {  
  userId       String  
  repositoryId String  
  permission   String // "admin", "write", "read"  
    
  user         User       @relation(fields: \[userId\], references: \[id\])  
  repository   Repository @relation(fields: \[repositoryId\], references: \[id\])  
    
  @@id(\[userId, repositoryId\])  
}

model PullRequest {  
  id            String   @id @default(cuid())  
  repositoryId  String  
  number        Int      // PR番号 (例: \#101)  
  title         String  
  state         String   // "open", "closed", "merged"  
  author        String   // GitHubユーザー名  
    
  // 増分レビュー制御用のコミットハッシュ  
  baseSha       String   // PRのベースとなるコミットSHA  
  headSha       String   // AIが最後にレビューしたコミットSHA  
    
  reviews       Review  
    
  repository    Repository @relation(fields: \[repositoryId\], references: \[id\])  
    
  createdAt     DateTime @default(now())  
  updatedAt     DateTime @updatedAt  
    
  @@unique(\[repositoryId, number\]) // リポジトリ内でPR番号は一意  
}

model Review {  
  id            String   @id @default(cuid())  
  pullRequestId String  
  commitId      String   // このレビュー対象のコミットSHA  
  summary       String   @db.Text // AI生成されたサマリー  
  status        ReviewStatus @default(PENDING)  
    
  comments      Comment  
    
  pullRequest   PullRequest @relation(fields:, references: \[id\])  
    
  createdAt     DateTime @default(now())  
}

model Comment {  
  id              String   @id @default(cuid())  
  reviewId        String  
  githubCommentId Int?     @unique // GitHub側に投稿されたコメントID  
  filePath        String  
  lineNumber      Int  
  body            String   @db.Text // マークダウン形式のコメント本文  
    
  review          Review   @relation(fields: \[reviewId\], references: \[id\])  
}

// \--------------------------------------------------------  
// 課金・サブスクリプション (Polar.sh)  
// \--------------------------------------------------------

model Subscription {  
  id                   String   @id @default(cuid())  
  userId               String  
  polarSubscriptionId  String   @unique  
  status               SubStatus // active, canceled, past\_due  
  planId               String   // "free\_tier", "pro\_tier"  
  currentPeriodEnd     DateTime  
    
  user                 User     @relation(fields: \[userId\], references: \[id\])  
}

// Enum定義  
enum IndexStatus {  
  NOT\_INDEXED  
  INDEXING  
  COMPLETED  
  FAILED  
}

enum ReviewStatus {  
  PENDING  
  COMPLETED  
  FAILED  
}

enum SubStatus {  
  ACTIVE  
  CANCELED  
  PAST\_DUE  
  INCOMPLETE  
}

### **3.3 データモデル設計の重要ポイントとインサイト**

* **githubRepoId の不変性**: GitHubのリポジトリ名は変更可能（リネームや譲渡）であるため、主キーや検索キーとして名前を使用するとシステムが破損する恐れがある。必ずGitHub APIから提供される数値型のID (id) を永続化し、これを信頼できる唯一の情報源（Source of Truth）とする 21。  
* **増分レビューのための headSha 管理**: PullRequest モデルに headSha（最後にレビューしたコミットハッシュ）を保持することは、コスト最適化の観点で極めて重要である。Webhook (synchronize) を受信した際、ペイロード内の after SHAがDB内の headSha と一致する場合、処理をスキップすることで、無駄なAI推論コストとAPIコールを削減できる 7。  
* **インデキシング状態の可視化**: IndexStatus を導入することで、ユーザーに対して「AIが学習中」であることをUI上で明示できる。RAGシステムにおいて、インデックス未作成状態でのレビューは品質が著しく低下するため、ステータスが COMPLETED になるまでレビュー実行を待機または警告するロジックを実装する 1。

## ---

**4\. コア機能仕様: GitHubインテグレーションとWebhook処理**

CodeHorseは「GitHub App」として実装され、ユーザーのリポジトリに対してきめ細やかな権限とイベント購読を設定する。

### **4.1 GitHub App 権限設定 (Permissions)**

本アプリが機能するために必要な最小権限のセットは以下の通りである。

| 権限カテゴリ | 権限名 | アクセスレベル | 利用目的 |
| :---- | :---- | :---- | :---- |
| **Repository** | Contents | Read-only | リポジトリのコード取得（クローン）、Diffの取得、RAG用のインデキシング 12。 |
| **Repository** | Pull requests | Read & Write | PRの一覧取得、レビューコメントの投稿 (POST /reviews)、コメントへの返信 23。 |
| **Repository** | Metadata | Read-only | リポジトリの基本情報（言語、サイズ、デフォルトブランチ）の取得。 |
| **Repository** | Webhooks | Read-only | Webhook設定の管理（自動設定機能を持つ場合）。 |
| **Organization** | Members | Read-only | Organization内のユーザー確認（チームプランの課金判定用）。 |

### **4.2 Webhookイベントハンドリング戦略**

GitHubからのイベントは多岐にわたるが、CodeHorseは以下のイベントに絞って購読し、ノイズを排除する 11。

| イベント名 | アクション | システム挙動 | 実装上の注意点 |
| :---- | :---- | :---- | :---- |
| pull\_request | opened | **完全レビュー実行**: インデキシング状態を確認し、未完了ならインデックス処理を優先。完了後、Diffを取得してAIレビューを開始。 | 大きなPRの場合、処理時間が長くなるためInngestによる非同期化が必須。 |
| pull\_request | synchronize | **増分レビュー実行**: 新しいコミットが含まれる範囲のみを特定し、その差分だけをレビュー対象とする。 | payload.before と payload.after の間のDiffを取得するロジックが必要 22。 |
| pull\_request\_review\_comment | created | **チャットボット応答**: ユーザーがAIのコメントに返信した場合、スレッド全体の文脈を取得し、AIが回答を生成して返信する。 | AI自身のコメントへの返信かどうかを判定する必要がある（Bot IDによるフィルタリング）25。 |
| installation | created | **初期インデキシング開始**: リポジトリのクローンとベクトル化ジョブを即座にスケジュールする。 | 初回は時間がかかるため、ユーザーにメール等で完了通知を送るとUXが良い。 |
| installation | deleted | **データ削除**: ベクトルDB内の当該Namespaceと、DB内のリポジトリ情報を削除する。 | GDPR/CCPAコンプライアンス遵守のため、物理削除または匿名化を行う 12。 |

### **4.3 レート制限と同時実行制御**

GitHub APIのレート制限（例: 5,000回/時）を超過しないよう、以下の戦略を実装する。

* **InngestのConcurrency制御**: リポジトリ単位またはインストールID単位で同時実行数を制限するキーを設定する。  
  TypeScript  
  // inngest/functions/review-pr.ts  
  export const reviewPR \= inngest.createFunction(  
    { id: "review-pr", concurrency: { limit: 1, key: "event.data.installation.id" } },  
    { event: "github/pull\_request.opened" },  
    async ({ event, step }) \=\> {... }  
  );

  これにより、1つのリポジトリで大量のコミットが発生しても、キューに積まれて順次処理され、API制限エラーを防ぐことができる 13。  
* **リトライ戦略**: octokit クライアントに octokit-plugin-retry または p-retry を組み込み、429 Too Many Requests や 5xx エラー時に自動的に指数バックオフ待機を行う 26。

## ---

**5\. コア機能仕様: RAGパイプラインと「コード理解」エンジン**

本システムの最大の差別化要因である、コードベース全体の文脈理解を実現するためのRAGパイプラインの詳細仕様である。

### **5.1 インデキシング・ワークフロー (Indexing Pipeline)**

単にテキストを一定文字数で分割する従来の手法（Naive Chunking）では、関数やクラスの意味的なまとまりが分断され、検索精度が著しく低下する。CodeHorseでは、**AST（抽象構文木）ベースのチャンキング**を採用する 6。

#### **処理ステップ詳細**

1. **リポジトリの取得**: isomorphic-git または octokit を使用して、サーバーレス環境（Inngest Worker）の一時ディレクトリにリポジトリを浅くクローン（Shallow Clone）する。  
2. **ファイルフィルタリング**: .gitignore の解析に加え、バイナリファイル、ロックファイル (package-lock.json), 生成されたコード (dist/, .next/) を除外する 28。  
3. **ASTチャンキング (TypeScript/JSの場合)**:  
   * **ライブラリ**: ts-morph を使用。  
   * **ロジック**: ソースファイルをパースし、トップレベルの宣言（Class, Function, Interface）を特定する。  
   * **分割ルール**:  
     * 関数/クラスがトークン制限（例: 2048トークン）未満の場合 → 1つのチャンクとして保持。  
     * 制限を超える場合 → メソッド単位や内部ブロック単位で再帰的に分割。  
   * **メタデータ付与**: 各チャンクに filePath, startLine, endLine, scope (関数名等) を付与する 29。  
4. **ベクトル化 (Embedding)**:  
   * **モデル**: Google text-embedding-004 (多言語対応、高性能) または OpenAI text-embedding-3-small。  
   * **次元数**: モデルに依存（例: 768次元または1536次元）。  
5. **Pineconeへの保存**:  
   * **Namespace**: repo\_{githubRepoId} を指定し、テナント間の完全なデータ分離を保証する。  
   * **Upsert**: IDは hash(filePath \+ startLine) で生成し、重複排除を行う 5。

### **5.2 コンテキスト検索戦略 (Retrieval Strategy)**

PRのDiffから「何を検索すべきか」を決定するクエリ生成がRAGの品質を左右する。

* **ハイブリッド検索 (Hybrid Search)**:  
  * Pineconeのハイブリッド検索（Dense Vector \+ Sparse Keyword）を利用する。  
  * コード内の具体的な識別子（変数名、関数名）の一致（Sparse）と、意味的な関連性（Dense）の両方を考慮する 30。  
* **クエリ拡張**:  
  * 単純に変更行を検索クエリにするのではなく、LLMを使って「検索クエリ」を生成させる。  
  * 例: 変更内容が auth.ts の login 関数修正の場合 → クエリ: "usages of login function in auth.ts", "interfaces related to user authentication" 31。

## ---

**6\. コア機能仕様: AIレビューエンジン**

Diffの解析からプロンプトエンジニアリング、そしてGitHubへのコメント投稿までの詳細ロジックである。

### **6.1 Diff解析と構造化 (Diff Parsing)**

GitHub APIから取得した生のDiffテキスト（Unified Diff形式）を、AIが理解しやすい形式かつ、GitHub APIへのコメント投稿に必要な位置情報を持つオブジェクトに変換する。

* **ライブラリ**: gitdiff-parser (推奨) または parse-diff。  
* **マッピングの課題**: GitHubのReview APIは、ファイル内の絶対行番号ではなく、Diff内での相対位置（position）を要求する。パーサーはこのマッピング情報 (diff\_hunk\_index → file\_line\_number) を正確に保持する必要がある 32。

### **6.2 プロンプトエンジニアリング**

AIに対して「一般的な賞賛」や「表面的な指摘」を抑制し、実用的で深い指摘を行わせるためのシステムプロンプト設計。

#### **システムプロンプト例 (概念コード)**

あなたは世界トップクラスのシニアソフトウェアエンジニアです。  
以下のPull Requestの変更をレビューし、バグ、セキュリティ脆弱性、パフォーマンスの問題、保守性の欠如を指摘してください。

## **コンテキスト情報 (RAGにより取得)**

{{retrieved\_context}}

## **制約事項**

1. **フォーマットやスタイル**（インデント、空白）については絶対にコメントしないこと（Linterの役割である）。  
2. **賞賛**（"Nice change", "Good job"）は一切不要。  
3. コードの**意図**や**背景**を推測し、コンテキスト情報と矛盾がある場合は指摘すること。  
4. 各指摘には、可能な限り **修正案（Suggestion）** をコードブロックで提示すること。  
5. 重大度（Severity）を判定し、CRITICAL, IMPORTANT, NITPICK のいずれかを付与すること。

## **出力形式**

必ず以下のJSONスキーマに従って出力すること。マークダウンの装飾はJSONの文字列内に含めること。  
{  
"reviews":  
}

33

### **6.3 Mermaidダイアグラム自動生成**

複雑なロジック変更が含まれる場合、AIは変更前後のフローを可視化するMermaid.jsコードを生成する。

* **トリガー**: システムプロンプト内で、「制御フローの変更が複雑な場合、diagram フィールドにMermaidのシーケンス図を含めてください」と指示する。  
* **レンダリング**: GitHubのコメント欄はMermaidをネイティブサポートしているため、AIが出力したMermaidコードをそのまま \`\`\`mermaid ブロックで囲んで投稿するだけで、GitHub上で図として表示される 9。

## ---

**7\. フロントエンド仕様とダッシュボード**

ユーザーがリポジトリを管理し、レビュー設定を行い、過去の分析結果を閲覧するための管理画面。

### **7.1 技術スタックとコンポーネント**

* **UIライブラリ**: **Shadcn UI** (Radix UI \+ Tailwind CSS)。アクセシビリティ対応とカスタマイズ性を両立。  
* **状態管理**: **TanStack Query (React Query)**。サーバー状態（リポジトリ一覧、レビュー履歴）のキャッシュと同期に利用 1。  
* **グラフ描画**: **Recharts**。PR数やAIレビュー統計の可視化に使用。

### **7.2 主要画面仕様**

1. **リポジトリ連携画面 (Repository List)**:  
   * GitHub Appでインストール済みのリポジトリ一覧を表示。  
   * 各リポジトリに対し、スイッチ一つで「AIレビューの有効/無効」を切り替え可能。  
   * 「Re-index」ボタンを配置し、手動でのインデックス再構築を可能にする。  
2. **設定画面 (Configuration)**:  
   * **YAMLバリデータ**: ブラウザ上で .codehorse.yaml の設定内容をシミュレーションできるエディタ。  
   * **トーン設定**: レビューの厳しさ（Strict vs Friendly）や言語（日本語/英語）の設定UI。  
3. **レビュー履歴詳細 (Review Inspector)**:  
   * 過去のPRレビューをクリックすると、AIが「なぜその指摘をしたか」の推論プロセス（Chain of Thought）や、RAGで参照したコードスニペットを表示する「Shadow View」機能。これはデバッグおよびAIへの信頼性向上に寄与する 1。

## ---

**8\. SaaS課金モデルとマルチテナンシー (Polar.sh)**

持続可能なビジネスモデルとしてのSaaS機能を実装する。

### **8.1 ティア（料金プラン）設計**

| 機能 | Free Tier | Pro Tier ($29/mo) | Enterprise |
| :---- | :---- | :---- | :---- |
| **リポジトリ数** | 1 (Publicのみ) | 無制限 (Private含む) | 無制限 |
| **月間レビュー数** | 50 PR | 無制限 | 無制限 |
| **AIモデル** | GPT-4o-mini / Gemini Flash | **GPT-4o / Gemini Pro** | カスタムモデル対応 |
| **同時実行数** | 低優先度 (キュー待機あり) | 高優先度 | 専有インスタンス |
| **RAGコンテキスト** | 制限あり (直近のファイルのみ) | **フルリポジトリ** | 複数リポジトリ横断 |

### **8.2 実装ロジック**

* 制限の強制 (Enforcement):  
  Inngestのワークフロー冒頭で、該当ユーザー/Organizationのサブスクリプション状態をチェックする。  
  TypeScript  
  // inngest/functions/review.ts  
  const subscription \= await db.subscription.findUnique({ where: { userId: ownerId } });  
  if (subscription.plan \=== 'FREE' && usage \> 50) {  
    // GitHubにコメントして終了  
    await octokit.issues.createComment({ body: "Freeプランの上限に達しました..." });  
    return;  
  }

* Polar.sh Webhook:  
  Polarからの subscription.created, subscription.updated, subscription.canceled イベントを受信し、Prismaデータベースの Subscription テーブルをリアルタイムで同期する 1。

## ---

**9\. セキュリティとコンプライアンス**

エンタープライズ顧客が最も懸念するソースコードの取り扱いについて、厳格なセキュリティ対策を実装する。

* Ephemeral Cloning (短命なクローン):  
  リポジトリのコードは、インデキシング処理中のみInngest Workerの一時ストレージ（ /tmp 等）に存在し、処理完了後即座に rm \-rf で物理削除される。永続ストレージ（S3等）には保存しない。  
* ベクトルの匿名化:  
  Pineconeに保存されるベクトルデータからは、元のソースコードを復元することは困難だが、念のためメタデータにはコードスニペットそのものは含めず、ファイルパスと行番号のみを保存する設計も検討する（ただし、RAGの精度とのトレードオフになる）。  
* トークン管理:  
  GitHub Appのインストールトークンは1時間の有効期限があるため、ジョブ実行のたびにSDKを通じて動的に再発行し、静的なトークン保存を行わない 37。

## ---

**10\. 実装ロードマップ**

### **フェーズ1: MVP (Weeks 1-3)**

* **目標**: 単純なテキストベースのレビューが動く状態。  
* **タスク**:  
  * Next.js 16 \+ Better Auth \+ Prismaのセットアップ。  
  * GitHub Appの登録とWebhook受信の実装。  
  * Diff取得とGPT-4oへの送信、コメント投稿のパイプライン構築。

### **フェーズ2: RAG & Intelligence (Weeks 4-6)**

* **目標**: コンテキスト認識の実装。  
* **タスク**:  
  * Inngestによる非同期ジョブ基盤の構築。  
  * ts-morph を用いたASTチャンキングの実装。  
  * Pinecone連携とインデキシング処理の実装。  
  * Gemini 1.5 Proへのモデル切り替えとプロンプト調整。

### **フェーズ3: SaaS & UX (Weeks 7-9)**

* **目標**: 課金機能とダッシュボードの完成。  
* **タスク**:  
  * Polar.shとの統合。  
  * Shadcn UIを用いたダッシュボード構築。  
  * 増分レビューとチャットボット機能の実装。

## **11\. 結論**

本仕様書に基づきCodeHorseを開発することで、既存の静的解析ツールでは到達できない「コードの意味を理解する」レビュー体験を提供できる。特に、Next.js 16の最新機能とInngest/Pineconeといったサーバーレス・インフラの組み合わせは、開発速度とスケーラビリティの両立を可能にし、少人数のチームでもエンタープライズ級のSaaSを構築・運用することを現実的なものにする。

#### **引用文献**

1. 1月 1, 1970にアクセス、 [https://github.com/coderabbitai/ai-pr-reviewer/tree/main](https://github.com/coderabbitai/ai-pr-reviewer/tree/main)  
2. CodeRabbit Documentation \- AI code reviews on pull requests, IDE, and CLI, 12月 25, 2025にアクセス、 [https://docs.coderabbit.ai/guides/code-review-overview](https://docs.coderabbit.ai/guides/code-review-overview)  
3. CodeRabbit Documentation \- AI code reviews on pull requests, IDE, and CLI, 12月 25, 2025にアクセス、 [https://docs.coderabbit.ai/](https://docs.coderabbit.ai/)  
4. Context Engineering: Level up your AI Code Reviews \- CodeRabbit, 12月 25, 2025にアクセス、 [https://www.coderabbit.ai/blog/context-engineering-ai-code-reviews](https://www.coderabbit.ai/blog/context-engineering-ai-code-reviews)  
5. Use Pinecone with Vertex AI RAG Engine \- Google Cloud Documentation, 12月 25, 2025にアクセス、 [https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/use-pinecone](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/use-pinecone)  
6. cAST: Enhancing Code Retrieval-Augmented Generation with Structural Chunking via Abstract Syntax Tree \- arXiv, 12月 25, 2025にアクセス、 [https://arxiv.org/html/2506.15655v2](https://arxiv.org/html/2506.15655v2)  
7. Show: AI powered Pull Request Reviewer : r/softwarearchitecture \- Reddit, 12月 25, 2025にアクセス、 [https://www.reddit.com/r/softwarearchitecture/comments/15knanx/show\_ai\_powered\_pull\_request\_reviewer/](https://www.reddit.com/r/softwarearchitecture/comments/15knanx/show_ai_powered_pull_request_reviewer/)  
8. Show: CodeRabbit \- Speeding up Code Reviews : r/agile \- Reddit, 12月 25, 2025にアクセス、 [https://www.reddit.com/r/agile/comments/15gxmnm/show\_coderabbit\_speeding\_up\_code\_reviews/](https://www.reddit.com/r/agile/comments/15gxmnm/show_coderabbit_speeding_up_code_reviews/)  
9. This Text-to-Diagram Tool Will Save You HOURS (Mermaid \+ AI), 12月 25, 2025にアクセス、 [https://www.youtube.com/watch?v=siytVQtvVXY](https://www.youtube.com/watch?v=siytVQtvVXY)  
10. MermaidSeqBench: An Evaluation Benchmark for LLM-to-Mermaid Sequence Diagram Generation \- arXiv, 12月 25, 2025にアクセス、 [https://arxiv.org/html/2511.14967v1](https://arxiv.org/html/2511.14967v1)  
11. Webhook events and payloads \- GitHub Docs, 12月 25, 2025にアクセス、 [https://docs.github.com/en/webhooks/webhook-events-and-payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)  
12. Building a GitHub App that responds to webhook events, 12月 25, 2025にアクセス、 [https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events)  
13. Next.js Quick Start \- Inngest Documentation, 12月 25, 2025にアクセス、 [https://www.inngest.com/docs/getting-started/nextjs-quick-start](https://www.inngest.com/docs/getting-started/nextjs-quick-start)  
14. Patterns: Async \+ Event-Driven \- Inngest, 12月 25, 2025にアクセス、 [https://www.inngest.com/patterns](https://www.inngest.com/patterns)  
15. Consuming webhook events \- Inngest Documentation, 12月 25, 2025にアクセス、 [https://www.inngest.com/docs/platform/webhooks](https://www.inngest.com/docs/platform/webhooks)  
16. I Built an AI Code Review SaaS with Next.js 16 Pinecone RAG Gemini AI Inngest Better Auth Polar, 12月 25, 2025にアクセス、 [https://www.youtube.com/watch?v=my29RqLL-vg\&t=458s](https://www.youtube.com/watch?v=my29RqLL-vg&t=458s)  
17. Indexing overview \- Pinecone Docs, 12月 25, 2025にアクセス、 [https://docs.pinecone.io/guides/index-data/indexing-overview](https://docs.pinecone.io/guides/index-data/indexing-overview)  
18. adrianhajdin/dev-events-nextjs16-crash-course: Event Platform with a home page listing events, API routes for CRUD, Cloudinary image uploads, detailed event pages with registration and similar events, and PostHog analytics to track interactions. \- GitHub, 12月 25, 2025にアクセス、 [https://github.com/adrianhajdin/dev-events-nextjs16-crash-course](https://github.com/adrianhajdin/dev-events-nextjs16-crash-course)  
19. git-diff Documentation \- Git, 12月 25, 2025にアクセス、 [https://git-scm.com/docs/git-diff](https://git-scm.com/docs/git-diff)  
20. Next.js integration \- Better Auth, 12月 25, 2025にアクセス、 [https://www.better-auth.com/docs/integrations/next](https://www.better-auth.com/docs/integrations/next)  
21. Prisma Schema Overview | Prisma Documentation, 12月 25, 2025にアクセス、 [https://www.prisma.io/docs/orm/prisma-schema/overview](https://www.prisma.io/docs/orm/prisma-schema/overview)  
22. Does AI Code Review Lead to Code Changes? A Case Study of GitHub Actions \- arXiv, 12月 25, 2025にアクセス、 [https://arxiv.org/html/2508.18771v1](https://arxiv.org/html/2508.18771v1)  
23. octokit \- . \- pulls \- GitHub Pages, 12月 25, 2025にアクセス、 [https://actions-cool.github.io/octokit-rest/api/pulls/](https://actions-cool.github.io/octokit-rest/api/pulls/)  
24. Events that trigger workflows \- GitHub Docs, 12月 25, 2025にアクセス、 [https://docs.github.com/actions/learn-github-actions/events-that-trigger-workflows](https://docs.github.com/actions/learn-github-actions/events-that-trigger-workflows)  
25. \[Feature Request\] Webhooks for reactions on pull request review comments · community · Discussion \#20824 \- GitHub, 12月 25, 2025にアクセス、 [https://github.com/orgs/community/discussions/20824](https://github.com/orgs/community/discussions/20824)  
26. sindresorhus/p-retry: Retry a promise-returning or async function \- GitHub, 12月 25, 2025にアクセス、 [https://github.com/sindresorhus/p-retry](https://github.com/sindresorhus/p-retry)  
27. AST Enables Code RAG Models to Overcome Traditional Chunking Limitations \- Medium, 12月 25, 2025にアクセス、 [https://medium.com/@jouryjc0409/ast-enables-code-rag-models-to-overcome-traditional-chunking-limitations-b0bc1e61bdab](https://medium.com/@jouryjc0409/ast-enables-code-rag-models-to-overcome-traditional-chunking-limitations-b0bc1e61bdab)  
28. Hi7cl4w/diffy-explain-ai: Generate Commit Message the changed code using git diff and OpenAI in natural language \- GitHub, 12月 25, 2025にアクセス、 [https://github.com/Hi7cl4w/diffy-explain-ai](https://github.com/Hi7cl4w/diffy-explain-ai)  
29. ts-morph \- Documentation, 12月 25, 2025にアクセス、 [https://ts-morph.com/](https://ts-morph.com/)  
30. Getting Started with Hybrid Search | Pinecone, 12月 25, 2025にアクセス、 [https://www.pinecone.io/learn/hybrid-search-intro/](https://www.pinecone.io/learn/hybrid-search-intro/)  
31. Advanced RAG Techniques \- Pinecone, 12月 25, 2025にアクセス、 [https://www.pinecone.io/learn/advanced-rag-techniques/](https://www.pinecone.io/learn/advanced-rag-techniques/)  
32. gitdiff-parser \- NPM, 12月 25, 2025にアクセス、 [http://www.npmjs.com/package/gitdiff-parser](http://www.npmjs.com/package/gitdiff-parser)  
33. AI Code Reviews | CodeRabbit | Try for Free, 12月 25, 2025にアクセス、 [https://www.coderabbit.ai/](https://www.coderabbit.ai/)  
34. ai-pr-reviewer/src/prompts.ts at main · coderabbitai/ai-pr-reviewer \- GitHub, 12月 25, 2025にアクセス、 [https://github.com/coderabbitai/ai-pr-reviewer/blob/main/src/prompts.ts](https://github.com/coderabbitai/ai-pr-reviewer/blob/main/src/prompts.ts)  
35. How to Generate Mermaid Sequence Diagrams from Code Using GPT, 12月 25, 2025にアクセス、 [https://medium.com/@swapnil.more\_24578/how-to-generate-mermaid-sequence-diagrams-from-code-using-gpt-7800ace119c5](https://medium.com/@swapnil.more_24578/how-to-generate-mermaid-sequence-diagrams-from-code-using-gpt-7800ace119c5)  
36. Better Auth Full Tutorial with Next.js, Prisma ORM, PostgreSQL, Nodemailer \- Reddit, 12月 25, 2025にアクセス、 [https://www.reddit.com/r/nextjs/comments/1kllpsv/better\_auth\_full\_tutorial\_with\_nextjs\_prisma\_orm/](https://www.reddit.com/r/nextjs/comments/1kllpsv/better_auth_full_tutorial_with_nextjs_prisma_orm/)  
37. Today I learned: Using Octokit\! \- DEV Community, 12月 25, 2025にアクセス、 [https://dev.to/saminarp/today-i-learned-using-octokit-2bdm](https://dev.to/saminarp/today-i-learned-using-octokit-2bdm)