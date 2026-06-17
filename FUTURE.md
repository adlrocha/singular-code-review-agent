# Future Work

This file is a decision backlog for the next useful product investments in
Singular Code Review. It is intentionally narrower than a wishlist: each item
should improve review signal, reliability, or operator trust without making the
runner harder to reason about.

## Principles

- Human review requests should override skip heuristics when the request is
  clear and trusted.
- Prefer partial, honest reviews over silent failure or synthetic confidence.
- Keep context integrations opt-in and least-authority.
- More automation must improve review signal, not just coverage.
- Large inputs should be summarized before they reach the model.

## Track 1: Code-Aware Tools

The reviewer currently relies mostly on shell navigation and ordinary file
reads. That works, but it is token-heavy and pushes too much repo-discovery work
onto the model.

Candidate read-only tools:

- `code_outline <file>`: return imports, exports, classes, functions, and rough
  line ranges for one source file.
- `code_search_symbol <name>`: find likely definitions and exports by symbol
  name instead of raw text search.
- `code_references <symbol>`: find callers or import sites for a changed
  symbol.
- `changed_api_surface`: summarize public exports, route handlers, schemas, or
  package entrypoints changed by the PR.
- `test_map <path>`: find tests that likely cover a changed file, package, or
  symbol.
- `dependency_edges <path>`: summarize local dependency edges for a file or
  package so reviewers can reason about blast radius.
- `ownership_context <path>`: summarize nearby `README`, `AGENTS.md`, package
  metadata, and local conventions for the changed area.

Design constraints:

- Tool outputs must be compact structured summaries, not file dumps.
- Tools should be read-only and safe inside PR review sandboxes.
- Tools should expose enough provenance that the reviewer can cite concrete
  files and lines before queuing a finding.
- The runner should preserve these summaries as artifacts when they materially
  influenced the review.

Open questions:

- Should these tools be standalone CLIs next to `review_comments`, or an MCP
  server exposed to OpenCode?
- Should symbol search use TypeScript language services, Oxc parser output, or
  a simpler per-file AST index?
- How much precomputed repo index is acceptable inside a GitHub Actions job?

## Track 2: Large Diff And Large File Handling

The runner ignores some noisy files today, such as lockfile hunks, but it does
not have a full preflight for huge diffs, data files, generated files, or very
large pull requests. A single large CSV or generated artifact can waste tokens,
inflate artifacts, slow the model, or cause the review to fail.

Candidate behavior:

- Add a deterministic diff preflight before OpenCode runs.
- Classify changed files by size, extension, generated/vendor/data/source
  likelihood, binary-ness, and commentability.
- Enforce per-file and total raw diff byte limits.
- Replace oversized hunks with compact summaries: file path, size, line count,
  additions/deletions, detected type, sampled headers, and why the raw hunk was
  omitted.
- Keep commentable line ranges only for files the reviewer can safely inspect.
- Add `summarized_files` and `omitted_files` to reviewer and auditor context.
- Force synthesis to include a plain user-facing caveat when important files
  were summarized or omitted.
- Treat generated/data-only PRs as reviewable at the metadata and integration
  level, but not as line-by-line source reviews.

Possible policy defaults:

- Always omit binary files.
- Summarize large data files such as CSV, TSV, JSONL, snapshots, and fixtures.
- Summarize generated files unless a repo config explicitly opts them in.
- Preserve small lockfile summaries for dependency-risk review, but do not feed
  full lockfile hunks to the model.
- Fail open into an incomplete or limited review only when the diff cannot be
  summarized safely.

Open questions:

- What should the default per-file raw diff limit be?
- What should the total review-context diff budget be?
- Should huge PRs be reviewed in multiple model passes by file group?
- Should repo config be able to mark paths as always-review, summarize-only, or
  ignore?

## Track 3: PR Timeline Historian

Long-running pull requests accumulate commit pushes, top-level comments,
review bodies, inline threads, resolved findings, and follow-up replies. The
reviewer currently receives some of that state, but it still has to reconstruct
the story itself. For PRs with multiple reviews, that wastes tokens and can
make stale discussion look current.

Candidate behavior:

- Trigger a preflight historian phase for long PRs, such as PRs with two or
  more bot reviews, many review threads, or large comment volume.
