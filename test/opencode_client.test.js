import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildOpenCodeArgs, createCliOpenCodeClient, findSessionId, textFromJsonEvent } from "../dist/clients/opencode.js";
import { createNoMcpOpenCodeConfig } from "../dist/config/opencode-config.js";

function makeExecutable(file, body) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

test("extracts text and session ids from OpenCode JSON events", () => {
  assert.equal(findSessionId({ event: { part: { sessionID: "ses_123" } } }), "ses_123");
  assert.equal(textFromJsonEvent({ type: "text", text: "Review body" }), "Review body");
  assert.equal(textFromJsonEvent({ event: { part: { type: "text", text: "Nested text" } } }), "Nested text");
});

test("builds modern OpenCode args with explicit file attachments and session reuse", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-args-"));
  const sessionFile = path.join(dir, "session.txt");
  fs.writeFileSync(sessionFile, "ses_456\n");

  const args = buildOpenCodeArgs(
    {
      workspace: "/repo",
      outputFile: "/tmp/out.log",
      agent: "reviewer",
      sessionFile,
      reuseSession: true,
      files: ["/tmp/context.json", "/tmp/pr.diff"],
      prompt: "Review this",
    },
    { run: true, formatJson: true, file: true, session: true },
  );

  assert.deepEqual(args.slice(0, 7), ["run", "--agent", "reviewer", "--format", "json", "--session", "ses_456"]);
  assert(args.includes("/tmp/context.json"));
  assert(args.includes("/tmp/pr.diff"));
  assert.equal(args.at(-2), "--");
  assert.equal(args.at(-1), "Review this");
});

test("CLI-backed OpenCode client renders JSON text and stores raw JSONL", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-client-"));
  const mockbin = path.join(dir, "mockbin");
  fs.mkdirSync(mockbin);
  makeExecutable(
    path.join(mockbin, "opencode"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" && "\${2:-}" == "--help" ]]; then
  printf '%s\\n' '--format' '--file' '--session'
  exit 0
fi
printf '{"type":"text","sessionID":"ses_789","text":"Rendered review.\\\\n"}\\n'
`,
  );

  const oldPath = process.env.PATH;
  process.env.PATH = `${mockbin}:${oldPath}`;
  try {
    const client = createCliOpenCodeClient();
    const outputFile = path.join(dir, "opencode.log");
    const jsonOutputFile = path.join(dir, "opencode.log.jsonl");
    const sessionFile = path.join(dir, "session.txt");
    const result = await client.run({
      workspace: dir,
      outputFile,
      jsonOutputFile,
      capabilitiesFile: path.join(dir, "capabilities.json"),
      sessionFile,
      agent: "reviewer",
      files: [path.join(dir, "context.json")],
      prompt: "Review this",
    });

    assert.equal(result.text, "Rendered review.\n");
    assert.equal(result.sessionId, "ses_789");
    assert.equal(fs.readFileSync(outputFile, "utf8"), "Rendered review.\n");
    assert.match(fs.readFileSync(jsonOutputFile, "utf8"), /"sessionID":"ses_789"/);
    assert.equal(fs.readFileSync(sessionFile, "utf8").trim(), "ses_789");
  } finally {
    process.env.PATH = oldPath;
  }
});

test("post-process OpenCode config is derived from XDG config home", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-config-"));
  const home = path.join(dir, "home");
  const xdgConfigHome = path.join(dir, "xdg-config");
  const configDir = path.join(xdgConfigHome, "opencode");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "opencode.json"),
    `${JSON.stringify(
      {
        default_agent: "reviewer",
        permission: { bash: "allow" },
        agent: { reviewer: { prompt: "{file:./OLD.md}" } },
        mcp: { context7: { enabled: true } },
      },
      null,
      2,
    )}\n`,
  );

  const oldHome = process.env.HOME;
  const oldXdgConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  process.env.XDG_CONFIG_HOME = xdgConfigHome;
  try {
    const outputConfig = createNoMcpOpenCodeConfig({ runtimeDir: path.join(dir, "runtime") });
    const config = JSON.parse(fs.readFileSync(outputConfig, "utf8"));

    assert.equal(config.default_agent, "reviewer");
    assert.deepEqual(config.permission, { bash: "allow" });
    assert.equal(config.agent.reviewer.prompt, "{file:./AGENTS.md}");
    assert.equal("mcp" in config, false);
  } finally {
    process.env.HOME = oldHome;
    if (oldXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = oldXdgConfigHome;
    }
  }
});
