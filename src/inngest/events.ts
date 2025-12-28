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
      inReplyToId?: number;
    };
  };

  // ========================================
  // Adaptive Learning Memory Events
  // ========================================

  // ユーザーがレビューコメントにリアクションした
  "feedback/reaction.added": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      commentId: number; // GitHub上のコメントID
      reaction: "thumbs_up" | "thumbs_down" | "confused" | "heart" | "rocket" | "eyes";
      userId: string;
    };
  };

  // ユーザーがGitHubの提案機能を適用した
  "feedback/suggestion.applied": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      reviewCommentId: string; // DBのReviewCommentのID
      commitSha: string;
    };
  };

  // ユーザーが明示的なフィードバックコマンドを送信した
  "feedback/explicit.received": {
    data: {
      installationId: number;
      owner: string;
      repo: string;
      prNumber: number;
      commentBody: string;
      contextCommentId?: number; // 関連するコメントID
      userId: string;
    };
  };

  // フィードバックからルールを抽出
  "learning/rule.extract": {
    data: {
      feedbackId: string;
      installationId: number;
      repositoryId: string;
    };
  };

  // 複数のフィードバックをバッチ処理
  "learning/rules.batch-extract": {
    data: {
      installationId: number;
      feedbackIds: string[];
    };
  };

  // ルールの信頼度を更新
  "learning/rule.update-confidence": {
    data: {
      ruleId: string;
      delta: number; // 正の値で強化、負の値で弱化
    };
  };

  // 低信頼度ルールの定期クリーンアップ
  "learning/rules.cleanup": {
    data: {
      installationId: number;
      minConfidence?: number; // デフォルト 0.3
    };
  };

  // ========================================
  // Specification Document Events
  // ========================================

  // 仕様書のインデックスをリクエスト
  "specs/index.requested": {
    data: {
      repositoryId: string;
      installationId: number;
      specificPaths?: string[]; // 特定のファイルのみをインデックスする場合
    };
  };

  // PRで変更された仕様書の増分インデックス
  "specs/index.incremental": {
    data: {
      repositoryId: string;
      installationId: number;
      changedFiles: string[];
    };
  };

  // 仕様書インデックスを削除
  "specs/index.delete": {
    data: {
      repositoryId: string;
    };
  };
};