- Fetch the GitHub timeline in chronological order: commits, commit titles,
  top-level issue comments, review submissions, review comments, thread
  replies, and resolution state when available.
- Produce a compact `pr_history_summary` artifact that explains the evolution
  of the PR: original intent, major pushes, previous review findings, what was
  fixed, what remains unresolved, human instructions, and stale requests that
  have already been answered.
- Preserve stable drill-down handles on each event: commit SHA, review ID,
  comment ID, thread ID, path, line, URL, author, timestamp, and short trimmed
  title/body summaries.
- Store the full structured timeline as a JSON artifact for deterministic code,
  debugging, and optional tool inspection.
- Feed models a CSV-style single-line rendering by default, such as
  `sha-or-id | kind | @author | state/path | short summary`, so timeline
  context stays cheap and scannable.
- Let re-reviews piggyback on previous findings and focus on the new delta,
  unresolved threads, and areas where the PR changed direction.
- Encourage the reviewer to use `gh`, git, and existing review tools to inspect
  full commits, comments, review states, or thread bodies only when the compact
  timeline makes that extra context relevant.
- Keep the raw timeline available as an artifact for troubleshooting, but give
  models only the compact summary unless they explicitly need more.

Design constraints:

- The historian should be read-only and should not decide whether to approve,
  reject, or skip a review.
- The timeline order matters. Summaries should distinguish old requests that
  were already answered from new active instructions.
- The summary should include enough IDs, URLs, timestamps, and commit SHAs to
  make stale-context bugs debuggable.
- Body text should be aggressively capped in model context; the raw artifact
  and GitHub IDs are the escape hatch for deeper inspection.
- The rendered timeline should be time-ordered plain text, not nested JSON.
  Thread/review nesting should be represented by IDs and short fields, with
  detailed structure left in the artifact.
- Very large timelines should be chunked and summarized incrementally rather
  than passed as one prompt.

Open questions:

- Should the historian be deterministic code, an OpenCode agent, or a hybrid
  where deterministic code builds the timeline and a small model compacts it?
- What thresholds should enable it: review count, comment count, changed-file
  count, elapsed PR age, or total timeline bytes?
- Should the historian run before the gate for all eligible PRs, or only after
  the gate decides a full review is needed?
- How much resolved thread history is useful before it becomes noise?

## Track 4: Review Thread Comment Triggers

The example trigger workflow currently listens to `pull_request`,
`issue_comment`, and `workflow_dispatch`. Comments inside pull request review
threads use GitHub's `pull_request_review_comment` event, so a review-thread
reply does not currently wake the bot by itself.

The runner can already notice unresolved bot threads and human replies when it
is triggered by another event. The missing piece is first-class workflow and
guard support for review-thread comments.

Candidate behavior:

- Subscribe the example trigger workflow to `pull_request_review_comment` with
  `types: [created]`.
- Extend `review_guard` so it can authorize a review-comment trigger, verify
  the comment belongs to the requested PR, reject fork PRs, reject bot authors,
  and require trusted author association.
- Extend trigger context so the reviewer can distinguish main PR comments from
  review-thread replies.
- Make thread-triggered runs answer the specific thread first, then decide
  whether a broader review is also requested.
- Keep existing unresolved-thread scanning so a main PR mention can still
  answer pending thread replies.

Open questions:

- Should every trusted reply to a bot-authored review thread trigger the bot, or
  only replies that mention `@singular-code-review`?
- Should thread replies bypass the gate, or should the gate decide between
  direct answer and full re-review?
- How should concurrency behave when multiple threads receive comments at once?

## Related Future Tracks

These are useful, but should probably come after the primary tracks above.

- Repo-level config for ignored paths, summarized paths, MCP/tool opt-ins,
  timeout policy, and model overrides.
- Optional read-only MCP context providers, such as Linear or documentation
  search, with artifacts showing what external context was used.
- Per-phase runtime budgets for gate, review, audit, and synthesis instead of
  one broad timeout.
- Parallel review lanes or subagents for correctness, security, tests, and
  architecture after dedupe and synthesis are strong enough to absorb the extra
  output.
- Eval-driven model and prompt selection for large PRs, tiny PRs, and
  follow-up question runs.
