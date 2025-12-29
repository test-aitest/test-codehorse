import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/github/verify-webhook";
import { inngest } from "@/inngest/client";
import { trackError } from "@/lib/errors";
import type {
  GitHubEvent,
  PullRequestPayload,
  InstallationPayload,
  IssueCommentPayload,
  PullRequestReviewCommentPayload,
} from "@/lib/github/types";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // ヘッダーを取得
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event") as GitHubEvent | null;
  const deliveryId = request.headers.get("x-github-delivery");

  // ペイロードを取得
  const payload = await request.text();

  // 署名検証
  if (WEBHOOK_SECRET) {
    const isValid = await verifyWebhookSignature(
      payload,
      signature,
      WEBHOOK_SECRET
    );
    if (!isValid) {
      console.error("[Webhook] Invalid signature", { deliveryId, event });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "[Webhook] GITHUB_WEBHOOK_SECRET is not set, skipping signature verification"
    );
  }

  // ペイロードをパース
  let data;
  try {
    data = JSON.parse(payload);
  } catch (error) {
    console.error("[Webhook] Failed to parse payload", { deliveryId, error });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Webhook] Received", {
    event,
    action: data.action,
    deliveryId,
    repository: data.repository?.full_name,
    installationId: data.installation?.id,
  });

  // イベントハンドリング
  try {
    switch (event) {
      case "ping":
        // GitHub Appのテスト用ping
        console.log("[Webhook] Ping received", { zen: data.zen });
        break;

      case "pull_request":
        await handlePullRequest(data as PullRequestPayload);
        break;

      case "issue_comment":
        await handleIssueComment(data as IssueCommentPayload);
        break;

      case "pull_request_review_comment":
        await handlePullRequestReviewComment(
          data as PullRequestReviewCommentPayload
        );
        break;

      case "installation":
        await handleInstallation(data as InstallationPayload);
        break;

      case "installation_repositories":
        await handleInstallationRepositories(data);
        break;

      default:
        console.log("[Webhook] Unhandled event", { event });
    }
  } catch (error) {
    // エラーを追跡・記録（開発者フレンドリーなメッセージを生成）
    await trackError(error, {
      context: {
        operation: "webhook",
        event,
        deliveryId,
        repository: data.repository?.full_name,
      },
      logToConsole: true,
    });
    // エラーでも200を返す（GitHubがリトライしないように）
  }

  const duration = Date.now() - startTime;
  console.log("[Webhook] Completed", { event, deliveryId, duration });

  // 即座に200を返す（GitHubタイムアウト回避）
  return NextResponse.json({ received: true });
}

// =====================================================
// Event Handlers
// =====================================================

async function handlePullRequest(payload: PullRequestPayload) {
  const { action, pull_request, repository, installation } = payload;

  if (!repository || !installation) {
    console.warn("[Webhook] Missing repository or installation");
    return;
  }

  const isDraft = pull_request.draft ?? false;

  console.log("[Webhook] Pull Request", {
    action,
    pr: pull_request.number,
    repo: repository.full_name,
    headSha: pull_request.head.sha,
    isDraft,
  });

  switch (action) {
    case "opened":
      // 新しいPRが開かれた → Inngestにレビューイベントを送信
      await inngest.send({
        name: "github/pull_request.opened",
        data: {
          installationId: installation.id,
          repositoryId: repository.id,
          owner: repository.owner.login,
          repo: repository.name,
          prNumber: pull_request.number,
          headSha: pull_request.head.sha,
          baseSha: pull_request.base.sha,
          title: pull_request.title,
          author: pull_request.user.login,
          isDraft, // Phase 7: ドラフト状態を追加
        },
      });
      console.log("[Webhook] Sent PR opened event to Inngest", { isDraft });
      break;

    case "synchronize":
      // PRに新しいコミットが追加された → Inngestに増分レビューイベントを送信
      await inngest.send({
        name: "github/pull_request.synchronize",
        data: {
          installationId: installation.id,
          repositoryId: repository.id,
          owner: repository.owner.login,
          repo: repository.name,
          prNumber: pull_request.number,
          beforeSha: payload.before || pull_request.base.sha,
          afterSha: payload.after || pull_request.head.sha,
          isDraft, // Phase 7: ドラフト状態を追加
        },
      });
      console.log("[Webhook] Sent PR synchronize event to Inngest", { isDraft });
      break;

    case "ready_for_review":
      // Phase 7: ドラフトから準備完了に変更 → フルレビューを実行
      await inngest.send({
        name: "github/pull_request.ready_for_review",
        data: {
          installationId: installation.id,
          repositoryId: repository.id,
          owner: repository.owner.login,
          repo: repository.name,
          prNumber: pull_request.number,
          headSha: pull_request.head.sha,
          baseSha: pull_request.base.sha,
          title: pull_request.title,
          author: pull_request.user.login,
        },
      });
      console.log("[Webhook] Sent PR ready_for_review event to Inngest");
      break;

    case "converted_to_draft":
      // Phase 7: 準備完了からドラフトに変更
      await inngest.send({
        name: "github/pull_request.converted_to_draft",
        data: {
          installationId: installation.id,
          repositoryId: repository.id,
          owner: repository.owner.login,
          repo: repository.name,
          prNumber: pull_request.number,
          headSha: pull_request.head.sha,
        },
      });
      console.log("[Webhook] Sent PR converted_to_draft event to Inngest");
      break;

    case "closed":
    case "reopened":
      console.log("[Webhook] PR state changed", { action });
      break;

    default:
      console.log("[Webhook] Unhandled PR action", { action });
  }
}

