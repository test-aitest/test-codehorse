/**
 * Phase 9: CI Providers Index
 *
 * 各CIプロバイダーのエクスポート
 */

export { GitHubActionsProvider, createGitHubActionsProvider } from "./github-actions";
export { GitLabCIProvider, createGitLabCIProvider } from "./gitlab-ci";
export { CircleCIProvider, createCircleCIProvider } from "./circleci";

import type { CIProviderInterface, CIProviderType } from "../types";
import { GitHubActionsProvider } from "./github-actions";
import { GitLabCIProvider } from "./gitlab-ci";
import { CircleCIProvider } from "./circleci";

/**
 * CIプロバイダーを取得
 */
export function getCIProvider(
  providerType: CIProviderType,
  options?: Record<string, unknown>
): CIProviderInterface {
  switch (providerType) {
    case "GITHUB_ACTIONS":
      return new GitHubActionsProvider();
    case "GITLAB_CI":
      return new GitLabCIProvider(options as { gitlabToken?: string; gitlabUrl?: string });
    case "CIRCLECI":
      return new CircleCIProvider(options as { circleToken?: string });
    default:
      throw new Error(`Unsupported CI provider: ${providerType}`);
  }
}

/**
 * サポートされているプロバイダー一覧
 */
export const SUPPORTED_PROVIDERS: CIProviderType[] = [
  "GITHUB_ACTIONS",
  "GITLAB_CI",
  "CIRCLECI",
];
