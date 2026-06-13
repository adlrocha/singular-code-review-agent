const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

test("example trigger workflow does not run reviews on every push", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, "examples", "singular-code-review.yml"),
    "utf8"
  );

  assert.match(workflow, /pull_request:\s*\n\s*types: \[opened, ready_for_review\]/);
  assert.doesNotMatch(workflow, /\bsynchronize\b/);
  assert.doesNotMatch(workflow, /\breopened\b/);
  assert.match(workflow, /issue_comment:\s*\n\s*types: \[created\]/);
  assert.match(workflow, /contains\(github\.event\.comment\.body, '@singular-code-review'\)/);
});
