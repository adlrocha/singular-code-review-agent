---
name: frontend-architecture
description: Use when writing, reviewing, or refactoring TypeScript frontend code, including React components, Astro or Next.js apps, shared UI packages, client state, server-state fetching, forms, styling systems, routing, analytics, frontend tests, and frontend architecture decisions.
license: MIT
---

# Frontend Architecture

Use this skill for TypeScript frontend work. It is framework-aware but project-agnostic: apply it to React apps, Astro islands, Next.js pages, shared UI packages, design-system components, typed API clients, form-heavy screens, and browser-facing integration modules by mapping the same responsibilities to the local framework.

## First Move

Before changing code:

- Read repo guidance first: `AGENTS.md`, package READMEs, component docs, local test setup, and nearby code.
- Identify the framework boundary: static page, server-rendered page, React island, client-only component, route handler, shared UI package, or generated client package.
- Inspect existing import aliases, naming, test helpers, query client setup, store helpers, form utilities, analytics conventions, and shared UI primitives.
- Prefer repo conventions when they are clear. Use this skill as the default for new code, ambiguous code, or code that needs architectural cleanup.
- Search before creating a new component, hook, service, store, query key, schema, variant, or helper. Consolidate similar code instead of adding another near-duplicate.
- Find the canonical source of truth for DTOs, schemas, route contracts, generated clients, and design tokens before duplicating any of them.

Default posture: keep UI ergonomic, keep data ownership explicit, and keep shared components free of app-specific behavior.

## Core Principles

- Use TypeScript for frontend code. Prefer strict props, explicit exported return types, and durable domain types over loose objects.
- Build from local primitives first: existing UI components, `cn()` helpers, variant helpers, form wrappers, query helpers, and test utilities.
- Keep components small and focused. Extract when a component has multiple responsibilities, grows past roughly 100 lines, or a pattern appears in two places.
- Prefer composition over prop drilling or prop-heavy APIs. Use `children`, slots, render props, or compound components for renderable regions and actions.
- Avoid drilling props more than one level through components that do not use them. Lift composition to the caller or introduce a focused provider/store.
- Let components read or derive app data, paths, locale, auth/session, and other app context from established providers or framework locals when appropriate instead of threading every value through intermediate components. Props are for the immediate boundary and final presentational components.
- Name things by UI or domain responsibility: `ResourceTable`, `UserMenu`, `createResourceQueryOptions`, `resourceService`, `$activePanel`.
- Avoid vague names like `Manager`, `Helper`, `Util`, or `Wrapper` unless the file is genuinely just framework glue.
- Prefer clear names over abbreviations. Keep functions pure when practical and keep transformation logic separate from rendering and effects.
- Use result types for expected failures when the caller should branch. Let React Query, tRPC, form libraries, and external integration boundaries use their normal error/exception flow when that is what the local stack expects.
- Split controller code from presentational primitives. The controller can know about routes, queries, analytics, and feature-specific callbacks; the primitive should receive data and callbacks.
- For complex interactions, prefer a headless hook plus a small primitive tree over a large component that mixes DOM, state machine, and data fetching.
- Keep generated files clearly marked and avoid hand-editing them unless the repo explicitly expects it.
- Keep abstractions local until reuse is real. Do not add helper files, barrels, or single-purpose indirection unless they clarify ownership or support a real package boundary.
- Avoid "spaghetti DRY": centralization is good only when it simplifies call sites and ownership.
- Do not invent future state. If a future field or behavior is not implemented yet, leave a clear TODO instead of speculative logic.
- Follow repo-local formatting, linting, import ordering, accessibility, and file naming over personal preference.

## App Boundaries

Map responsibilities before writing code.

### Pages, Layouts, And Routes

Pages and route files should own routing concerns:

- Route params, search params, redirects, status codes, and metadata.
- Choosing page-level data dependencies.
- Composing layouts and feature components.
- Passing only the data the child boundary needs.

Keep substantial interaction logic, cache updates, forms, and rendering branches out of route files when possible. Move them into feature components, services, or hooks with clear ownership.

