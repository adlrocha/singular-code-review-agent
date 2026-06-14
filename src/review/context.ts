import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readJsonFile } from "../shared/json.js";
import { type GitHubClient } from "../clients/github.js";
import { parseUnifiedDiff, validCommentRangesFromDiff } from "./diff.js";
import {
  REVIEW_BOT_LOGIN,
  REVIEW_COMMAND,
  type IssueComment,
  type ReviewActionItem,
  type ReviewComment,
  type ReviewContext,
  type ReviewThread,
  type ReviewTrigger,
} from "./types.js";

type BuildReviewContextOptions = {
  github: GitHubClient;
  repository: string;
  prNumber: number;
  diffFile: string;
  eventName?: string | null;
  eventPath?: string | null;
  actor?: string | null;
  botLogin?: string;
};

function readEventPayload(eventPath?: string | null): Record<string, unknown> {
  if (!eventPath || !existsSync(eventPath)) {
    return {};
  }

  return readJsonFile<Record<string, unknown>>(eventPath, {});
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readEventContext(options: {
  eventName?: string | null;
  eventPath?: string | null;
  actor?: string | null;
}): ReviewTrigger {
  const eventName = options.eventName || null;
  const payload = readEventPayload(options.eventPath);
  const comment = asRecord(payload.comment);
  const commentUser = asRecord(comment.user);
  const action = stringValue(payload.action);

  const triggerComment =
    numberValue(comment.id) !== null
      ? {
          id: numberValue(comment.id) as number,
          user: stringValue(commentUser.login),
          body: stringValue(comment.body) || "",
          html_url: stringValue(comment.html_url),
        }
      : null;

  let reason: ReviewTrigger["reason"] = "manual";
  if (eventName === "issue_comment") {
    reason = "mention";
  } else if (eventName === "pull_request" && action === "ready_for_review") {
    reason = "ready_for_review";
  } else if (eventName === "pull_request" && action === "opened") {
    reason = "opened";
  } else if (eventName === "workflow_dispatch") {
    reason = "workflow_dispatch";
  }

  return {
    event_name: eventName,
    reason,
    actor: options.actor || stringValue(asRecord(payload.sender).login),
    trigger_comment: triggerComment,
  };
}

function containsMention(body: unknown, botLogin: string, command: string): boolean {
  const text = String(body || "").toLowerCase();
  const needles = [command, botLogin ? `@${botLogin}` : null].filter(Boolean).map((value) => String(value).toLowerCase());
  return needles.some((needle) => text.includes(needle));
}

export function buildActionItems(options: {
  trigger: ReviewTrigger;
  issueComments: IssueComment[];
  reviewComments: ReviewComment[];
  reviewThreads: ReviewThread[];
  reviewThreadsAvailable: boolean;
  botLogin: string;
  command: string;
}): ReviewActionItem[] {
  const actionItems: ReviewActionItem[] = [];

  if (options.trigger.trigger_comment) {
    actionItems.push({
      id: `issue-comment:${options.trigger.trigger_comment.id}`,
      kind: "trigger_request",
      actor: options.trigger.trigger_comment.user,
      body: options.trigger.trigger_comment.body,
      comment_id: options.trigger.trigger_comment.id,
    });
  }

  for (const comment of options.issueComments || []) {
    if (containsMention(comment.body, options.botLogin, options.command)) {
      actionItems.push({
        id: `issue-comment:${comment.id}`,
        kind: "mentioned",
        actor: comment.user?.login || null,
        body: comment.body || "",
        comment_id: comment.id,
      });
    }
  }

  if (options.botLogin && options.reviewThreadsAvailable) {
    for (const thread of options.reviewThreads || []) {
      if (thread.is_resolved || thread.top_level_author !== options.botLogin || thread.latest_author === options.botLogin) {
        continue;
      }

      if (thread.top_level_comment_id) {
        actionItems.push({
          id: `review-thread:${thread.id}`,
          kind: "reply_requested",
          actor: thread.latest_author,
          body: thread.comments[thread.comments.length - 1]?.body || "",
          reply_to_comment_id: Number(thread.top_level_comment_id),
          latest_reply_id: thread.latest_comment_id,
          review_thread_id: thread.id,
          path: thread.path,
          line: thread.line,
        });
      }
    }
    return actionItems;
  }

  if (!options.botLogin) {
    return actionItems;
  }

  const byParent = new Map<number, ReviewComment[]>();
  for (const comment of options.reviewComments || []) {
    const parentId = comment.in_reply_to_id || comment.id;
    if (!byParent.has(parentId)) {
      byParent.set(parentId, []);
    }
    byParent.get(parentId)?.push(comment);
  }

  for (const [parentId, comments] of byParent.entries()) {
    const topLevel = comments.find((comment) => Number(comment.id) === Number(parentId));
    if (!topLevel || topLevel.user?.login !== options.botLogin) {
      continue;
    }

    const sorted = comments
      .slice()
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    const latest = sorted[sorted.length - 1];
    if (latest?.user?.login && latest.user.login !== options.botLogin) {
      actionItems.push({
        id: `review-comment:${parentId}`,
        kind: "reply_requested",
        actor: latest.user.login,
        body: latest.body || "",
        reply_to_comment_id: Number(parentId),
        latest_reply_id: latest.id,
      });
    }
  }

  return actionItems;
}

export async function buildReviewContext(options: BuildReviewContextOptions): Promise<ReviewContext> {
  const botLogin = options.botLogin || REVIEW_BOT_LOGIN;
  const command = REVIEW_COMMAND;
  const trigger = readEventContext({
    eventName: options.eventName,
    eventPath: options.eventPath,
    actor: options.actor,
  });

  const diffText = await options.github.getPullRequestDiff(options.prNumber);
  mkdirSync(dirname(options.diffFile), { recursive: true });
  writeFileSync(options.diffFile, diffText, { mode: 0o600 });

  const [pr, issueComments, reviewComments, reviews, reviewThreadsResult] = await Promise.all([
    options.github.getPullRequest(options.prNumber),
    options.github.listIssueComments(options.prNumber),
    options.github.listReviewComments(options.prNumber),
    options.github.listReviews(options.prNumber),
    options.github.listReviewThreads(options.prNumber),
  ]);
  const reviewThreads = reviewThreadsResult.threads;
  const unresolvedReviewThreads = reviewThreads.filter((thread) => !thread.is_resolved);
  const unresolvedBotThreads = unresolvedReviewThreads.filter((thread) => thread.top_level_author === botLogin);

  return {
    generated_at: new Date().toISOString(),
    run: {
      ...trigger,
      command,
      bot_login: botLogin,
    },
    pr,
    diff: {
      file: options.diffFile,
      files: parseUnifiedDiff(diffText).files.map((file) => file.path),
    },
    valid_comment_ranges: validCommentRangesFromDiff(diffText),
    issue_comments: issueComments,
    review_comments: reviewComments,
    review_threads_available: reviewThreadsResult.available,
    review_threads: reviewThreads,
    unresolved_review_threads: unresolvedReviewThreads,
    unresolved_bot_threads: unresolvedBotThreads,
    reviews,
    previous_bot_findings: reviewComments.filter((comment) => comment.user?.login === botLogin && !comment.in_reply_to_id),
    action_items: buildActionItems({
      trigger,
      issueComments,
      reviewComments,
      reviewThreads,
      reviewThreadsAvailable: reviewThreadsResult.available,
      botLogin,
      command,
    }),
  };
}
