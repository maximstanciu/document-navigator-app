---
name: new-feature
description: Scaffold a complete feature module (types, API calls, React Query queries/mutations, components, screens, routes, tests) following the src/features layout. Use when the user asks to add a feature, section, or domain area to the app (e.g. "add favorites", "add a profile area", "add search") that needs data plus one or more screens.
argument-hint: '<feature-name> [short description]'
---

# New feature

A feature is a folder under `src/features/<feature>/` that owns everything about one domain area. The `documents` feature is the reference — mirror its shape:

```
src/features/<feature>/
  types.ts                 # domain types (what the API returns)
  api.ts                   # endpoint functions: typed, no React
  queries.ts               # React Query queryOptions + mutation hooks
  fixtures.ts              # sample data for offline dev and tests (optional)
  format.ts                # pure helpers (optional)
  components/<name>.tsx    # feature-only UI (+ <name>.test.tsx)
  screens/<name>-screen.tsx  # one per route (+ <name>-screen.test.tsx)
src/app/...                # thin route files that render the screens
```

Rules: no barrels (`index.ts`) — import files directly. Features don't import from each other's internals; shared code moves to `src/components`, `src/hooks`, or `src/lib`. Nothing but route files goes in `src/app/`.

## Steps

1. **Clarify the shape** if the request leaves it open: what data (fields), which screens, which actions (create/edit/delete), and whether a backend endpoint already exists. If there's no backend yet, build against fixtures (see `documents/api.ts`).
2. **Types** — `types.ts`. Name types after the domain (`Favorite`, `FavoriteInput`). Avoid DOM global names (`Document`, `Node`, `Event`).
3. **API + queries** — follow the `api-integration` skill: endpoint functions in `api.ts`, a `<feature>Queries` object with `all()`/`list()`/`detail(id)` in `queries.ts`, mutation hooks that invalidate `all()`.
4. **Components** — follow the `new-component` skill.
5. **Screens + routes** — follow the `new-screen` skill for each screen. If the feature gets a tab, add triggers to both `src/components/app-tabs.tsx` and `app-tabs.web.tsx`.
6. **Tests** — at minimum: `api.ts` behavior (fixtures or mocked `fetch`), each screen's loading/error/empty/data states, and the main navigation path with `renderRouter`. See `write-tests`.
7. **Native capabilities** (camera, files, notifications, storage...) — follow `add-dependency` before writing code against a new library.
8. **Verify** — run the `verify` skill, then exercise the flow in the app with `run-app`.

## Done means

- Every screen handles loading, error (with retry), and empty states.
- Works in light and dark mode, and on web if the feature is meant to ship there.
- `npm run verify` passes; new code has tests next to it.