For Astro-style apps, use Astro for document structure, metadata, static content, and top-level layout composition. Use React islands for stateful or interactive parts. Pass small, serializable props from Astro to React; do not dump large server objects into islands.
Astro pages can use `Astro.locals` for request context such as locale, i18n, auth/session, and app-owned path builders. React islands are acceptable for forms and interactive flows; keep server workflows in Astro Actions, route handlers, or controllers instead of creating public APIs solely for internal submissions.

For Next-style apps, keep server-only code in server components, loaders, route handlers, or actions. Keep client components focused on interaction and browser state. Do not let client components import server-only modules by accident.

### Components

Components should own rendering and local interaction:

- Markup, accessibility, layout, and visual state.
- Component-local state like open/closed, draft input, selected tab, hover, focus, and disclosure state.
- Calling provided callbacks or focused hooks.
- Presenting loading, empty, error, disabled, and pending states.

Components should not own durable server-state contracts, cross-feature cache policy, analytics doctrine, or vendor SDK setup unless the component is explicitly the boundary for that concern.

Prefer this split:

- Shared UI components: structure, styling, accessibility, variants, stable DOM contracts.
- Common app components: reusable app shell or cross-feature composition.
- Feature components: domain behavior, query hooks, mutations, route-specific conditions.
- Services/hooks/stores: API calls, query options, cache mutation, shared client state, external browser integrations.

Use wrapper/controller components when a shared component needs app wiring. A controller can fetch data, read context, lazy-load a browser-heavy child, map domain values into UI props, and pass render slots. Keep that app wiring out of the shared component.

Controller + primitive shape:

```tsx
export function ResourcePickerController(): React.JSX.Element {
  const { data = [] } = useQuery(resourceListQueryOptions)
  const create = useCreateResourceMutation()

  return (
    <ResourcePicker
      resources={data}
      onCreate={(name) => create.mutateAsync({ name })}
      renderEmpty={() => <EmptyState title="No resources yet" />}
    />
  )
}

export function ResourcePicker({
  resources,
  onCreate,
  renderEmpty,
}: {
  resources: ResourceSummary[]
  onCreate: (name: string) => Promise<void>
  renderEmpty: () => React.ReactNode
}): React.JSX.Element {
  if (resources.length === 0) return <>{renderEmpty()}</>
  return <ResourceList items={resources} onCreate={onCreate} />
}
```

For searchable selects, command menus, autocomplete, file upload, and editable text:

- Prefer established interaction primitives or headless hooks for keyboard behavior, focus, selection, and ARIA.
- Keep filtering, positioning, and controlled/uncontrolled state in the hook.
- Keep DOM markup and styling in primitives with explicit slots like `Root`, `Input`, `Label`, `List`, and `Item`.
- Support Escape, Enter, arrow keys, focus, disabled state, labels, descriptions, and screen-reader-only text where relevant.
- Keep browser-only measurements and globals behind event handlers or client effects.

## Shared UI Packages

Put code in a shared UI package when it is reused across features or apps, encapsulates a visual or interaction pattern, and has no dependency on app-specific data models, routes, analytics, or API clients.

Keep shared UI package components boring and composable:

- Functional React components. Use `forwardRef` where DOM access or primitive composition needs it.
- Props use `is*` or `has*` for booleans and `on*` for callbacks.
- Keep prop lists small. If a component needs many render-content props, switch to composition.
- Use semantic variants such as `primary`, `secondary`, `danger`, `ghost`, `muted`, `sm`, `md`, and `lg`.
- Export variants only when consumers truly need them. Otherwise export the component.
- Keep keyboard behavior, focus management, labels, ARIA, and disabled states correct.
- Use `asChild` or slot composition when consumers need to provide the rendered element without losing styling.
- Use generated IDs for labels, descriptions, and error regions instead of requiring callers to thread IDs everywhere.

Compound components are a good fit when a reusable layout has named regions:

```tsx
type PanelProps = {
  children: React.ReactNode
  className?: string
}

function PanelRoot({ children, className }: PanelProps): React.JSX.Element {
  return <section className={cn("rounded-md border bg-card", className)}>{children}</section>
}

function PanelActions({ children, className }: PanelProps): React.JSX.Element {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>
}

export const Panel = Object.assign(PanelRoot, { Actions: PanelActions })
```

