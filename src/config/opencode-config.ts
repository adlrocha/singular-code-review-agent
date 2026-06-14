import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const NO_MCP_PROMPT = `You are running a Singular Code Review post-processing pass.

Follow the user prompt exactly. Read only the files named in the prompt or attached to the message. Do not investigate the repository for new findings. Do not call gh, review_comments, or any posting tool. Do not edit repository files. Runtime artifact edits under /tmp/.singular-code-review are allowed only when the user prompt explicitly asks for them.
`;

export function createNoMcpOpenCodeConfig(options: {
  runtimeDir: string;
  homeDir?: string;
  configHome?: string;
  sourceConfig?: string;
}): string {
  const homeDir = options.homeDir || process.env.HOME || "/root";
  const configHome = options.configHome || process.env.XDG_CONFIG_HOME || join(homeDir, ".config");
  const sourceConfig = options.sourceConfig || join(configHome, "opencode", "opencode.json");
  const noMcpDir = join(options.runtimeDir, "opencode-no-mcp");
  const outputConfig = join(noMcpDir, "opencode.json");
  const promptFile = join(noMcpDir, "AGENTS.md");

  mkdirSync(noMcpDir, { recursive: true });
  writeFileSync(promptFile, NO_MCP_PROMPT, { mode: 0o600 });

  const config = existsSync(sourceConfig) ? (JSON.parse(readFileSync(sourceConfig, "utf8")) as Record<string, unknown>) : {};
  delete config.mcp;

  const agent = config.agent && typeof config.agent === "object" ? (config.agent as Record<string, unknown>) : {};
  const reviewer = agent.reviewer && typeof agent.reviewer === "object" ? (agent.reviewer as Record<string, unknown>) : null;
  if (reviewer) {
    reviewer.prompt = "{file:./AGENTS.md}";
  }

  mkdirSync(dirname(outputConfig), { recursive: true });
  writeFileSync(outputConfig, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return outputConfig;
}
