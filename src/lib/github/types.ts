// GitHub Webhook Event Types

export interface WebhookPayload {
  action?: string;
  installation?: {
    id: number;
    account: {
      login: string;
      id: number;
    };
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    owner: {
      login: string;
      id: number;
    };
    default_branch: string;
    language: string | null;
    description: string | null;
  };
  sender?: {
    login: string;
    id: number;
  };
}

export interface PullRequestPayload extends WebhookPayload {
  action: "opened" | "synchronize" | "closed" | "reopened" | "edited" | "ready_for_review" | "converted_to_draft";
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    state: string;
    /** ドラフトPRかどうか (Phase 7) */
    draft?: boolean;
    user: {
      login: string;
      id: number;
    };
    head: {
      sha: string;
      ref: string;
    };
    base: {
      sha: string;
      ref: string;
    };
    html_url: string;
    additions: number;
    deletions: number;
    changed_files: number;
  };
  before?: string; // synchronize イベントで使用
  after?: string;  // synchronize イベントで使用
}

export interface IssueCommentPayload extends WebhookPayload {
  action: "created" | "edited" | "deleted";
  issue: {
    number: number;
    title: string;
    pull_request?: {
      url: string;
    };
  };
  comment: {
    id: number;
    user: {
      login: string;
      id: number;
    };
    body: string;
    created_at: string;
  };
}

export interface PullRequestReviewCommentPayload extends WebhookPayload {
  action: "created" | "edited" | "deleted";
  pull_request: {
    number: number;
    title: string;
  };
  comment: {
    id: number;
    user: {
      login: string;
      id: number;
    };
    body: string;
    path: string;
    line: number | null;
    in_reply_to_id?: number;
    created_at: string;
  };
}

export interface InstallationPayload extends WebhookPayload {
  action: "created" | "deleted" | "suspend" | "unsuspend";
  repositories?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

export interface InstallationRepositoriesPayload extends WebhookPayload {
  action: "added" | "removed";
  repositories_added?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
  repositories_removed?: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
  }>;
}

// GitHub Event Types
export type GitHubEvent =
  | "pull_request"
  | "issue_comment"
  | "pull_request_review_comment"
  | "installation"
  | "installation_repositories"
  | "push"
  | "ping";