Do not add one-off props like `buttonLabel`, `actionSlotClassName`, or `isSpecialFeatureMode` to a generic container when a child component would make the caller clearer.

## Data Fetching And Server State

Treat server state as server state. Do not mirror it into client stores unless the store represents a distinct client workflow.

Default patterns:

- Use the repo's server-state library for API data, usually TanStack Query, tRPC's React Query integration, or a repo-owned SWR/nanoquery wrapper.
- Centralize query keys and query options in a service module per domain or feature.
- Keep request functions small and typed. They should call a typed fetcher, generated client, tRPC procedure, or app-owned API adapter.
- Components consume query options or service hooks; they should not construct scattered string keys inline.
- Mutations execute the server request and update or invalidate the cache in a deliberate place.
- Use `mutateAsync` when the next step depends on completion. Use `mutate` for fire-and-forget UI events.

Create a shared API fetcher when many features call REST endpoints directly. It should own credentials, JSON headers, 204 handling, JSON parse fallback, and typed HTTP errors. Feature files should call a typed `createFetcher` or generated client instead of repeating `fetch` mechanics.

Typed query options keep keys, fetchers, and cache policy together:

```ts
import { queryOptions } from "@tanstack/react-query"

export const resourceListQueryKey = ["resources", "list"] as const
export const resourceDetailQueryKey = (id: string) => ["resources", "detail", id] as const

export const resourceListQueryOptions = queryOptions({
  queryKey: resourceListQueryKey,
  queryFn: fetchResources,
  staleTime: 60_000,
})

export const resourceDetailQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: resourceDetailQueryKey(id ?? ""),
    queryFn: () => {
      if (!id) throw new Error("Resource ID is required")
      return fetchResource(id)
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  })
```

For tRPC-style clients, keep the same ownership even if the generated hooks already expose query keys and invalidation helpers. A feature service hook may group related procedures and cache updates, but avoid becoming a hidden business layer with unrelated concerns.

For action-style APIs, service objects can group cache keys, fetcher stores, mutation methods, and small workflow helpers. Keep the shape predictable:

```ts
export const resourceService = {
  keys: {
    list: () => ["resources"],
    detail: (id: string | null) => ["resource", String(id)],
  },
  useList: () => useLiveQuery($resources, []),
  async update(id: string, payload: UpdateResourceInput) {
    const { data, error } = await actions.resource.update({ id, ...payload })
    if (error) throw error
    mutateCache(resourceService.keys.detail(id), data)
    revalidateKeys(resourceService.keys.list())
    return data
  },
}
```

Do not let these services become unrelated grab bags. If a service groups cache operations, API calls, and derived selectors, they should all belong to one user workflow or domain.

Cache updates:

- Prefer invalidation after mutations when the data shape is broad or the update affects multiple views.
- Prefer targeted `setQueryData` for immediate UI correction, detail/list synchronization, and small known updates.
- Use optimistic updates for fast UX on toggles, renames, reorder actions, small edits, and local-feeling controls.
- In optimistic updates, cancel affected queries, capture previous values, update all visible cache entries, roll back on error, and invalidate on settle.
- Keep analytics, toasts, and navigation in mutation callbacks at the UI or feature boundary, not inside low-level fetchers.
- When a mutation affects search, list, detail, derived count, or external-cache views, update or invalidate all visible caches intentionally. Do not rely on one detail cache update to fix every surface.

Expected request failures should surface as typed errors or result shapes that UI can render. Avoid dumping raw JSON or transport errors into visible UI.

Optimistic mutation shape:

