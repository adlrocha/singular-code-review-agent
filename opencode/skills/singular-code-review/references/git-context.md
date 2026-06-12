# Git Context Reference

Use these commands to gather review evidence without mutating the repository. Prefer `rg` for searches and exact path-scoped git commands for focused checks.

## Scope Detection

Start every local review with:

```bash
git status --short --branch
git branch --show-current
git remote -v
git log --format='%h %s' -n 20
```

If a base ref is supplied:

```bash
BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null || printf '%s' "$BASE_REF")
git diff --stat "$BASE"
git diff --name-status --find-renames --find-copies "$BASE"
git diff --numstat "$BASE"
git diff --dirstat=files,10,cumulative "$BASE"
git diff -U20 --find-renames --find-copies "$BASE"
```

If reviewing the current branch without an explicit base:

```bash
gh pr view --json baseRefName,url,title,body 2>/dev/null
BASE=$(git merge-base HEAD origin/main)
git diff --stat "$BASE"
git diff --name-status --find-renames --find-copies "$BASE"
git diff -U20 "$BASE"
```

Verify `origin/main` is the right base before relying on it. If the PR base is different, use that.

The orchestrator may run `git fetch --no-tags origin` before scope detection to update local remote refs. Reviewer subagents must not fetch; pass them already-resolved refs or diff artifacts.

For staged work:

```bash
git diff --cached --stat
git diff --cached --name-status --find-renames --find-copies
git diff --cached -U20
```

For unstaged work:

```bash
git diff --stat
git diff --name-status --find-renames --find-copies
git diff -U20
```

Always inspect untracked files separately:

```bash
git ls-files --others --exclude-standard
```

Untracked files are out of scope unless the user explicitly includes them or they are clearly part of the work being reviewed. Record excluded files in coverage.

## PR And Remote Branch Reviews

For a PR URL or number:

```bash
gh pr view "$PR" --json title,body,baseRefName,headRefName,headRefOid,isCrossRepository,url,files,reviews,comments
gh pr diff "$PR" --color=never
```

Do not check out the PR branch just to review it.

Only use workspace `Read`/`rg` for PR files when the local checkout is aligned with the PR head:

```bash
test "$(git branch --show-current)" = "$HEAD_REF"
test "$(git rev-parse HEAD)" = "$HEAD_OID"
test "$IS_CROSS_REPOSITORY" != "true"
```

If local `HEAD` is ahead of the PR head, the workspace contains extra commits and is not the exact PR under review. Treat it as a local branch review, or inspect the PR through fetched refs / `gh pr diff`.

For remote PR or branch scope, the orchestrator may fetch unique review refs before spawning subagents:

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)-$$
git fetch --no-tags origin "$HEAD_REF:refs/review/code-review-$RUN_ID-head"
git fetch --no-tags origin "$BASE_REF:refs/review/code-review-$RUN_ID-base"
git show "refs/review/code-review-$RUN_ID-head:path/to/file.ts"
git diff "refs/review/code-review-$RUN_ID-base" "refs/review/code-review-$RUN_ID-head" -- path/to/file.ts
```

If fetch fails, rely on `gh pr diff` and PR metadata. Do not silently read stale workspace files. Subagents receive these refs or artifact paths; they do not run fetch themselves.

## Surrounding Code Commands

For changed symbols and nearby patterns:

```bash
rg -n "SymbolName|routeName|queryKey|componentName" .
rg -n "existingHelper|parallelPattern" path/to/package path/to/app
git grep -n "SymbolName"
```

For call sites and contracts:

```bash
rg -n "functionName\\(|className|exportedType" .
rg -n "/api/path|route-name|event-name|config-key" .
```

For history:

```bash
git log --oneline -- path/to/file.ts
git log --follow --oneline -- path/to/file.ts
git blame -L 40,90 -- path/to/file.ts
git show "$BASE:path/to/file.ts"
```

Use history to understand intentional design, not to blame the author.

## Diff Inspection Patterns

Use path-scoped diffs once files are identified:

```bash
git diff -U40 "$BASE" -- path/to/file.ts
git diff --word-diff "$BASE" -- docs/spec.md
git diff --check "$BASE"
```

Use `git diff --check` as a patch hygiene signal. Do not turn whitespace into a human finding unless it indicates the patch will fail or violates explicit repo rules.

For generated files:

```bash
git diff --name-only "$BASE" | rg '(^|/)(generated|__generated__|dist|build|schema|lock)'
```

Review the generator, schema, migration, or source artifact first. Generated output is usually evidence, not the primary review surface.

## Intent Sources

Use these in addition to conversation history:

```bash
git log --oneline "$BASE"..HEAD
git branch --show-current
gh pr view --json title,body,comments,reviews
rg -n "Requirements|Acceptance|PRD|Plan|ADR|Decision|Non-goals" docs specs . 2>/dev/null
```

If a plan path is passed or linked in the PR body, read it. Verify the diff covers the requirements and does not add unrelated scope.
