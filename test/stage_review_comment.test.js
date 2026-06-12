const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "bin", "stage_review_comment");
const { stageReviewComment } = require(script);

function tempStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-review-"));
  return path.join(dir, "review_staged.json");
}

async function runStage(args, stateFile) {
  await stageReviewComment(args, { stateFile });
}

test("stages a single review comment", async () => {
  const stateFile = tempStateFile();

  await runStage(["src/app.js", "12", "This can throw when config is missing."], stateFile);

  const queue = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.deepEqual(queue.inlineComments, [
    {
      kind: "comment",
      path: "src/app.js",
      line: 12,
      side: "RIGHT",
      body: "This can throw when config is missing."
    }
  ]);
});

test("appends multiple comments without replacing existing state", async () => {
  const stateFile = tempStateFile();

  await runStage(["src/app.js", "12", "First issue"], stateFile);
  await runStage(["src/worker.js", "7", "Second issue"], stateFile);

  const comments = JSON.parse(fs.readFileSync(stateFile, "utf8")).inlineComments;
  assert.equal(comments.length, 2);
  assert.equal(comments[0].body, "First issue");
  assert.equal(comments[1].body, "Second issue");
});

test("rejects invalid line numbers", async () => {
  const stateFile = tempStateFile();

  await assert.rejects(
    () => runStage(["src/app.js", "0", "Invalid"], stateFile),
    /line must be a positive integer/
  );
  assert.equal(fs.existsSync(stateFile), false);
});

test("fails loudly when queue state is corrupt", async () => {
  const stateFile = tempStateFile();
  fs.writeFileSync(stateFile, "{not-json");

  await assert.rejects(
    () => runStage(["src/app.js", "4", "Recovered"], stateFile),
    /Expected property name/
  );
});
