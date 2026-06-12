#!/usr/bin/env bash
set -euo pipefail

base_ref="${1:-}"

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

tmp_files=()

new_tmp_file() {
  local file
  file="$(mktemp)"
  tmp_files+=("$file")
  printf '%s\n' "$file"
}

cleanup() {
  if [ "${#tmp_files[@]}" -gt 0 ]; then
    rm -f "${tmp_files[@]}"
  fi
}

trap cleanup EXIT

section() {
  printf '\n## %s\n' "$1"
}

section "Repository"
printf 'root: %s\n' "$root"
printf 'branch: %s\n' "$(git branch --show-current 2>/dev/null || true)"
git status --short --branch

section "Recent commits"
git log --format='%h %s' -n 20

scope="none"
base=""
diff_args=()
current_branch="$(git branch --show-current 2>/dev/null || true)"

set_branch_scope_from_ref() {
  local ref="$1"
  local label="$2"

  if [ -z "$ref" ]; then
    return 1
  fi

  if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
    return 1
  fi

  local inferred_base
  if ! inferred_base="$(git merge-base HEAD "$ref" 2>/dev/null)"; then
    return 1
  fi

  if git diff --quiet "$inferred_base"; then
    return 1
  fi

  base="$inferred_base"
  scope="$label"
  diff_args=("$base")
  return 0
}

if [ -n "$base_ref" ]; then
  if base="$(git merge-base HEAD "$base_ref" 2>/dev/null)"; then
    scope="base-ref merge-base"
  else
    base="$base_ref"
    scope="base-ref direct"
  fi
  diff_args=("$base")
elif ! git diff --cached --quiet; then
  scope="staged"
  diff_args=(--cached)
elif ! git diff --quiet; then
  scope="unstaged"
  diff_args=()
else
  pr_base=""
  if command -v gh >/dev/null 2>&1; then
    pr_base="$(gh pr view --json baseRefName --jq '.baseRefName' 2>/dev/null || true)"
  fi

  if [ -n "$pr_base" ]; then
    set_branch_scope_from_ref "origin/$pr_base" "current branch vs PR base origin/$pr_base" || true
  fi

  if [ "$scope" = "none" ]; then
    origin_head="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
    default_branch="${origin_head#origin/}"
    if [ -n "$origin_head" ] && [ "$current_branch" != "$default_branch" ]; then
      set_branch_scope_from_ref "$origin_head" "current branch vs default base $origin_head" || true
    fi
  fi
fi

changed_files_file="$(new_tmp_file)"

section "Scope"
printf 'scope: %s\n' "$scope"
if [ -n "$base" ]; then
  printf 'base: %s\n' "$base"
fi

if [ "$scope" != "none" ]; then
  section "Changed files"
  git diff "${diff_args[@]}" --name-status --find-renames --find-copies
  git diff "${diff_args[@]}" --name-only --find-renames --find-copies > "$changed_files_file"

  section "Diff stat"
  git diff "${diff_args[@]}" --stat

  section "Numstat"
  git diff "${diff_args[@]}" --numstat

  section "Dirstat"
  git diff "${diff_args[@]}" --dirstat=files,10,cumulative

  section "Patch check"
  git diff "${diff_args[@]}" --check || true

  if [ "${REVIEW_CONTEXT_FULL_DIFF:-0}" = "1" ]; then
    section "Full diff"
    git diff "${diff_args[@]}" -U20 --find-renames --find-copies
  else
    section "Full diff"
    echo "Set REVIEW_CONTEXT_FULL_DIFF=1 to include the full diff."
  fi
else
  echo "No staged or unstaged diff detected, and no base ref was provided or inferred."
  echo "Pass an explicit base ref to review committed branch changes when auto-detection is unavailable."
fi

section "Untracked files"
untracked_file="$(new_tmp_file)"
git ls-files --others --exclude-standard > "$untracked_file"
untracked_count="$(wc -l < "$untracked_file" | tr -d ' ')"
if [ "$untracked_count" -le 120 ]; then
  cat "$untracked_file"
else
  sed -n '1,120p' "$untracked_file"
  remaining=$((untracked_count - 120))
  printf '... %s more untracked files omitted\n' "$remaining"
fi

section "Relevant local docs"
docs_file="$(new_tmp_file)"

add_doc_if_exists() {
  local path="$1"
  if [ -f "$path" ]; then
    printf '%s\n' "$path" >> "$docs_file"
  fi
}

add_docs_for_dir() {
  local dir="$1"

  if [ -z "$dir" ] || [ "$dir" = "." ]; then
    dir="."
  fi

  add_doc_if_exists "$dir/AGENTS.md"
  add_doc_if_exists "$dir/CLAUDE.md"
  add_doc_if_exists "$dir/CODEX.md"
  add_doc_if_exists "$dir/CONTEXT.md"
  add_doc_if_exists "$dir/PLAN.md"
  add_doc_if_exists "$dir/TODO.md"
  add_doc_if_exists "$dir/README.md"
  add_doc_if_exists "$dir/README.mdx"
  add_doc_if_exists "$dir/readme.md"
}

add_docs_for_dir "."

if [ -s "$changed_files_file" ]; then
  while IFS= read -r changed_path; do
    [ -n "$changed_path" ] || continue

    changed_dir="$(dirname "$changed_path")"
    [ "$changed_dir" != "." ] || continue

    current="."
    IFS='/' read -r -a path_parts <<< "$changed_dir"
    for path_part in "${path_parts[@]}"; do
      [ -n "$path_part" ] || continue
      [ "$path_part" != "." ] || continue

      current="${current%/}/$path_part"
      add_docs_for_dir "$current"
    done
  done < "$changed_files_file"
fi

if [ -s "$docs_file" ]; then
  sort -u "$docs_file"
else
  echo "No nearby local docs found for the current diff."
fi