```tsx
const renameMutation = useMutation<Resource, Error, string, { previous?: ResourceList }>({
  mutationFn: (name) => updateResourceName({ id, name }),
  onMutate: async (name) => {
    await queryClient.cancelQueries({ queryKey: resourceListQueryKey })
    const previous = queryClient.getQueryData<ResourceList>(resourceListQueryKey)
    queryClient.setQueryData<ResourceList>(resourceListQueryKey, (current) =>
      current ? current.map((item) => (item.id === id ? { ...item, name } : item)) : current,
    )
    return { previous }
  },
  onError: (error, _name, context) => {
    if (context?.previous) queryClient.setQueryData(resourceListQueryKey, context.previous)
    toast.error(error.message)
  },
  onSuccess: (resource) => {
    queryClient.setQueryData(resourceDetailQueryKey(resource.id), resource)
    track("resource:update_name")
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: resourceListQueryKey })
  },
})
```

Set query clients up at the app boundary with a stable instance, usually `useState(() => new QueryClient())`. In tests, use a deterministic query client with retries disabled.

## Client State

Use local React state for component-local concerns. Use a client store only when state is shared across distant components, persists across route changes, coordinates modal/editor panels, or benefits from explicit store actions.

Store guidance:

- Prefix nanostores with `$` when the repo uses that convention.
- Keep store APIs intentional: expose `open`, `close`, `reset`, `select`, `setDraft`, or `mutateCache` rather than raw setters when logic is non-trivial.
- Group related stores in one file when they represent one UI workflow.
- Keep server data in the server-state cache unless the store wrapper is the repo's chosen server-state cache.
- If a fetcher store is created from dynamic inputs during render, memoize it with `useMemo` or keep it in `useRef` before subscribing. New store instances per render can cause resubscribe loops.
- For SSR-sensitive stores, support an initial value and subscribe after mount to avoid hydration mismatches.
- Clear stale errors when successful data arrives.

Stores are good for modal services, editor state, current tab sets, selected IDs, active panels, local draft coordination, and app-level preferences. They are not a place to hide API contracts or duplicate query data by default.

For editor-like state:

- Keep a typed default config and reset to it when the owning route/resource changes.
- Track a `dirty` flag so store listeners do not write back freshly-loaded server state and create loops.
- Debounce background saves for high-frequency edits.
- Guard store side effects with `typeof window !== "undefined"` when they run through module-level listeners.
- Keep derived validation hooks close to the store when they depend on the same suggestions/cache state.

Dirty editor-store shape:

```ts
const $editor = map<EditorState>({
  dirty: false,
  config: structuredClone(DEFAULT_CONFIG),
})

const saveConfig = debounce((config: EditorConfig) => {
  void actions.resourceConfig.update({ config }).then(() => previewStore.invalidate())
}, 100)

$editor.listen((state) => {
  if (typeof window === "undefined") return
  if (!state.dirty) return
  saveConfig(state.config)
})

export const editorService = {
  useState: () => useStore($editor),
  reset: () => $editor.set({ dirty: false, config: structuredClone(DEFAULT_CONFIG) }),
  updateConfig: (config: EditorConfig) => $editor.setKey("config", config),
  markDirty: () => $editor.setKey("dirty", true),
}
```

For persisted UX state, use small named cookies, local storage helpers, or persistent atoms behind service methods like `saveDraft`, `getDraft`, and `clearDraft`. Do not scatter storage keys through components.

## Forms And Contracts

Forms should use the canonical schema or DTO for boundary validation. Do not hand-roll frontend validators that mirror backend rules when a shared schema or generated contract exists. If the schema does not exist, add it at the canonical contract layer first when that is in scope.

Form guidance:

- Use the repo's form library and field components. Keep field accessibility wired through labels, descriptions, errors, and `aria-invalid`.
- One submission flow per form. Put the durable mutation in `onSubmit`.
- Trim and normalize values at submit boundaries, not scattered across inputs.
- If a field is optional in UX, compose the optional/empty-string behavior once and reuse it.
- For autosave on blur, make the flow explicit: blur the field, validate, submit.
- For autosave on change, use the form library's debounce support or a stable debounced callback.
- Disable submit while pending and show minimal loading feedback for important actions.
- Surface field errors near fields in the shape expected by the shared field components.
- For server actions or form posts, use a reusable action handler when the app repeats the same state, cleanup, field-error, general-error, and success-notification flow.
- For server-action stacks, keep server workflows in actions/controllers rather than inventing public API routes only for an internal form.
- In Astro-style apps, React islands are acceptable for forms. Submit through Astro Actions when the surrounding app already uses them.
- In Astro Actions, prefer one umbrella `try`/`catch` when the catch behavior is the same. Preserve explicit action errors, and convert unexpected errors through the app's shared `getErrorMessage`-style utility.
- For file inputs and drop zones, validate the file metadata through a schema at the component boundary and expose `onBeforeValidation`, `onValidationError`, and `onFileSelect` callbacks.
- Keep form controls accessible even when custom-styled: labels, `aria-describedby`, `aria-invalid`, keyboard activation, hidden native inputs, and live regions when status changes matter.

