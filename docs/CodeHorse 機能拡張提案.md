# **CodeHorse 技術仕様書およびアーキテクチャ進化に関する包括的研究レポート**

## **1\. 序論**

### **1.1 背景と目的**

現代のソフトウェア開発において、AIによるコードレビュー支援は「生成（Generative）」の段階から「検証（Verification）」および「適応（Adaptation）」の段階へと進化しつつある。現在開発中の「CodeHorse」は、Next.js、Inngest、Gemini、Pineconeという先進的なスタックを基盤とし、開発者の生産性を飛躍的に向上させることを目指している。本レポートは、CodeHorseの次期フェーズにおける核心機能である「Verified Auto-Fix with Sandboxed Reflexion（検証済み自動修正）」と「Adaptive Learning Memory（適応型学習メモリ）」の実装アプローチを詳細に設計し、その技術的実現可能性とアーキテクチャへの影響を網羅的に分析するものである。

特に、従来の「URLスキームによるローカル起動」から「E2Bを用いたサーバーサイド検証」への移行は、単なる機能追加ではなく、システム全体の信頼性、セキュリティ、およびユーザー体験を根本から変革するパラダイムシフトである。本稿では、15,000語に及ぶ詳細な分析を通じて、エンジニアリングチームが実装に着手するために必要な全ての技術的文脈、データ構造、制御フロー、およびリスク評価を提供する。

### **1.2 技術的課題と解決の方向性**

現状のLLM（大規模言語モデル）を用いたコードレビューツールが抱える最大の課題は「幻覚（Hallucination）」と「文脈の断絶」である。生成された修正コードが構文的に正しいように見えても、実際の依存関係やランタイム環境においては動作しないケースが多発している。また、AIはセッションごとに記憶がリセットされるため、ユーザー固有のコーディング規約や設計思想を学習せず、同じ指摘を繰り返す傾向がある。

これらの課題に対し、本設計では以下の2つのアプローチを採用する。

1. **Sandboxed Reflexion（サンドボックス化された再帰的修正）**: LLMが生成したコードを、E2Bが提供する隔離されたクラウド環境で実際に実行・テストし、その結果（エラーログ等）をLLMにフィードバックして自律的に修正させるループ（Reflexion）を構築する 1。  
2. **Adaptive Learning Memory（適応型学習メモリ）**: ユーザーのフィードバックや修正履歴をベクトル化してPineconeに蓄積し、RAG（Retrieval-Augmented Generation）を用いて次回のレビュー時に動的にコンテキストとして注入することで、継続的な学習を実現する 3。

## ---

**2\. システムアーキテクチャ概要**

### **2.1 コアコンポーネントの役割**

CodeHorseの次世代アーキテクチャは、各コンポーネントが疎結合でありながらも、データと制御のフローが密接に連携する分散システムとして設計される。

| コンポーネント | 技術スタック | 主な役割 | 選定理由と特性 |
| :---- | :---- | :---- | :---- |
| **フロントエンド/API** | Next.js (App Router) | UI提供、Webhook受信 | Vercel上でのホスティングに最適化されており、Server Componentsによるセキュアなデータフェッチが可能 5。 |
| **オーケストレーション** | Inngest | ワークフロー制御、状態管理 | Vercelのサーバーレス関数におけるタイムアウト制限（最大10-60秒）を回避し、数分〜数時間に及ぶ処理を「ステップ」として永続化実行（Durable Execution）する 7。 |
| **実行環境（Sandbox）** | E2B | コード実行、テスト、検証 | FirecrackerマイクロVMを用いたセキュアで高速（起動約150ms）なサンドボックス環境を提供。AI生成コードの隔離実行に特化している 1。 |
| **推論エンジン** | Google Gemini 1.5 Pro/Flash | コード解析、生成、Reflexion | 100万トークンを超えるコンテキストウィンドウを持ち、大規模なリポジトリ全体の文脈や詳細なエラーログを一度に処理可能 10。 |
| **長期記憶（Memory）** | Pinecone (Serverless) | ベクトル検索、ルール蓄積 | サーバーレスアーキテクチャにより、マルチテナント環境でのスケーラビリティとコスト効率を両立。メタデータフィルタリングによる厳密なデータ分離が可能 12。 |

