import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { type Logger } from "../system/logger.js";

export type OpenCodeCapabilities = {
  run: boolean;
  formatJson: boolean;
  file: boolean;
  session: boolean;
};

export type OpenCodeRunOptions = {
  workspace: string;
  outputFile: string;
  jsonOutputFile?: string;
  capabilitiesFile?: string;
  sessionFile?: string;
  reuseSession?: boolean;
  agent?: string;
  config?: string;
  files?: string[];
  prompt: string;
};

export type OpenCodeRunResult = {
  text: string;
  sessionId: string | null;
  args: string[];
};

export type OpenCodeClient = {
  run(options: OpenCodeRunOptions): Promise<OpenCodeRunResult>;
};

function ensureParentDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function readTextFile(file: string | undefined): string {
  if (!file || !existsSync(file)) {
    return "";
  }
  return readFileSync(file, "utf8").trim();
}

function writeTextFile(file: string, value: string): void {
  ensureParentDir(file);
  writeFileSync(file, `${value}\n`, { mode: 0o600 });
}

export function detectOpenCodeCapabilities(cacheFile?: string): OpenCodeCapabilities {
  if (cacheFile && existsSync(cacheFile)) {
    try {
      return JSON.parse(readFileSync(cacheFile, "utf8")) as OpenCodeCapabilities;
    } catch {
      // Regenerate a corrupt cache.
    }
  }

  const result = spawnSync("opencode", ["run", "--help"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const help = `${result.stdout || ""}\n${result.stderr || ""}`;
  const capabilities = {
    run: result.status === 0,
    formatJson: result.status === 0 && help.includes("--format"),
    file: result.status === 0 && help.includes("--file"),
    session: result.status === 0 && help.includes("--session"),
  };

  if (cacheFile) {
    ensureParentDir(cacheFile);
    writeFileSync(cacheFile, `${JSON.stringify(capabilities, null, 2)}\n`, { mode: 0o600 });
  }

  return capabilities;
}

export function findSessionId(value: unknown, depth = 0): string {
  if (!value || depth > 6 || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of ["sessionID", "sessionId", "session_id"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key];
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSessionId(item, depth + 1);
      if (found) {
        return found;
      }
    }
    return "";
  }

  for (const item of Object.values(record)) {
    const found = findSessionId(item, depth + 1);
    if (found) {
      return found;
    }
  }
  return "";
}

export function textFromJsonEvent(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.text === "string" && record.type === undefined) {
    return record.text;
  }
  for (const key of ["part", "event", "properties"]) {
    if (record[key] && typeof record[key] === "object") {
      const text = textFromJsonEvent(record[key]);
      if (text) {
        return text;
      }
    }
  }
  return "";
}

export function buildOpenCodeArgs(options: OpenCodeRunOptions, capabilities: OpenCodeCapabilities): string[] {
  if (!capabilities.run) {
    throw new Error("opencode run is required");
  }

  const args = ["run"];
  if (options.agent) {
    args.push("--agent", options.agent);
  }
  if (capabilities.formatJson) {
    args.push("--format", "json");
  }

  const sessionId = options.reuseSession && options.sessionFile ? readTextFile(options.sessionFile) : "";
  if (sessionId && capabilities.session) {
    args.push("--session", sessionId);
  }

  if (capabilities.file) {
    for (const file of options.files || []) {
      args.push("--file", file);
    }
  }

  args.push("--", options.prompt);
  return args;
}

export function createCliOpenCodeClient(options: { logger?: Logger } = {}): OpenCodeClient {
  return {
    async run(runOptions) {
      if (!runOptions.workspace) {
        throw new Error("workspace is required");
      }
      if (!runOptions.outputFile) {
        throw new Error("outputFile is required");
      }

      const capabilities = detectOpenCodeCapabilities(runOptions.capabilitiesFile);
      const args = buildOpenCodeArgs(runOptions, capabilities);
      const env = { ...process.env };
      if (runOptions.config) {
        env.OPENCODE_CONFIG = runOptions.config;
      }

      ensureParentDir(runOptions.outputFile);
      if (runOptions.jsonOutputFile) {
        ensureParentDir(runOptions.jsonOutputFile);
      }

      let rendered = "";
      let artifactOutput = "";
      let jsonOutput = "";
      let stdoutBuffer = "";
      let sessionId = "";

      options.logger?.debug("running opencode", { args: args.slice(0, -1), workspace: runOptions.workspace });

      const child = spawn("opencode", args, {
        cwd: runOptions.workspace,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (!capabilities.formatJson) {
          rendered += chunk;
          artifactOutput += chunk;
          process.stdout.write(chunk);
          return;
        }

        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/u);
        stdoutBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          try {
            const event = JSON.parse(line) as unknown;
            jsonOutput += `${line}\n`;
            sessionId ||= findSessionId(event);
            const text = textFromJsonEvent(event);
            if (text) {
              rendered += text;
              artifactOutput += text;
              process.stdout.write(text);
            }
          } catch {
            rendered += `${line}\n`;
            artifactOutput += `${line}\n`;
            process.stdout.write(`${line}\n`);
          }
        }
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        artifactOutput += chunk;
        process.stderr.write(chunk);
      });

      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });

      if (stdoutBuffer.trim()) {
        try {
          const event = JSON.parse(stdoutBuffer) as unknown;
          jsonOutput += `${stdoutBuffer}\n`;
          sessionId ||= findSessionId(event);
          const text = textFromJsonEvent(event);
          if (text) {
            rendered += text;
            artifactOutput += text;
            process.stdout.write(text);
          }
        } catch {
          rendered += `${stdoutBuffer}\n`;
          artifactOutput += `${stdoutBuffer}\n`;
          process.stdout.write(`${stdoutBuffer}\n`);
        }
      }

      writeFileSync(runOptions.outputFile, artifactOutput || rendered, { mode: 0o600 });
      if (runOptions.jsonOutputFile && capabilities.formatJson) {
        writeFileSync(runOptions.jsonOutputFile, jsonOutput, { mode: 0o600 });
      }

      if (sessionId && runOptions.sessionFile) {
        writeTextFile(runOptions.sessionFile, sessionId);
      }

      if (code !== 0) {
        throw new Error(`opencode exited with status ${code}`);
      }

      return { text: rendered, sessionId: sessionId || null, args };
    },
  };
}