Compact pattern:

```tsx
const optionalNameSchema = z.union([z.literal(""), ResourceSchema.shape.name])

export function ResourceForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues?: { name?: string }
  onSubmit: (values: { name?: string }) => Promise<void>
}): React.JSX.Element {
  const form = useForm({
    defaultValues: { name: defaultValues?.name ?? "" },
    onSubmit: async ({ value }) => {
      await onSubmit({ name: value.name.trim() || undefined })
    },
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name" validators={{ onBlur: optionalNameSchema, onSubmit: optionalNameSchema }}>
        {(field) => (
          <input
            id={field.name}
            name={field.name}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            aria-invalid={field.state.meta.errors.length > 0}
          />
        )}
      </form.Field>
    </form>
  )
}
```

## Framework And Integration Modules

Frontend apps often contain integration code: analytics, feature flags, auth session clients, route rewrites, request logging, browser-only SDKs, and server-rendering adapters. Treat them as boundaries.

- Wrap third-party browser SDKs behind app-owned services, providers, or hooks.
- In React components, use the provider/hook. Outside React, use the singleton service only when the repo already supports that split.
- Track user-initiated mutation outcomes in `onSuccess` and failures in `onError`. Do not track in optimistic `onMutate` unless the product explicitly wants attempted actions.
- Read-only queries do not need analytics by default.
- Use a consistent event-name format. Prefer `domain:action` with snake_case action names, such as `project:create` or `settings:update_name`.
- Pass only relevant, non-sensitive context with analytics events.
- Never include PII or sensitive payloads in analytics context.
- Keep integration modules idempotent. Dev servers and HMR can re-evaluate modules.
- Use runtime guards for browser-only globals and server-only modules.
- Keep auth/session guards as route or layout boundaries. They should render loading, retry/error, redirect, and accepted-policy states explicitly instead of sprinkling auth checks through every feature component.
- For SSR data, pass precise initial data into client queries when possible. Disable SSR for client-only follow-up queries that do not affect first paint or metadata.
- Use tiny "virtual" components for synchronizing third-party client libraries with server-computed state when the library requires hook access but should render no DOM.
- Lazy-load heavy browser-only widgets from controller components, and provide a minimal loading state.

## Config-Driven UI

For complex UI domains such as charts, editors, dashboards, filter builders, or generated forms, prefer typed config registries over scattered conditionals.

Good config-driven UI has:

- A central registry mapping type keys to renderers, form editors, parser functions, or runtime builders.
- A typed default config object for stable creation behavior.
- Pure transformation functions that convert config plus data into runtime objects.
- Focused tests around transformation functions, coercion rules, defaults, and invalid config behavior.
- Escape hatches for unsupported combinations that return `null` or a typed failure instead of rendering broken UI.
- Group generated editor fields by naming convention only when that convention is documented in code and tested through behavior.
- Keep defaults and coercion rules centralized. UI fields should not each invent their own interpretation of the same config value.

Registry + transform shape:

```ts
const widgetConfig = {
  table: [TableEditor, buildTableWidget],
  chart: [ChartEditor, buildChartWidget],
  metric: [MetricEditor, buildMetricWidget],
} as const

export type WidgetType = keyof typeof widgetConfig
export type WidgetConfigValue = { id: string; type: WidgetType; title?: string }

export function buildWidget(config: WidgetConfigValue, data: ResultData): Widget | null {
  const entry = widgetConfig[config.type]
  if (!entry) return null
  const [, build] = entry
  return build(config, data)
}
```

