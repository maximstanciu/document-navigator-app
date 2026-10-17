This is an Expo/React Native mobile application (Expo SDK 58, React Native 0.88, React 19, TypeScript, Expo Router): Document Navigator, which explains letters, invoices and contracts in plain language, extracts deadlines and risks, and reminds about them. Targets are iOS and Android; web is a development preview only (no scanner, notifications, or calendar). Prioritize mobile-first patterns, performance, accessibility, privacy, and cross-platform compatibility.

## Product docs — read before feature work

- `docs/SPEC.md` — requirements (IDs like CAP-2, ANL-8), data model, API contract, analysis schema. Source of truth for behavior.
- `docs/IMPLEMENTATION_PLAN.md` — stages, tasks (e.g. 1.3), acceptance criteria, which skill to use.
- Decisions D-1…D-5 in SPEC §11.1 are **not made yet**. Don't implement code that depends on an open decision; ask instead. When a decision is made, it is moved into the SPEC sections it affects.
- Reference requirement IDs and task numbers in commit messages and PR descriptions.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

```bash
npm start                  # dev server (a: Android, i: iOS, w: web)
npm run web                # dev server + web
npm run verify             # typecheck + lint + format check + tests — run before calling anything done
npm run typecheck          # tsc --noEmit
npm run lint               # expo lint (ESLint flat config, React Compiler rules)
npm run format             # prettier --write .
npm test                   # jest (jest-expo preset)
npm run doctor             # expo-doctor: dependency and config issues
npx expo install <pkg>     # ALWAYS use instead of npm install for app deps — resolves SDK-compatible versions
npx expo install --fix     # fix incompatible package versions
```

## Project structure

Folders marked _(planned)_ don't exist yet; they are created by the plan task in brackets. Create them exactly there, don't invent alternatives.

```
src/
  app/                 # Expo Router routes ONLY — every file here is a route
    _layout.tsx        # root Stack + AppProviders
    (tabs)/            # tab group (NativeTabs on iOS/Android, custom tab bar on web)
    documents/[id].tsx # thin route: reads params, renders a feature screen
    api/v1/*+api.ts    # (planned, 3.1) thin API routes: parse request, call a handler in src/server
  features/<feature>/  # one folder per domain area: capture, documents, analysis, deadlines,
                       #   reminders, onboarding, settings (see the plan's target structure)
    types.ts api.ts queries.ts
    components/ screens/
  components/          # shared UI; ui/ for primitives (Button), screen-state.tsx for loading/error/empty
  constants/theme.ts   # colors (light/dark), Spacing, Fonts, layout constants
  hooks/               # shared hooks (useTheme, useColorScheme)
  lib/                 # client infrastructure: env.ts, api/client.ts, query-client.ts
    db/                # (planned, 1.3) SQLite, migrations, repositories, query keys
    files/             # (planned, 1.4) page files under Paths.document
    i18n/              # (planned, 1.1) localization setup, ru/en dictionaries
  shared/              # (planned, 1.2) pure TS shared by client and server: zod schemas, types, limits
  server/              # (planned, 3.1) server-only code for API routes: handlers, LLM providers, limits
  providers/           # AppProviders (React Query, navigation theme)
  test/                # test helpers (renderWithProviders)
scripts/eval/          # (planned, 0.3/3.7) analysis quality evaluation
```

## Conventions

- **Routes are thin.** `src/app/**` files only read params and render a screen from `src/features/*/screens/`. API route files (`+api.ts`) only parse the request and delegate to a handler in `src/server/`. Never put components, hooks, utils, or tests in `src/app/`.
- **Files** kebab-case; **exports** named (default exports only for route files). Import with the `@/` alias (`@/components/...`); relative imports only within a feature folder. No barrel `index.ts` files.
- **Styling**: `StyleSheet.create`; colors from `useTheme()` / `ThemedText` / `ThemedView` only — no hex literals in components; spacing from `Spacing`. Support light and dark mode. New color tokens need AA contrast in both themes.
- **Data is local-first.** Documents, pages, deadlines, actions and settings live on the device in SQLite; access them only through repositories in `src/lib/db/`, read and written through React Query (`queryOptions` for reads, mutations that invalidate the affected keys). Local queries use `staleTime: Infinity` and no retries. The only HTTP calls are to this app's own API routes (`/api/v1/*`) through `apiClient`. No `fetch`, direct DB calls, or `useEffect` data loading in components. Every data screen handles loading, error (with retry), and empty states.
  - Until task 1.6, `features/documents` is still the boilerplate example (HTTP endpoints with a fixtures fallback). Don't copy that pattern into new features.
