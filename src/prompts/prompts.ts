import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type PromptName = "review-pass" | "queue-audit" | "synthesis";

const PROMPT_DIR = dirname(fileURLToPath(import.meta.url));

function loadPrompt(name: PromptName): string {
  return readFileSync(join(PROMPT_DIR, `${name}.md`), "utf8");
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/gu, (_match, key: string) => values[key] || "");
}

export function buildReviewPassPrompt(values: { contextFile: string; diffFile: string }): string {
  return interpolate(loadPrompt("review-pass"), values);
}

export function buildQueueAuditPrompt(values: {
  workspace: string;
  queueFile: string;
  validatedFile: string;
  contextFile: string;
  reviewerOutputFile: string;
}): string {
  const queuePromptPath = values.queueFile.startsWith(`${values.workspace}/`)
    ? relative(values.workspace, values.queueFile)
    : values.queueFile;
  return interpolate(loadPrompt("queue-audit"), {
    ...values,
    queuePromptPath,
  });
}

export function buildSynthesisPrompt(values: {
  reviewerOutputFile: string;
  validatedFile: string;
  contextFile: string;
}): string {
  return interpolate(loadPrompt("synthesis"), values);
}
