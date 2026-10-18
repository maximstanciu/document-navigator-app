---
name: new-feature
description: Build a feature module (types, data access through src/lib/db repositories, React Query queries/mutations, native adapters, components, screens, routes, tests) in the src/features layout from a SPEC requirement or plan task. Use when the user asks to add or start a feature or domain area (capture, analysis, deadlines, reminders, onboarding, settings...) or a plan task that needs data plus one or more screens.
argument-hint: '<feature-name or plan task, e.g. 5.4> [short description]'
---

# New feature

A feature is a folder under `src/features/<feature>/` that owns one domain area. The target set is in `docs/IMPLEMENTATION_PLAN.md` (section «Целевая структура кода»): `capture`, `documents`, `analysis`, `deadlines`, `reminders`, `onboarding`, `settings`. Don't invent new top-level areas without asking.

```
src/features/<feature>/
  types.ts                   # feature types (UI-facing); types shared with the server live in src/shared
  api.ts                     # data access: calls src/lib/db repositories or apiClient; no React
  queries.ts                 # queryOptions + mutation hooks; keys from src/lib/db
  <logic>.ts                 # pure functions, e.g. plan-reminders.ts (+ .test.ts)
  <capability>.ts            # thin native adapter, e.g. scanner.ts, with a <capability>.web.ts stub
  components/<name>.tsx      # feature UI (+ <name>.test.tsx)
  screens/<name>-screen.tsx  # one per route (+ <name>-screen.test.tsx)
src/app/...                  # thin route files that render the screens
```

Rules: no barrels (`index.ts`); relative imports only inside the feature, `@/` everywhere else. A feature may import another feature's components and explicitly shared functions (`syncReminders()`), never its internals, never in a cycle. DB access always goes through `src/lib/db`. Nothing but route files in `src/app/`.

> Reference: `src/features/documents` is the reference local-data feature: `api.ts` reads through `getRepositories()`, `queries.ts` uses `dbKeys` + `localQueryDefaults`, screen tests seed an in-memory database.

## Steps

1. **Read the requirement.** Find the IDs in `docs/SPEC.md` (e.g. REM-1…REM-12) and the task in `docs/IMPLEMENTATION_PLAN.md` (acceptance criteria, skill column). If the behavior depends on an open decision (D-2, D-3 in SPEC §11.1), stop and ask. Check `docs/spikes/` for findings that constrain the design.
2. **Clarify the shape** if the task leaves it open: which data (tables and fields from SPEC §6), which screens, which actions, which other features it touches.
3. **Types.** Feature types in `types.ts`, named after the domain (`Deadline`, `ReminderPlan`). Avoid DOM global names (`Document`, `Event`). Anything the server also needs (analysis schema, limits) goes to `src/shared/` as plain TypeScript + zod.
4. **Data.** Follow the `api-integration` skill: repository functions from `getRepositories()` (add a migration in `src/lib/db/migrations.ts` if a table changes), `api.ts` mapping, `queries.ts` with `staleTime: Infinity` and no retries for local data, mutations that invalidate every affected key and call shared side effects (`syncReminders()`).
5. **Pure logic first.** Date math, reminder planning, merge rules, post-processing: pure functions with explicit `now`/time zone inputs and unit tests for the edge cases listed in the plan.
6. **Native capabilities** (scanner, picker, notifications, calendar, files): follow `add-dependency`, put the library behind a thin adapter in the feature with a `.web.ts` stub (web is a dev preview without these), and handle denied/unavailable states. Check `docs/spikes/` first — e.g. the scanner reports "unavailable" as a cancel, calendar on Android goes through `ACTION_INSERT`.
7. **Strings.** Every user-facing string and accessibility label goes through the ru/en dictionaries: add a `<feature>` section to `src/lib/i18n/resources/ru.ts` and the same keys to `en.ts` (the typecheck and `i18n.test.ts` catch gaps). Dates and amounts through `src/lib/i18n/format.ts`; plurals through `_one`/`_few`/`_many`/`_other` keys (the `PluralRules` polyfill is loaded in `src/lib/i18n/polyfills.ts`, spike 0.7).
8. **Components and screens.** `new-component` and `new-screen` skills. A new tab needs triggers in both `src/components/app-tabs.tsx` and `app-tabs.web.tsx`.
9. **Tests.** Unit tests for pure logic; screens on an in-memory SQLite database via `installTestRepositories()` (loading/error/empty/data); the main navigation path with `renderRouter`; mocked adapters for native flows. Native flows Jest can't reach go into the manual checklist `docs/smoke-test.md` (task 4.7). See `write-tests`.
10. **Verify.** `verify` skill, then exercise the flow with `run-app` (a development build for anything native).

## Done means

- The plan task's acceptance criteria hold; requirement IDs are referenced in the commit message.
- Every data screen handles loading, error (with retry), and empty states; light and dark mode work.
- Nothing from a document or its analysis is logged or put into notification text.
- `npm run verify` passes; new code has tests next to it.
