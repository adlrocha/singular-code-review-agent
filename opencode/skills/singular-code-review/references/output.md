# Output Reference

Use a findings-first report. Keep it concise enough for a PR author to act on, but include enough evidence that a reviewer can verify each issue.

## Review Flags

- `critical` - must fix: exploitable vulnerability, data loss/corruption, complete outage, irreversible migration breakage, or a change that cannot safely land.
- `high` - should fix: likely user-facing bug, broken contract, authz/authn gap, serious regression, unsafe rollout, or major architecture mismatch.
- `low` - worth addressing: meaningful edge case, missing coverage for changed behavior, maintainability trap, performance risk, or pattern mismatch with real downside.
- `question` - needs human clarification: missing intent, unclear product decision, conflicting docs, unverifiable assumption, or a review blocker that is not yet a proven bug.
- `hint` - optional suggestion or hunch: naming, readability, small refactor path, or suspicious shape that is not important enough to block or strongly steer the PR.

## Report Shape

```markdown
## Findings

1. [high] Short finding title - `path/to/file.ts:42`
   Evidence: <diff line plus surrounding code/docs/intent source>
   Impact: <observable consequence>
   Fix: <concrete code change, refactor path, or decision needed>

2. [question] Missing intent for non-obvious behavior - `path/to/file.ts:10`
   Evidence: <PR body/plan/conversation absent or contradicts diff>
   Impact: <why reviewability or contract safety is harmed>
   Ask: <specific answer needed, or document intent / split scope / add acceptance criteria>

## Intent Fit

- Intent source: <conversation | PR body | plan | inferred from commits | missing>
- Summary: <2-3 lines>
- Mismatches: <none or bullets>

## Review Coverage

- Scope: <base/range/PR, files, line count>
- Context read: <AGENTS/docs/plans/nearby code/tests>
- Review lanes: <subagents or sequential lanes>
- Not covered: <generated files, migrations not run, CI unavailable, remote ref unavailable>
- Residual risks: <bullets or none>
- Testing gaps: <bullets or none>

## TLDR

<Plain-language recommendation: what to do next, what to fix first, whether the shape is fine, or whether the work needs a structural rethink. Do not decide for the human.>
```

If there are no findings:

```markdown
## Findings

No findings.

## Review Coverage

- Scope: <...>
- Context read: <...>
- Residual risks: <...>
- Testing gaps: <...>

## TLDR

No review findings. Residual risks are listed above.
```

## Finding Rules

- Findings lead. Do not start with praise or a broad summary.
- Order by flag, then file path. Flag order is `critical`, `high`, `low`, `question`, `hint`.
- Each finding needs a file and line. If the issue is missing docs/intent, cite the most relevant changed file or PR body/plan location.
- Use absolute certainty sparingly. Say what was verified and what remains uncertain.
- Questions are findings when they block review, expose missing intent, or need a product/architecture decision. Use the `question` flag and ask one specific thing.
- Separate residual risks from actionable findings.
- Separate pre-existing issues unless the diff makes them newly reachable.

## TLDR Guidance

- Use `TLDR`. The reviewer recommends; humans decide.
- Keep it to one short paragraph or 2-4 bullets.
- Name the next move: fix specific items, split the PR, add intent/tests, rethink the structure, or proceed with residual risks.
- If findings are mostly questions or hints, say whether the next step is clarification or optional cleanup.
- If there are no findings, say no findings and mention any residual risk or missing validation.
