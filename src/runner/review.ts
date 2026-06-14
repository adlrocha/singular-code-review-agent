import { type GitHubClient } from "../clients/github.js";
import { type OpenCodeClient } from "../clients/opencode.js";
import { type RunnerConfig } from "../config/env.js";
import { type ArtifactStore } from "../system/artifacts.js";
import { type Logger } from "../system/logger.js";

export type ReviewRunnerDependencies = {
  config: RunnerConfig;
  artifacts: ArtifactStore;
  github: GitHubClient;
  opencode: OpenCodeClient;
  logger: Logger;
};

export type ReviewRunResult =
  | {
      status: "skipped";
      reason: string;
    }
  | {
      status: "dry-run" | "submitted";
      inlineComments: number;
      replies: number;
      payloadFile: string;
      validatedFile: string;
    };