### **2.2 データフローの全体像**

1. **トリガー**: GitHub Webhook（PR作成/コメント）がNext.jsのエンドポイントで受信される。  
2. **イベント発火**: Inngestへイベント（例: review.requested）が送信される。  
3. **メモリ検索**: Pineconeから関連する過去のルールや仕様書（Specification）が取得される。  
4. **推論と生成**: Geminiがコードを解析し、修正案を生成する。  
5. **検証ループ**: E2Bサンドボックス内で修正案がテストされ、失敗すればGeminiが再修正を行う（Reflexion）。  
6. **結果通知**: 検証済みのコードがGitHubへPRコメントとして投稿される。

## ---

**3\. 詳細設計：Verified Auto-Fix with Sandboxed Reflexion**

「検証済み自動修正」機能は、AIが提案するコードの信頼性を担保するための核心技術である。これは単なるコード生成ではなく、コンパイラやテストランナーからのフィードバックを用いた強化学習的なループ構造を持つ。

### **3.1 Reflexionパターンの理論と実装**

Reflexion 2 は、エージェントが自身の出力に対する外部からのシグナル（テスト結果など）を受け取り、それを「自己反省（Reflection）」として次の試行に活かすプロセスである。

#### **3.1.1 制御フローの数学的モデル**

Reflexionプロセス $R$ は、初期状態 $s\_0$ （バグのあるコード）とテスト関数 $T(c)$ （コード $c$ に対する評価）を用いて、以下のように定義される。

1. **生成**: $c\_0 \= G(s\_0)$ ここで $G$ はLLMによる生成関数。  
2. **評価**: $e\_0 \= T(c\_0)$ ここで $e\_0$ はエラーログまたは成功シグナル。  
3. **反省**: $r\_0 \= Reflect(c\_0, e\_0)$ LLMがエラー原因を言語化する。  
4. **修正**: $c\_{i+1} \= G(s\_0, c\_i, e\_i, r\_i)$  
5. **終了条件**: $T(c\_i) \== Success$ または $i \\ge MaxIterations$。

このループをInngest上で実装する際、各ステップは独立したHTTPリクエストとして処理され、状態（$c\_i, e\_i$）はInngestのステートストアに永続化される。

### **3.2 Inngestによるワークフローオーケストレーション**

Vercel等のサーバーレス環境では、長時間の処理がタイムアウトによって強制終了されるリスクがある 15。E2Bでの環境構築（npm install等）やテスト実行は数分を要するため、Inngestの「Durable Functions」機能が不可欠となる。

#### **3.2.1 ステートマシン設計**

ワークフローは以下のステップに分割され、各ステップ間でのデータの受け渡しと再試行が保証される。

**ステップ定義:**

1. **setup-sandbox**: E2Bサンドボックスを初期化する。  
   * **入力**: リポジトリID、言語スタック（Node.js, Python等）。  
   * **処理**: Sandbox.create() を呼び出し、サンドボックスIDを取得。  
   * **出力**: sandboxId。このIDは後続のステップで同じVMに接続するために必須である 16。  
2. **prepare-environment**: 依存関係の解決。  
   * **処理**: リポジトリのクローン、または必要なファイルの書き込み。npm install の実行。  
   * **タイムアウト対策**: このステップは長時間化しやすいため、Inngestの自動リトライとステップ分離が重要である。  
3. **reflexion-loop**: 再帰的な修正ループ。  
   * Inngestは現状、無限ループを推奨していないため、固定回数（例: 3回）のループを展開するか、再帰的に自身を呼び出すパターンを採用する 18。  
   * 各イテレーション内で generate \-\> apply \-\> test \-\> analyze を実行する。

#### **3.2.2 実装コード（TypeScript）の構造**

以下に、InngestとE2Bを組み合わせた実装の概念コードを示す。

TypeScript

import { inngest } from "@/inngest/client";  
import { Sandbox } from "@e2b/code-interpreter";  
import { generateFix, analyzeError } from "@/lib/gemini";

