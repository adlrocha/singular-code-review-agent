import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { type ArtifactPaths } from "../system/artifacts.js";

export function resolveWorkspace(env: NodeJS.ProcessEnv): string {
  if (env.WORKSPACE) {
    return resolve(env.WORKSPACE);
  }

  if (env.GITHUB_WORKSPACE) {
    return resolve(env.GITHUB_WORKSPACE);
  }

  if (existsSync("/github/workspace")) {
    return "/github/workspace";
  }

  return process.cwd();
}

export function defaultRuntimeDir(workspace: string): string {
  if (!workspace) {
    return join(tmpdir(), ".singular-code-review", "default");
  }

  const slug = basename(workspace).replace(/[^a-zA-Z0-9._-]+/gu, "-").slice(0, 64) || "workspace";
  const digest = createHash("sha256").update(resolve(workspace)).digest("hex").slice(0, 12);
  return join(tmpdir(), ".singular-code-review", `${slug}-${digest}`);
}

export function buildArtifactPaths(env: NodeJS.ProcessEnv, workspace: string, runtimeDir?: string): ArtifactPaths {
  const resolvedRuntimeDir = runtimeDir || env.SINGULAR_CODE_REVIEW_RUNTIME_DIR || defaultRuntimeDir(workspace);

  return {
    runtimeDir: resolvedRuntimeDir,
    queueFile: env.REVIEW_QUEUE_FILE || join(resolvedRuntimeDir, "review_queue.json"),
    contextFile: env.REVIEW_CONTEXT_FILE || join(resolvedRuntimeDir, "review_context.json"),
    diffFile: env.REVIEW_DIFF_FILE || join(resolvedRuntimeDir, "pr.diff"),
    validatedFile: env.REVIEW_VALIDATED_FILE || join(resolvedRuntimeDir, "review_validated.json"),
    payloadFile: env.REVIEW_PAYLOAD_FILE || join(resolvedRuntimeDir, "review_payload.json"),
    reviewOutputFile: env.OPENCODE_OUTPUT_FILE || join(resolvedRuntimeDir, "opencode_review.log"),
    auditOutputFile: env.OPENCODE_AUDIT_OUTPUT_FILE || join(resolvedRuntimeDir, "opencode_audit.log"),
    synthesisOutputFile: env.OPENCODE_SYNTHESIS_OUTPUT_FILE || join(resolvedRuntimeDir, "opencode_synthesis.log"),
    opencodeCapabilitiesFile: join(resolvedRuntimeDir, "opencode_capabilities.json"),
    reviewSessionFile: join(resolvedRuntimeDir, "opencode_review_session.txt"),
    postprocessSessionFile: join(resolvedRuntimeDir, "opencode_postprocess_session.txt"),
    noMcpConfigFile: join(resolvedRuntimeDir, "opencode-no-mcp", "opencode.json"),
  };
}
