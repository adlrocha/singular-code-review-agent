# Singular Review Lens

Use this as the default taste model when local project guidance is absent or ambiguous. Local `AGENTS.md`, README files, ADRs, package conventions, user instructions, and loaded architecture skills win.

When available, load `backend-architecture` before reviewing backend TypeScript/Node.js changes, and `frontend-architecture` before reviewing frontend TypeScript changes. This file is the compact fallback and cross-cutting taste guide; the architecture skills are the stronger domain-specific source.

## General Taste

- Context first: read local docs, examples, nearby code, tests, and project conventions before judging.
- Prefer existing architecture, imports, naming, helpers, file layout, and test style.
- Keep implementation simple and local until reuse is real.
- Prefer readable explicit code over clever generic machinery.
- Add abstractions only when they own a clear responsibility, remove real complexity, or match an established pattern.
- Classes are welcome when they model ownership of behavior, state, lifecycle, or dependency injection.
- Prefer dependency injection over hidden global construction for providers, clients, databases, mailers, SDKs, and runtime dependencies.
- Avoid utility bags, barrels, one-line helper files, and generic `Manager`/`Handler`/`Processor` names unless the repo already uses them deliberately.
- Do not invent future state. If behavior is not implemented yet, leave a clear TODO instead of speculative fields, branches, or config.
- Comments and docblocks should explain intent, invariants, security, sequencing, framework quirks, temporary workarounds, or abstraction contracts. They should not restate obvious code.
- Tests should assert behavior and contracts, not TypeScript mechanics.

## Backend Lens

Use for TypeScript/Node.js APIs, services, repositories, workers, SDKs, middleware, config DSLs, and database code.

Check for:

- Routes/controllers stay transport-focused: parse input, call application services, map responses.
- Services own workflow, authorization-sensitive sequencing, transactions, orchestration, and business decisions.
- Repositories own persistence details, query shape, transaction boundaries, and persistence mapping.
- External systems are wrapped in app-owned adapters; SDK clients should not leak through business code.
- Auth, tenancy, and permission checks live at the correct boundary and cannot be bypassed by alternate callers.
- Error handling separates expected domain outcomes from unexpected infrastructure failures.
- Generated contracts, schemas, validators, API docs, and tests stay in sync.
- Data migrations/backfills have rollback/verification thinking when the risk warrants it.
- New abstractions reduce call-site complexity instead of spreading indirection.

Common backend findings:

- Feature logic placed in a generic/shared layer.
- Repository calls that bypass existing service-level guards.
- Public contract changes without compatibility, versioning, or test updates.
- Swallowed errors, broad catches, missing retries/timeouts, or misleading success responses.
- Ad-hoc data shapes crossing boundaries instead of typed contracts.
- N+1 queries or unbounded reads in paths likely to grow.

## Frontend Lens

Use for React, Astro, Next.js, shared UI packages, query hooks, client stores, forms, routing, analytics, and frontend tests.

Check for:

- Pages/routes own product behavior; shared UI components stay generic and reusable.
- Controller/presentational boundaries are clear when components become stateful or workflow-heavy.
- Server state lives in query/cache mechanisms; client stores are for durable client-only state, not duplicated server data.
- Forms use canonical schemas/contracts and submit through established data paths.
- Query keys, cache invalidation, optimistic updates, and loading/error states match nearby patterns.
- Accessibility is not regressed: labels, keyboard flow, focus, disabled states, semantic controls, ARIA only where appropriate.
- Styling uses the local design system/tokens and does not create one-off visual language.
- Component extraction reduces responsibility and scan cost rather than creating prop-heavy indirection.

Common frontend findings:

- Business logic hidden inside shared UI primitives.
- Components with too many responsibilities after a feature addition.
- Duplicated server state in a store.
- Bespoke form validation bypassing canonical schemas.
- New one-off controls that should use existing primitives.
- Missing empty/error/loading states for a changed user flow.
- Accessibility regressions in interactive elements.

## Maintainability And Elegance

Look for "code judo": a restructuring that preserves behavior while deleting concepts, branches, flags, or helper layers.

Flag when the PR:

- Adds special-case branches into already busy flows.
- Spreads feature checks across shared code.
- Introduces thin wrappers that do not simplify anything.
- Adds casts, `any`, excessive optionality, or silent fallbacks instead of clarifying the boundary.
- Crosses a large-file threshold without a strong reason, especially moving a file over 1000 lines.
- Centralizes code in a way that increases coupling or hides ownership.
- Duplicates an existing canonical helper, hook, service, policy, schema, or adapter.
- Moves complexity around without reducing the number of concepts a reader must hold.

Good refactor feedback names the smaller shape:

- What can be deleted or collapsed.
- Which owner should absorb the behavior.
- Which existing pattern to reuse.
- Which tests prove behavior is preserved.
- Whether it is a blocker for this PR or a follow-up.

## Naming Review

Names should describe domain responsibility, not implementation vagueness.

Push back on:

- `Manager`, `Handler`, `Processor`, `Util`, `Helper`, `Common`, `Data`, `Info`, `Thing`, unless the repo has a clear local convention.
- Names that hide business meaning behind technical plumbing.
- Generic names for domain-specific behavior.
- New terminology that conflicts with docs, issues, plans, or existing models.

Suggest names from the surrounding code, domain docs, and existing tests.