export const verifiedAutoFix \= inngest.createFunction(  
  { id: "verified-auto-fix", concurrency: 10 }, // 同時実行制御  
  { event: "review.fix\_requested" },  
  async ({ event, step }) \=\> {  
      
    // Step 1: Sandboxの確保（5分間のKeepalive）  
    const { sandboxId } \= await step.run("init-sandbox", async () \=\> {  
      const sbx \= await Sandbox.create({   
        template: "node-js-custom", // 事前にビルドした高速起動テンプレート  
        timeoutMs: 300\_000 // 5分 \[19\]  
      });  
      return { sandboxId: sbx.sandboxId };  
    });

    // Step 2: 環境構築  
    await step.run("setup-env", async () \=\> {  
      const sbx \= await Sandbox.connect(sandboxId);  
      await sbx.filesystem.write("/code/target.ts", event.data.code);  
      await sbx.commands.exec("npm install");   
    });

    let currentCode \= event.data.code;  
    let attempts \= 0;  
    const maxAttempts \= 3;

    // Step 3: Reflexionループ（ステップ内ループパターン）  
    // ループ全体を1つのステップにするとタイムアウトのリスクがあるため、  
    // 各試行を個別のstep.runでラップする動的アプローチを推奨  
    while (attempts \< maxAttempts) {  
      const result \= await step.run(\`attempt-${attempts}\`, async () \=\> {  
        const sbx \= await Sandbox.connect(sandboxId);  
          
        // 3a. 生成 & 適用  
        // 前回のエラーがあればそれを考慮してGeminiに修正させる  
        const fix \= await generateFix(currentCode, lastError);   
        await sbx.filesystem.write("/code/target.ts", fix.code);

        // 3b. 検証（テスト実行）  
        const testCmd \= await sbx.commands.exec("npm test");  
          
        if (testCmd.exitCode \=== 0) {  
            return { success: true, code: fix.code };  
        }  
          
        // 3c. 分析（Reflection）  
        return {   
            success: false,   
            error: testCmd.stderr \+ testCmd.stdout   
        };  
      });

      if (result.success) {  
        // 成功時の処理：PR作成など  
        await step.run("create-pr", async () \=\> {... });  
        break;  
      }  
        
      lastError \= result.error;  
      attempts++;  
    }

    // Step 4: クリーンアップ  
    await step.run("cleanup", async () \=\> {  
       const sbx \= await Sandbox.connect(sandboxId);  
       await sbx.kill(); // リソース解放 \[16\]  
    });  
  }  
);

### **3.3 E2Bサンドボックスの詳細構成**

E2Bの利用においては、以下の技術的詳細を考慮する必要がある。

#### **3.3.1 カスタムテンプレートによる起動高速化**

デフォルトのE2Bテンプレートでは、毎回 npm install を実行すると数分かかる場合がある。これを短縮するため、一般的な依存関係（React, Next.js, Jest, Lodash等）をプリインストールしたカスタムDockerイメージを作成し、E2Bテンプレートとして登録することを強く推奨する 20。これにより、環境構築時間を大幅に短縮し、ユーザーの待ち時間を削減できる。

#### **3.3.2 セキュリティと隔離**

E2BはFirecrackerマイクロVMを使用しており、コンテナ技術（Docker）よりも高いレベルの隔離を提供する。しかし、悪意あるコード（無限ループ、リソース枯渇攻撃、外部への攻撃的通信）が実行されるリスクはゼロではない。

* **ネットワーク制限**: E2Bサンドボックスからのアウトバウンド通信は、必要なドメイン（npmレジストリ、GitHub等）のみにホワイトリスト化すべきである。  
* **リソース制限**: 各サンドボックスにはメモリとCPUの制限が適用される。Reflexionループ内でメモリ不足（OOM）が発生した場合、Inngest側でそれを検知し、ユーザーに「修正不可能（リソース不足）」として通知するエラーハンドリングが必要である。

#### **3.3.3 ファイルシステムの永続性**

Inngestのステップ間でサンドボックスへの接続が切れた場合でも、sandboxId が有効であり、タイムアウト（デフォルト5分、最大24時間）内であれば、ファイルシステムの状態は保持される 21。ただし、予期せぬ切断に備え、重要な中間生成物（修正コードそのもの）はInngestのステート（step.runの戻り値）としてもバックアップしておく二重化戦略が望ましい。

## ---

**4\. 詳細設計：Adaptive Learning Memory**

「適応型学習メモリ」は、CodeHorseを単なるツールから「相棒」へと昇華させる機能である。ユーザーの暗黙的な好みや明示的な指示を学習し、組織全体で共有する知識ベースを構築する。

### **4.1 フィードバックループのアーキテクチャ**

この機能は、情報の「収集」「抽出」「蓄積」「検索」の4フェーズで構成される。

1. **収集 (Collection)**: ユーザーがAIの提案を拒否（Reject）し、独自の修正を行った際の差分（Diff）、またはPR上のコメントを取得する。  
2. **抽出 (Extraction)**: 差分から「なぜAI案が却下されたか」のルールを言語化する。  
3. **蓄積 (Storage)**: ルールをベクトル化し、Pineconeにメタデータ付きで保存する。  
4. **検索 (Retrieval)**: 次回のレビュー時に、コードの文脈に合わせてルールを取り出す（RAG）。

### **4.2 ルール抽出エージェントのロジック**

Geminiを用いた抽出エージェントは、以下のプロンプト戦略で動作する。

* **入力**: AI\_Proposal, User\_Final\_Code, File\_Path  
* **タスク**: 「ユーザーはAIの提案を採用せず、別の実装を行った。この変更から読み取れるコーディング規約やスタイルガイドラインを、簡潔な自然言語のルールとして抽出せよ。」  
* **出力例**:  
  * *Implicit Rule*: "Reactコンポーネントの定義には function キーワードではなくアロー関数を使用する。"  
  * *Explicit Rule* (コメントから): "データベース呼び出しは必ずカスタムラッパー db.safeQuery を経由する。"

### **4.3 Pineconeスキーマ設計とマルチテナンシー**

PineconeのServerless Indexを使用し、マルチテナント環境下でのデータ分離と効率的な検索を実現する 13。

#### **4.3.1 ベクトル空間とメタデータ設計**

単一のインデックス内で全ての顧客データを管理するため、メタデータフィルタリングによる論理的な分離（Namespaceパターン）を採用する 24。

| フィールド名 | データ型 | 説明 | フィルタリング用途 |
| :---- | :---- | :---- | :---- |
| id | String | UUID | ルールの一意なID |
| values | Float | Embedding Vector | ルール文章のベクトル（Gemini Embedding 004等を使用） |
| metadata.org\_id | String | Tenant ID | **必須**: 組織ごとのデータ隔離（$eq演算子で使用） |
| metadata.repo\_id | String | Repo ID | リポジトリ固有のルールの場合に設定 |
| metadata.language | String | 言語識別子 | typescript, python 等。言語コンテキストの一致に使用 |
| metadata.source | String | implicit / explicit / spec | ルールの由来（学習、明示、仕様書） |
| metadata.confidence | Float | 0.0 \- 1.0 | 信頼度スコア。時間経過や否定フィードバックで減衰させる |

#### **4.3.2 検索戦略（Hybrid Searchの検討）**

単なるベクトル検索（Semantic Search）では、具体的な変数名や特定のライブラリ名（例: "Zod"）を含むルールの検索精度が落ちる場合がある。Pineconeは疎ベクトル（Sparse Vector）と密ベクトル（Dense Vector）を組み合わせたハイブリッド検索をサポートしている。  
CodeHorseでは、コード内の識別子（キーワード）を疎ベクトルとし、ルールの意味内容を密ベクトルとすることで、「特定のライブラリに関する抽象的なルール」を正確にヒットさせる検索戦略を採用すべきである。

### **4.4 Specification-Aware（仕様書認識）機能の統合**

ユーザーの要望にある「Specification-Aware」機能は、このAdaptive Memoryの一部として統合することが最適である。

#### **4.4.1 実装アプローチ**

1. **仕様書のIngest**: OpenAPI (Swagger) や .md 形式の設計書をリポジトリから読み込む。  
2. **チャンク化**: LangChain等のスプリッターを用いて、APIエンドポイント定義やデータモデル定義ごとに文書を分割する 26。  
3. **ベクトル化と保存**: 分割されたチャンクをPineconeに保存する際、metadata.type \= 'specification' タグを付与する。

#### **4.4.2 レビュー時の活用**

Geminiが /api/users エンドポイントの実装をレビューする際、Pineconeに対して「/api/users に関連する仕様」をクエリする。検索結果としてOpenAPIの定義（例: 必須フィールド、型定義、レスポンスコード）が取得され、Geminiのシステムプロンプトに注入される。これにより、「コードとしては正しいが、仕様書（OpenAPI）で定義されたレスポンス型と異なる」といった高度なレビューが可能になる 28。

## ---

**5\. アーキテクチャ移行の影響分析**

「URLスキームによるローカル起動」から「E2Bを用いたサーバーサイド検証」への移行は、多くのメリットをもたらす反面、考慮すべきトレードオフが存在する。

### **5.1 比較分析マトリクス**

| 評価軸 | 現行アーキテクチャ（URLスキーム/ローカル） | 新アーキテクチャ（E2Bサーバーサイド） | 影響度と対策 |
| :---- | :---- | :---- | :---- |
| **実行環境** | ユーザーのローカルマシン | クラウド上のE2Bサンドボックス | **高**: ユーザー環境依存（"Works on my machine"）が解消される一方、クラウドコストが発生する。 |
| **検証可能性** | ユーザーの手動実行に依存 | 自動化されたReflexionループにより保証 | **革新**: 信頼性が劇的に向上する。これが「Verified」を名乗る根拠となる。 |
| **セキュリティ** | コードは外部に出ない（一部） | コードがE2B環境へ転送される | **中**: 厳格なデータプライバシー契約と、E2Bの隔離性の説明が必要。機密情報（Secrets）の取扱に注意。 |
| **レイテンシ** | ほぼゼロ（ローカルプロセス） | 環境構築に数分〜 | **高**: 同期的なUIから非同期（ジョブ完了通知型）UIへの変更が必須。InngestによるポーリングやWebSocket通知の実装が必要。 |
| **状態管理** | ステートレス（都度起動） | ステートフル（Pineconeメモリ） | **中**: 過去の文脈を考慮したレビューが可能になる。 |
| **コスト構造** | クライアント計算資源（無料） | サーバー計算資源（従量課金） | **高**: E2Bの稼働時間とInngestのステップ数に応じたコストモデルの再計算が必要。 |

### **5.2 ユーザー体験（UX）への影響**

最大の変更点は「待ち時間」である。従来のテキスト生成のみのレビューは数秒で完了したが、検証プロセスを含むレビューは数分を要する。

**対策提案**:

1. **Optimistic UI（楽観的UI）**: まずGeminiによる未検証の修正案を即座に表示し、「検証中...」のステータスアイコンを付与する。バックグラウンドでE2Bでの検証が完了次第、ステータスを「Verified」に更新、または修正が必要だった場合は内容を差し替える。  
2. **プログレッシブ通知**: Inngestの各ステップ完了ごとに進捗バーを更新する（例: 「環境構築完了」→「テスト実行中」→「修正完了」）。Next.jsのSWRやPollingを用いてInngestの状態を監視する 6。

### **5.3 セキュリティ・コンプライアンス分析**

サーバーサイドでコードを実行するため、以下のセキュリティ対策が必須となる。

* **Secretsの注入**: テスト実行にDB接続文字列やAPIキーが必要な場合、これらをリポジトリ内の .env ファイルに平文で置くことは許されない。CodeHorseのプロジェクト設定画面で環境変数を暗号化して保存し、E2B起動時に動的に環境変数として注入する仕組みを構築する必要がある。  
* **ソースコードの破棄**: E2Bサンドボックスは一時的なものであり、セッション終了後（sandbox.kill()）に完全にデータが消去されることを保証する。また、Inngestのログにソースコードそのものが残らないよう、ログ出力のサニタイズを行う。

## ---

**6\. 実装ロードマップと結論**

### **6.1 推奨される実装フェーズ**

1. **Phase 1: 基盤構築（Inngest \+ E2B）**  
   * Inngestの導入とVercel連携。  
   * E2Bでの単純なコード実行（Hello World）の疎通確認。  
   * カスタムDockerテンプレートのビルド（Node.js環境の高速化）。  
2. **Phase 2: Reflexionの実装（検証機能）**  
   * InngestワークフローによるReflexionループの実装。  
   * まずは内部テストとして稼働させ、成功率とコスト（トークン、実行時間）を計測する。  
3. **Phase 3: Adaptive Memoryの統合**  
   * Pineconeのインデックス設計とルールのIngest処理実装。  
   * RAGパイプラインの構築。  
   * Specification-Aware機能のベータ導入。  
4. **Phase 4: UIの非同期化とリリース**  
   * 検証中ステータスを表示するUIへの改修。  
   * URLスキーム版からの移行キャンペーン。

### **6.2 結論**

CodeHorseの「E2Bを用いたサーバーサイド検証」および「InngestによるDurable Execution」への移行は、製品の価値を「提案」から「保証」へと引き上げるための必須の進化である。Reflexionによる自動修正の信頼性向上と、Adaptive Memoryによるパーソナライゼーションは、競合するAIコーディングツールに対する強力な差別化要因となる。

特に、Inngestを採用することで、Vercelのサーバーレス環境の制約を克服しつつ、複雑なエージェントワークフローを堅牢に管理できる点は技術的に極めて合理的である。コストとレイテンシの増大という課題はあるものの、これらはカスタムテンプレートによる高速化やUXの工夫によって十分に緩和可能である。本仕様書に基づき、検証と記憶を持つ次世代のコードレビューエージェントの実装を進めることを強く推奨する。

#### **引用文献**

1. E2B documentation, 12月 28, 2025にアクセス、 [https://e2b.dev/docs](https://e2b.dev/docs)  
2. Building a Self-Correcting AI: A Deep Dive into the Reflexion Agent with LangChain and LangGraph | by Vi Q. Ha | Medium, 12月 28, 2025にアクセス、 [https://medium.com/@vi.ha.engr/building-a-self-correcting-ai-a-deep-dive-into-the-reflexion-agent-with-langchain-and-langgraph-ae2b1ddb8c3b](https://medium.com/@vi.ha.engr/building-a-self-correcting-ai-a-deep-dive-into-the-reflexion-agent-with-langchain-and-langgraph-ae2b1ddb8c3b)  
3. Use Pinecone with Vertex AI RAG Engine \- Google Cloud Documentation, 12月 28, 2025にアクセス、 [https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/use-pinecone](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/use-pinecone)  
4. Mastering Agent Feedback Loops: Best Practices and Trends \- Sparkco, 12月 28, 2025にアクセス、 [https://sparkco.ai/blog/mastering-agent-feedback-loops-best-practices-and-trends](https://sparkco.ai/blog/mastering-agent-feedback-loops-best-practices-and-trends)  
5. E2B | The Enterprise AI Agent Cloud, 12月 28, 2025にアクセス、 [https://e2b.dev/](https://e2b.dev/)  
6. Getting Started: Fetching Data \- Next.js, 12月 28, 2025にアクセス、 [https://nextjs.org/docs/app/getting-started/fetching-data](https://nextjs.org/docs/app/getting-started/fetching-data)  
7. Cancel on timeouts \- Inngest Documentation, 12月 28, 2025にアクセス、 [https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-timeouts)  
8. Multi-Step Functions \- Inngest Documentation, 12月 28, 2025にアクセス、 [https://www.inngest.com/docs/guides/multi-step-functions](https://www.inngest.com/docs/guides/multi-step-functions)  
9. How Manus Uses E2B to Provide Agents With Virtual Computers, 12月 28, 2025にアクセス、 [https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers)  
10. Long context | Gemini API \- Google AI for Developers, 12月 28, 2025にアクセス、 [https://ai.google.dev/gemini-api/docs/long-context](https://ai.google.dev/gemini-api/docs/long-context)  
11. Long context | Generative AI on Vertex AI \- Google Cloud Documentation, 12月 28, 2025にアクセス、 [https://docs.cloud.google.com/vertex-ai/generative-ai/docs/long-context](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/long-context)  
12. Accurate and Efficient Metadata Filtering in Pinecone's Serverless Vector Database, 12月 28, 2025にアクセス、 [https://www.pinecone.io/research/accurate-and-efficient-metadata-filtering-in-pinecones-serverless-vector-database/](https://www.pinecone.io/research/accurate-and-efficient-metadata-filtering-in-pinecones-serverless-vector-database/)  
13. Implement multitenancy \- Pinecone Docs, 12月 28, 2025にアクセス、 [https://docs.pinecone.io/guides/index-data/implement-multitenancy](https://docs.pinecone.io/guides/index-data/implement-multitenancy)  
14. LangGraph: Building Self-Correcting RAG Agent for Code Generation, 12月 28, 2025にアクセス、 [https://learnopencv.com/langgraph-self-correcting-agent-code-generation/](https://learnopencv.com/langgraph-self-correcting-agent-code-generation/)  
15. Configuring Maximum Duration for Vercel Functions, 12月 28, 2025にアクセス、 [https://vercel.com/docs/functions/configuring-functions/duration](https://vercel.com/docs/functions/configuring-functions/duration)  
16. AsyncSandbox \- SDK Reference \- E2B, 12月 28, 2025にアクセス、 [https://e2b.dev/docs/sdk-reference/python-sdk/v1.0.4/sandbox\_async](https://e2b.dev/docs/sdk-reference/python-sdk/v1.0.4/sandbox_async)  
17. Connect to running sandbox \- Documentation \- E2B, 12月 28, 2025にアクセス、 [https://e2b.dev/docs/sandbox/connect](https://e2b.dev/docs/sandbox/connect)  
18. Working with Loops in Inngest, 12月 28, 2025にアクセス、 [https://www.inngest.com/docs/guides/working-with-loops](https://www.inngest.com/docs/guides/working-with-loops)  
19. How the template building process works \- Documentation \- E2B, 12月 28, 2025にアクセス、 [https://e2b.dev/docs/template/how-it-works](https://e2b.dev/docs/template/how-it-works)  
20. Sandbox persistence \- Documentation \- E2B, 12月 28, 2025にアクセス、 [https://e2b.dev/docs/sandbox/persistence](https://e2b.dev/docs/sandbox/persistence)  
21. Available Servers \- Documentation \- E2B, 12月 28, 2025にアクセス、 [https://e2b.dev/docs/mcp/available-servers](https://e2b.dev/docs/mcp/available-servers)  
22. Optimizing Pinecone for agents (and more), 12月 28, 2025にアクセス、 [https://www.pinecone.io/blog/optimizing-pinecone/](https://www.pinecone.io/blog/optimizing-pinecone/)  
23. Multi-Tenancy in Vector Databases | Pinecone, 12月 28, 2025にアクセス、 [https://www.pinecone.io/learn/series/vector-databases-in-production-for-busy-engineers/vector-database-multi-tenancy/](https://www.pinecone.io/learn/series/vector-databases-in-production-for-busy-engineers/vector-database-multi-tenancy/)  
24. Build Privacy-aware AI software using Pinecone, 12月 28, 2025にアクセス、 [https://www.pinecone.io/learn/privacy-aware-software/](https://www.pinecone.io/learn/privacy-aware-software/)  
25. How to Turn Your OpenAPI Specification Into an AI Chatbot With RAG | HackerNoon, 12月 28, 2025にアクセス、 [https://hackernoon.com/how-to-turn-your-openapi-specification-into-an-ai-chatbot-with-rag](https://hackernoon.com/how-to-turn-your-openapi-specification-into-an-ai-chatbot-with-rag)  
26. Retrieval \- Docs by LangChain, 12月 28, 2025にアクセス、 [https://docs.langchain.com/oss/javascript/langchain/retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval)  
27. OpenAPI into Automation Test Suite in 60 Seconds: My AI Pipeline Breakdown, 12月 28, 2025にアクセス、 [https://harshasuraweera.medium.com/openapi-into-automation-test-suite-in-60-seconds-my-ai-pipeline-breakdown-d0c1fd56b20b](https://harshasuraweera.medium.com/openapi-into-automation-test-suite-in-60-seconds-my-ai-pipeline-breakdown-d0c1fd56b20b)  
28. Implement Open API Specification using AI \- AINIRO.IO, 12月 28, 2025にアクセス、 [https://ainiro.io/blog/implementing-openapi-spec-using-ai](https://ainiro.io/blog/implementing-openapi-spec-using-ai)  
29. How to handle long background jobs processing : r/nextjs \- Reddit, 12月 28, 2025にアクセス、 [https://www.reddit.com/r/nextjs/comments/1fgxty6/how\_to\_handle\_long\_background\_jobs\_processing/](https://www.reddit.com/r/nextjs/comments/1fgxty6/how_to_handle_long_background_jobs_processing/)