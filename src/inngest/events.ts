// Inngest Event Types

export type Events = {
  // Pull Request Events
  "github/pull_request.opened": {
    data: {
      installationId: number;
      repositoryId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      baseSha: string;
      title: string;
      author: string;
      /** ドラフトPRかどうか (Phase 7) */
      isDraft?: boolean;
    };
  };

  "github/pull_request.synchronize": {
    data: {
      installationId: number;
      repositoryId: number;
      owner: string;
      repo: string;
      prNumber: number;
      beforeSha: string;
      afterSha: string;
      /** ドラフトPRかどうか (Phase 7) */
      isDraft?: boolean;
    };
  };

  // Draft PR Events (Phase 7)
  "github/pull_request.ready_for_review": {
    data: {
      installationId: number;
      repositoryId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      baseSha: string;
      title: string;
      author: string;
      /** ドラフト時の最終コミット */
      draftCommitSha?: string;
    };
  };

  "github/pull_request.converted_to_draft": {
    data: {
      installationId: number;
      repositoryId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
    };
  };

  // Repository Indexing Events
  "repository/index.requested": {
    data: {
      repositoryId: string;
      installationId: number;
      owner: string;
      repo: string;
      branch?: string;
      commitSha?: string;
    };
  };

  "repository/push": {
    data: {
      repositoryId: string;
      installationId: number;
      owner: string;
      repo: string;
      commitSha: string;
      changedFiles?: string[];
    };
  };

  // GitHub App Installation Events
  "github/repository.index": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      fullName: string;
    };
  };

  "github/repository.delete-index": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      fullName: string;
    };
  };

  // Chat Response Events
  "github/comment.created": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      commentId: number;
      commentBody: string;
      commentAuthor: string;
      /** コメント投稿者のGitHub数値ID */
      commentAuthorId: number;
      inReplyToId?: number;
    };
  };

  // Test Generation Events (Phase 4)
  "github/generate-tests": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      reviewId: string;
      /** AIを使用するか（デフォルト: true） */
      useAI?: boolean;
      /** 最大生成関数数 */
      maxFunctions?: number;
    };
  };

  // Documentation Analysis Events (Phase 5)
  "github/analyze-documentation": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      reviewId: string;
      /** AIを使用するか（デフォルト: true） */
      useAI?: boolean;
      /** 言語（日本語/英語） */
      language?: "ja" | "en";
      /** READMEも分析するか */
      analyzeReadme?: boolean;
    };
  };

  // Performance Analysis Events (Phase 8)
  "github/analyze-performance": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      reviewId: string;
      /** 言語（日本語/英語） */
      language?: "ja" | "en";
      /** N+1クエリ検出を有効にするか */
      detectNPlusOne?: boolean;
      /** メモリリーク検出を有効にするか */
      detectMemoryLeaks?: boolean;
      /** React再レンダリング検出を有効にするか */
      detectReactRerenders?: boolean;
      /** 非効率なループ検出を有効にするか */
      detectInefficientLoops?: boolean;
      /** 大きなバンドルインポート検出を有効にするか */
      detectLargeBundleImports?: boolean;
    };
  };

  // CI Failure Analysis Events (Phase 9)
  "github/analyze-ci-failure": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      pullRequestId: string;
      /** Check Run ID */
      checkRunId: number;
      /** CIプロバイダー */
      provider?: "GITHUB_ACTIONS" | "GITLAB_CI" | "CIRCLECI";
      /** 言語（日本語/英語） */
      language?: "ja" | "en";
      /** 類似失敗の検索を有効にするか */
      enableSimilaritySearch?: boolean;
    };
  };

  // CI Check Run Completed Events (Phase 9)
  "github/check_run.completed": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber?: number;
      pullRequestId?: string;
      checkRunId: number;
      checkRunName: string;
      conclusion: string;
      headSha: string;
    };
  };

  // Security Scan Events (Phase 10)
  "github/scan-security": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      headSha: string;
      reviewId: string;
      /** 言語（日本語/英語） */
      language?: "ja" | "en";
      /** SQLインジェクション検出を有効にするか */
      detectSqlInjection?: boolean;
      /** XSS検出を有効にするか */
      detectXss?: boolean;
      /** 機密情報検出を有効にするか */
      detectSecrets?: boolean;
      /** 認証問題検出を有効にするか */
      detectAuthIssues?: boolean;
      /** 最小重要度（これ以上の重要度のみ報告） */
      minSeverity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      /** 最大検出数 */
      maxIssues?: number;
    };
  };

  // Comment Persistence Events (Phase 1)
  "comment/track-resolution": {
    data: {
      repositoryId: string;
      pullRequestId: string;
      /** 解決されたコメントのフィンガープリントID */
      fingerprintId: string;
      /** 解決タイプ */
      resolutionType: "FIXED" | "ACKNOWLEDGED" | "FALSE_POSITIVE" | "WONT_FIX" | "DUPLICATE";
      /** 解決コミットのSHA */
      commitSha?: string;
    };
  };

  "comment/record-occurrence": {
    data: {
      repositoryId: string;
      reviewId: string;
      pullRequestId?: string;
      /** コメントリスト */
      comments: {
        filePath: string;
        lineNumber: number;
        commentBody: string;
        severity?: "CRITICAL" | "IMPORTANT" | "INFO" | "NITPICK";
        category?: string;
        patternType?: string;
      }[];
    };
  };

  "comment/user-action": {
    data: {
      /** 発生ID */
      occurrenceId: string;
      /** アクションタイプ */
      actionType: "ADDRESSED" | "IGNORED" | "ACKNOWLEDGED" | "FEEDBACK";
      /** ユーザーの返信内容 */
      userResponse?: string;
    };
  };

  "comment/cleanup-expired": {
    data: {
      repositoryId: string;
      /** 有効期限（日数） */
      expirationDays?: number;
    };
  };

  // Push Notification Events
  "push/notification.chat-response": {
    data: {
      /** コメント投稿者のGitHubユーザー名 */
      commentAuthor: string;
      /** コメント投稿者のGitHub数値ID */
      commentAuthorId: number;
      /** リポジトリオーナー */
      owner: string;
      /** リポジトリ名 */
      repo: string;
      /** PR番号 */
      prNumber: number;
      /** AI応答のプレビュー（先頭100文字程度） */
      responsePreview: string;
      /** GitHubコメントURL */
      commentUrl: string;
    };
  };
};