- **Feature dependencies**: features may import another feature's components and explicitly shared functions (e.g. `syncReminders()`), never in a cycle. DB access always goes through `src/lib/db`, never another feature's internals.
- **Server code** (`src/server/**`) is imported only from `src/app/api/**/*+api.ts` (enforced by lint after task 1.7). It runs on EAS Hosting (Cloudflare Workers): no native binaries, in-memory `fs`, 128 MB memory per isolate. Secrets (LLM keys) are read from `process.env` only here, never with an `EXPO_PUBLIC_` prefix.
- **Shared code** (`src/shared/**`) is plain TypeScript: no `react`, `react-native`, or `expo*` imports. The zod schema there is the single source of truth for the analysis type, runtime validation, and the JSON Schema sent to the LLM.
- **Config**: public runtime config via `EXPO_PUBLIC_*` env vars, read only through `src/lib/env.ts`. Never put secrets in the client.
- **Strings**: once task 1.1 lands, every user-facing string goes through the i18n dictionaries (ru and en), including accessibility labels. Format dates, amounts, and plurals with `Intl` in the user's locale.
- **Privacy**: never log, send to crash reporting, or put in notification text the contents of a document or its analysis (titles, senders, amounts, quotes). Server logs carry metadata only (SPEC §7.1). Deleting a document wipes its content immediately (SPEC STO-6).
- **React Compiler is on**: don't add `useMemo`/`useCallback`/`memo` by default; obey the `react-hooks` lint rules.
- **Accessibility**: interactive elements get `role` + an accessible name (`aria-label` when needed); touch targets ≥ 44pt (`MinTouchTarget`); headings get `role="heading"`. Never convey risk level or warnings by color alone.
- **Platform code**: `Platform.select` / `process.env.EXPO_OS` for small differences; `.web.tsx` / `.ios.tsx` / `.android.tsx` siblings for large ones. Native modules (scanner, notifications, calendar) sit behind thin adapters with `.web.ts` stubs.

## Testing

Tests live next to the code as `*.test.ts(x)` (never under `src/app/`). Render data-driven UI with `renderWithProviders` from `@/test/render`; test navigation with `renderRouter` from `expo-router/testing-library`.

- Pure logic (date handling, `planReminders`, response post-processing, re-analysis merge) gets plain unit tests — that's where most edge cases are covered.
- API handlers are tested in `src/server/` by calling them with a `Request` and asserting on the `Response`, with `MockLlmProvider` instead of a real model.
- Repositories and native modules are replaced at the adapter boundary (in-memory repository, mocked adapter), not deep inside library internals.
- Native flows that Jest can't reach (scanner, notifications, calendar) are covered by the manual checklist in `docs/smoke-test.md` (task 4.7).

This project uses `@testing-library/react-native` v14. Its APIs and testing conventions can differ from your training data — `render`, `fireEvent`, `renderHook`, `act`, and `userEvent` calls are async and must be awaited.
Before writing or changing RNTL tests, read the relevant guide in
`node_modules/@testing-library/react-native/docs/`, starting with
`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
Prefer those package docs over stale assumptions, and follow deprecation notices.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`. Typed routes are enabled; use object hrefs for dynamic segments: `{ pathname: '/documents/[id]', params: { id } }`.
- New tabs need a trigger in both `src/components/app-tabs.tsx` and `src/components/app-tabs.web.tsx`.
- Gate onboarding with `Stack.Protected` and a `guard`, not with redirects in effects; keep the splash screen up until migrations and settings are loaded.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`), to deploy API routes to EAS Hosting (`eas deploy`), and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples. Profiles are in `eas.json` (`development`, `preview`, `production`).
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. The approved candidate list is SPEC §10; anything outside it needs the user's OK. Docs: https://docs.expo.dev/versions/latest/index.md
- The skills in `.claude/skills/` were written for the boilerplate (HTTP endpoints + fixtures) and are updated in plan task 1.0. Until then, where a skill conflicts with this file or `docs/SPEC.md`, this file and the SPEC win.
- Never commit real documents containing personal data (eval sets included); use synthetic or anonymized samples.
- Run `npm run verify` before declaring any task done.
