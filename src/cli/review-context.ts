#!/usr/bin/env node
import { createGitHubClient } from "../clients/github.js";
import { buildArtifactPaths, resolveWorkspace } from "../config/paths.js";
import { buildReviewContext } from "../review/context.js";
import { type ReviewContext } from "../review/types.js";
import { runCliMain } from "../shared/cli-main.js";
import { readJsonFile, writeJsonFile } from "../shared/json.js";

type ParsedArgs = Record<string, string | boolean | undefined>;

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2).replace(/-/gu, "_");
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2), env = process.env): Promise<void> {
  const options = parseArgs(argv);
  const workspace = resolveWorkspace(env);
  const defaults = buildArtifactPaths(env, workspace);
  const output = typeof options.output === "string" ? options.output : defaults.contextFile;

  if (options.refresh) {
    const repository = required((options.repo as string | undefined) || env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
    const prNumber = Number(required((options.pr as string | undefined) || env.PR_NUMBER, "PR_NUMBER"));
    const token = required(env.GH_TOKEN || env.GITHUB_TOKEN, "GH_TOKEN");
    const diffFile = typeof options.diff_file === "string" ? options.diff_file : defaults.diffFile;
    const github = createGitHubClient({ token, repository });
    const context = await buildReviewContext({
      github,
      repository,
      prNumber,
      diffFile,
      eventName: env.GITHUB_EVENT_NAME || null,
      eventPath: env.GITHUB_EVENT_PATH || null,
      actor: env.GITHUB_ACTOR || null,
      botLogin: env.BOT_LOGIN,
    });
    writeJsonFile(output, context);
    printJson(context);
    return;
  }

  printJson(
    readJsonFile<ReviewContext>(output, {
      generated_at: new Date().toISOString(),
      run: {
        event_name: null,
        reason: "manual",
        actor: null,
        trigger_comment: null,
        command: "@singular-code-review",
        bot_login: "singular-code-review[bot]",
      },
      pr: {},
      diff: { file: "", files: [] },
      valid_comment_ranges: {},
      issue_comments: [],
      review_comments: [],
      review_threads_available: false,
      review_threads: [],
      unresolved_review_threads: [],
      unresolved_bot_threads: [],
      reviews: [],
      previous_bot_findings: [],
      action_items: [],
    }),
  );
}

runCliMain(import.meta.url, "review_context", () => main());