Use comments for invariants, coercion rules, and non-obvious sequencing. Do not comment obvious JSX mechanics.

## Styling

Use the repo's styling system and design tokens.

- Prefer semantic tokens such as `bg-card`, `text-foreground`, `border-input`, or local equivalents over arbitrary colors.
- Use Tailwind utilities with `cn()` or the repo's merge helper for conditional classes.
- Use `class:list` or the framework-native equivalent in Astro components.
- Use `cva` or an established variant helper for size, tone, density, and state variants.
- If a `cn()` call becomes long or heavily conditional, extract a variant definition or a smaller component.
- Avoid inline styles unless a runtime value genuinely cannot be represented by tokens or classes.
- Keep responsive behavior mobile-first and aligned with existing breakpoints.
- Preserve visible focus states and keyboard affordances.

## Files And Names

Use the repo's naming first. When ambiguous, prefer:

- ESM imports and type-only imports when importing types.
- Node builtins use the `node:` protocol in frontend-adjacent tooling or server-side frontend code when the repo supports it.
- Import order: React/framework and external libraries first, shared UI/design-system packages second, app/package aliases third, relative imports fourth, type imports last. Follow the formatter/linter if it has a stricter order.
- Kebab-case filenames: `resource-card.tsx`, `settings-dialog.astro`, `query-service.ts`.
- Suffix files with their archetype when useful: `.store.ts`, `.service.ts`, `.provider.ts`, `.module.ts`, `.test.tsx`, `.route.ts`.
- React components use PascalCase exports from kebab-case files.
- Feature folders own feature-specific components, hooks, stores, and tests.
- Shared UI packages own generic primitives and composed interaction patterns.
- Avoid barrel files unless the repo already relies on them. Direct imports make ownership clearer.
- Shared reusable primitives belong in shared packages only when multiple apps, packages, or features can realistically reuse them.
- Do not create helper files just for one tiny function. Keep tiny local logic inline until extraction makes the caller clearer or prevents real duplication.

Common frontend shapes include `components/feature-name`, `components/common`, `services/domain`, `stores`, `hooks`, `layouts`, `pages`, `routes`, `utils`, and `integrations`. The point is ownership, not exact folder names.

## Testing

Prefer behavior-focused tests. Do not write tests for what the type system already guarantees.

Use the repo's stack, usually Vitest, Testing Library, Playwright, and local render helpers.
Use real provider setup for context-heavy concerns such as i18n, routing, query clients, and auth/session. For i18n specifically, prefer the real setup or the default locale instead of reimplementing translation behavior in tests.

Test:

- User-visible rendering, interactions, navigation, loading, empty, and error states.
- Important conditional branches and edge cases.
- Query/service cache behavior when it is easy to regress.
- Optimistic updates, rollback, invalidation, and mutation-side effects.
- Forms: validation, normalization, disabled state, submit flow, and field errors.
- Pure config transformations and generated UI builders.
- Accessibility-critical keyboard behavior for menus, dialogs, tabs, comboboxes, and composite widgets.

Avoid:

- Large snapshots.
- Testing implementation details or exact class strings when semantics are enough.
- Assuming jest-dom matchers exist unless the package setup imports them.
- More than two nested `describe` levels.
- Re-testing static types, prop shapes, or impossible states already enforced by TypeScript.

For components that need providers, create minimal test wrappers for query clients, routers, stores, themes, or form contexts. Use deterministic query clients in tests: no retries, controlled cache, and explicit cleanup.

For headless hooks and interaction-heavy components, write small test harness components instead of mocking the hook internals. Interact with the DOM through `userEvent`, then assert visible output, selected values, cache effects, or callback calls.

## When In Doubt

- Keep changes as small and local as possible.
- Reuse existing feature patterns before inventing a new abstraction.
- Extract a focused component, hook, or service before adding ad-hoc branches to a large file.
- Keep shared UI generic and move product behavior up to feature components.
- Let contracts and design tokens be the source of truth.
