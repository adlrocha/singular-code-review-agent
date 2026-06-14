import { readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { buildReviewContext } from "../review/context.js";
import { buildReviewPayload, applyReviewBanner, enforceReviewBodyLimit } from "../review/body.js";
import { clearQueue, loadQueue, persistValidation, setConclusion, validateQueue } from "../review/queue.js";
import { createNoMcpOpenCodeConfig } from "../config/opencode-config.js";
import { buildQueueAuditPrompt, buildReviewPassPrompt, buildSynthesisPrompt } from "../prompts/prompts.js";
import { type ReviewRunResult, type ReviewRunnerDependencies } from "./review.js";

function queueHasReviewActions(queueFile: string): boolean {
  const queue = loadQueue(queueFile);
  return queue.inlineComments.length > 0 || queue.replies.length > 0;
}

function fallbackConclusion(reviewText: string): string {
  const trimmed = reviewText.trim();
  if (trimmed) {
    return `Automated review completed, but the synthesis pass did not produce a body. Posting the reviewer output so the run still leaves a GitHub review:\n\n${trimmed}`;
  }

  return "Automated review completed, but the synthesis pass did not produce a body.";
}

function pathForOpenCode(workspace: string, file: string): string {
  const relativePath = relative(workspace, file);
  if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath;
  }
  return file;
}

export async function runReview(deps: ReviewRunnerDependencies): Promise<ReviewRunResult> {
  const { config, artifacts, github, opencode, logger } = deps;
  const paths = artifacts.paths;

  process.env.REVIEW_QUEUE_FILE = paths.queueFile;
  process.env.REVIEW_CONTEXT_FILE = paths.contextFile;
  process.env.REVIEW_DIFF_FILE = paths.diffFile;
  process.env.OPENCODE_MODEL = config.model;

  logger.info("building review context", { repository: config.repository, pr: config.prNumber });
  const context = await buildReviewContext({
    github,
    repository: config.repository,
    prNumber: config.prNumber,
    diffFile: paths.diffFile,
    eventName: config.eventName,
    eventPath: config.eventPath,
    actor: config.actor,
    botLogin: config.botLogin,
  });
  artifacts.writeJson(paths.contextFile, context);

  if (!readFileSync(paths.diffFile, "utf8").trim()) {
    logger.info("PR diff is empty; skipping review");
    return { status: "skipped", reason: "PR diff is empty" };
  }

  clearQueue(paths.queueFile);
  const reviewContextPath = pathForOpenCode(config.workspace, paths.contextFile);
  const diffPath = pathForOpenCode(config.workspace, paths.diffFile);
  const queuePath = pathForOpenCode(config.workspace, paths.queueFile);
  const validatedPath = pathForOpenCode(config.workspace, paths.validatedFile);
  const reviewOutputPath = pathForOpenCode(config.workspace, paths.reviewOutputFile);

  logger.info("running OpenCode review pass");
  const reviewPass = await opencode.run({
    workspace: config.workspace,
    outputFile: paths.reviewOutputFile,
    jsonOutputFile: `${paths.reviewOutputFile}.jsonl`,
    capabilitiesFile: paths.opencodeCapabilitiesFile,
    sessionFile: paths.reviewSessionFile,
    agent: "reviewer",
    files: [reviewContextPath, diffPath],
    prompt: buildReviewPassPrompt({
      contextFile: reviewContextPath,
      diffFile: diffPath,
    }),
  });

  let validated = validateQueue(loadQueue(paths.queueFile), context);
  artifacts.writeJson(paths.validatedFile, validated);
  persistValidation(paths.queueFile, validated);
  logger.info("finding validation", validated.stats);

  if (queueHasReviewActions(paths.queueFile)) {
    logger.info("running OpenCode queue audit pass");
    const noMcpConfig = createNoMcpOpenCodeConfig({ runtimeDir: paths.runtimeDir });
    await opencode.run({
      workspace: config.workspace,
      outputFile: paths.auditOutputFile,
      jsonOutputFile: `${paths.auditOutputFile}.jsonl`,
      capabilitiesFile: paths.opencodeCapabilitiesFile,
      sessionFile: paths.postprocessSessionFile,
      agent: "reviewer",
      config: noMcpConfig,
      files: [queuePath, validatedPath, reviewContextPath, reviewOutputPath],
      prompt: buildQueueAuditPrompt({
        workspace: config.workspace,
        queueFile: queuePath,
        validatedFile: validatedPath,
        contextFile: reviewContextPath,
        reviewerOutputFile: reviewOutputPath,
      }),
    });

    validated = validateQueue(loadQueue(paths.queueFile), context);
    artifacts.writeJson(paths.validatedFile, validated);
    persistValidation(paths.queueFile, validated);
    logger.info("post-audit validation", validated.stats);
  } else {
    logger.info("review queue is empty; skipping queue audit");
  }

  logger.info("running OpenCode synthesis pass");
  const noMcpConfig = createNoMcpOpenCodeConfig({ runtimeDir: paths.runtimeDir });
  const synthesis = await opencode.run({
    workspace: config.workspace,
    outputFile: paths.synthesisOutputFile,
    jsonOutputFile: `${paths.synthesisOutputFile}.jsonl`,
    capabilitiesFile: paths.opencodeCapabilitiesFile,
    sessionFile: paths.postprocessSessionFile,
    reuseSession: true,
    agent: "reviewer",
    config: noMcpConfig,
    files: [reviewOutputPath, validatedPath, reviewContextPath],
    prompt: buildSynthesisPrompt({
      reviewerOutputFile: reviewOutputPath,
      validatedFile: validatedPath,
      contextFile: reviewContextPath,
    }),
  });

  const synthesized = synthesis.text.trim() || fallbackConclusion(reviewPass.text);
  const finalBody = enforceReviewBodyLimit(applyReviewBanner(synthesized, config.model));
  setConclusion(paths.queueFile, finalBody);

  validated = validateQueue(loadQueue(paths.queueFile), context);
  artifacts.writeJson(paths.validatedFile, validated);
  persistValidation(paths.queueFile, validated);
  logger.info("final review validation", validated.stats);

  const payload = buildReviewPayload(validated);
  artifacts.writeJson(paths.payloadFile, payload);

  if (validated.inlineComments.length > 0 || validated.conclusion) {
    await github.submitReview(config.prNumber, payload);
    logger.info(config.dryRun ? "prepared dry-run review" : "submitted review", {
      inlineComments: validated.inlineComments.length,
    });
  }

  for (const reply of validated.replies) {
    await github.submitReply(config.prNumber, reply.to, reply.body);
  }
  if (validated.replies.length > 0) {
    logger.info(config.dryRun ? "prepared dry-run replies" : "submitted review replies", {
      replies: validated.replies.length,
    });
  }

  return {
    status: config.dryRun ? "dry-run" : "submitted",
    inlineComments: validated.inlineComments.length,
    replies: validated.replies.length,
    payloadFile: paths.payloadFile,
    validatedFile: paths.validatedFile,
  };
}
