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
};
