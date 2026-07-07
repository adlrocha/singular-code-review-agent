#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { createGitHubClient } from "../clients/github.js"
import { runCliMain } from "../lib/cli-main.js"
import { REVIEW_COMMAND } from "../review/types.js"

const SKIP_TITLE_PREFIX = "[skip]"
const SKIP_COMMAND_PATTERN = /^(?:please\s+)?skip(?:\s+(?:this|review|run))?[.!?]?\s*$/u

function output(name: string, value: string, env: NodeJS.ProcessEnv): void {
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`)
  }
}

function allow(env: NodeJS.ProcessEnv): void {
  output("should_review", "true", env)
  output("reason", "allowed", env)
  process.stderr.write("[singular-code-review] review guard allowed request\n")
}

function deny(reason: string, env: NodeJS.ProcessEnv): void {
  output("should_review", "false", env)
  output("reason", reason, env)
  process.stderr.write(`[singular-code-review] review guard skipped request: ${reason}\n`)
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function trustedAssociation(value: string | null | undefined): boolean {
  return value === "OWNER" || value === "MEMBER" || value === "COLLABORATOR"
}

function requestsSkipByTitle(title: unknown): boolean {
  return String(title || "")
    .trimStart()
    .toLowerCase()
    .startsWith(SKIP_TITLE_PREFIX)
}

function requestsSkip(body: unknown, command: string = REVIEW_COMMAND): boolean {
  const lines = String(body || "")
    .toLowerCase()
    .split(/\r?\n/u)

  return lines.some(line => {
    const commandIndex = line.indexOf(command.toLowerCase())
    if (commandIndex < 0) {
      return false
    }

    const commandText = line.slice(commandIndex + command.length).trim()
    return SKIP_COMMAND_PATTERN.test(commandText)
  })
}

function parseIssueUrl(value: string | null | undefined): { repository: string; issueNumber: number } | null {
  if (!value) {
    return null
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const match = url.pathname.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/([0-9]+)\/?$/u)
  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = match[2]
  const issueNumber = match[3]
  if (!owner || !repo || !issueNumber) {
    return null
  }

  return {
    repository: `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`,
    issueNumber: Number(issueNumber)
  }
}

/**
 * Re-checks whether the request is safe to review inside the reusable workflow.
 * Client workflows also gate triggers, but this protects against drift.
 */
export async function evaluateGuard(options: {
  github: Pick<ReturnType<typeof createGitHubClient>, "getPullRequest" | "getIssueComment">
  repository: string
  prNumber: number
  triggerCommentId: number | null
  command?: string
}): Promise<{ shouldReview: boolean; reason: string }> {
  const command = options.command || REVIEW_COMMAND
  let pr
  try {
    pr = await options.github.getPullRequest(options.prNumber)
  } catch {
    return { shouldReview: false, reason: "pull request not found" }
  }

  if (pr.head?.repo?.full_name !== options.repository) {
    // Fork PRs cannot receive repository secrets or App tokens safely in this
    // workflow model.
    return { shouldReview: false, reason: "fork pull requests are not reviewed" }
  }

  if (requestsSkipByTitle(pr.title)) {
    return { shouldReview: false, reason: "pull request title requested skip" }
  }

  if (requestsSkip(pr.body, command)) {
    return { shouldReview: false, reason: "pull request body requested skip" }
  }

  if (options.triggerCommentId) {
    let comment
    try {
      comment = await options.github.getIssueComment(options.triggerCommentId)
    } catch {
      return { shouldReview: false, reason: "trigger comment not found" }
    }

    const issue = parseIssueUrl(comment.issue_url)
    if (issue?.repository !== options.repository || issue.issueNumber !== options.prNumber) {
      // COMMENT_ID is user-controlled workflow input in some paths; bind it
      // back to the PR before trusting the comment body or author.
      return { shouldReview: false, reason: "trigger comment does not belong to this pull request" }
    }

    if (!trustedAssociation(comment.author_association)) {
      return { shouldReview: false, reason: "trigger comment author is not trusted" }
    }

    if (comment.user?.type === "Bot") {
      return { shouldReview: false, reason: "bot trigger comments are ignored" }
    }

    if (!String(comment.body || "").includes(command)) {
      return { shouldReview: false, reason: `trigger comment does not mention ${command}` }
    }

    if (requestsSkip(comment.body, command)) {
      return { shouldReview: false, reason: "trigger comment requested skip" }
    }
  }

  return { shouldReview: true, reason: "allowed" }
}

export async function main(_argv = process.argv.slice(2), env = process.env): Promise<void> {
  const repository = required(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY")
  const prNumber = Number(required(env.PR_NUMBER, "PR_NUMBER"))
  const token = required(env.GH_TOKEN || env.GITHUB_TOKEN, "GH_TOKEN")
  const triggerCommentId = env.TRIGGER_COMMENT_ID ? Number(env.TRIGGER_COMMENT_ID) : null
  const command = env.REVIEW_COMMAND || REVIEW_COMMAND
  const github = createGitHubClient({ token, repository })
  const result = await evaluateGuard({ github, repository, prNumber, triggerCommentId, command })

  if (result.shouldReview) {
    allow(env)
  } else {
    deny(result.reason, env)
  }
}

runCliMain(import.meta.url, "review_guard", () => main())