async function handleIssueComment(payload: IssueCommentPayload) {
  const { action, issue, comment, repository, installation } = payload;

  // PRへのコメントかどうかチェック
  if (!issue.pull_request) {
    console.log("[Webhook] Issue comment (not PR), skipping");
    return;
  }

  if (action !== "created") {
    console.log("[Webhook] Comment not created, skipping", { action });
    return;
  }

  if (!repository || !installation) {
    console.warn("[Webhook] Missing repository or installation");
    return;
  }

  console.log("[Webhook] PR Comment", {
    pr: issue.number,
    repo: repository.full_name,
    author: comment.user.login,
    body: comment.body.substring(0, 100),
  });

  // チャットボット応答をトリガー
  await inngest.send({
    name: "github/comment.created",
    data: {
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      prNumber: issue.number,
      commentId: comment.id,
      commentBody: comment.body,
      commentAuthor: comment.user.login,
    },
  });
  console.log("[Webhook] Sent comment event to Inngest for chatbot response");
}

async function handlePullRequestReviewComment(
  payload: PullRequestReviewCommentPayload
) {
  const { action, pull_request, comment, repository, installation } = payload;

  if (action !== "created") {
    console.log("[Webhook] Review comment not created, skipping", { action });
    return;
  }

  if (!repository || !installation) {
    console.warn("[Webhook] Missing repository or installation");
    return;
  }

  console.log("[Webhook] PR Review Comment", {
    pr: pull_request.number,
    repo: repository.full_name,
    author: comment.user.login,
    path: comment.path,
    inReplyTo: comment.in_reply_to_id,
  });

  // チャットボット応答をトリガー（レビューコメントへの返信）
  await inngest.send({
    name: "github/comment.created",
    data: {
      installationId: installation.id,
      owner: repository.owner.login,
      repo: repository.name,
      prNumber: pull_request.number,
      commentId: comment.id,
      commentBody: comment.body,
      commentAuthor: comment.user.login,
      inReplyToId: comment.in_reply_to_id,
    },
  });
  console.log("[Webhook] Sent review comment event to Inngest for chatbot response");
}

async function handleInstallation(payload: InstallationPayload) {
  const { action, installation, repositories } = payload;

  console.log("[Webhook] Installation", {
    action,
    installationId: installation?.id,
    account: installation?.account.login,
    repositoryCount: repositories?.length,
  });

  switch (action) {
    case "created":
      // GitHub Appがインストールされた → リポジトリのインデキシングをトリガー
      if (installation && repositories && repositories.length > 0) {
        for (const repo of repositories) {
          await inngest.send({
            name: "github/repository.index",
            data: {
              installationId: installation.id,
              owner: installation.account.login,
              repo: repo.name,
              fullName: repo.full_name,
            },
          });
        }
        console.log(`[Webhook] Sent index events for ${repositories.length} repositories`);
      }
      break;

    case "deleted":
      // GitHub Appがアンインストールされた → データを削除
      console.log("[Webhook] App uninstalled - will clean up data");
      break;

    case "suspend":
    case "unsuspend":
      console.log("[Webhook] App suspend status changed", { action });
      break;
  }
}

async function handleInstallationRepositories(payload: {
  action: string;
  repositories_added?: Array<{ id: number; full_name: string }>;
  repositories_removed?: Array<{ id: number; full_name: string }>;
  installation?: { id: number };
}) {
  const { action, repositories_added, repositories_removed, installation } =
    payload;

  console.log("[Webhook] Installation repositories changed", {
    action,
    added: repositories_added?.length,
    removed: repositories_removed?.length,
    installationId: installation?.id,
  });

  // installationが必須
  if (!installation) {
    console.warn("[Webhook] No installation in payload, skipping");
    return;
  }

  // 追加されたリポジトリをインデキシング
  if (repositories_added && repositories_added.length > 0) {
    for (const repo of repositories_added) {
      await inngest.send({
        name: "github/repository.index",
        data: {
          installationId: installation.id,
          owner: repo.full_name.split("/")[0],
          repo: repo.full_name.split("/")[1],
          fullName: repo.full_name,
        },
      });
    }
    console.log(`[Webhook] Sent index events for ${repositories_added.length} added repositories`);
  }

  // 削除されたリポジトリのインデックスを削除
  if (repositories_removed && repositories_removed.length > 0) {
    for (const repo of repositories_removed) {
      await inngest.send({
        name: "github/repository.delete-index",
        data: {
          installationId: installation.id,
          owner: repo.full_name.split("/")[0],
          repo: repo.full_name.split("/")[1],
          fullName: repo.full_name,
        },
      });
    }
    console.log(`[Webhook] Sent delete-index events for ${repositories_removed.length} removed repositories`);
  }
}
