This is an Expo/React Native mobile application (Expo SDK 58, React Native 0.88, React 19, TypeScript, Expo Router): Document Navigator, which explains letters, invoices and contracts in plain language, extracts deadlines and risks, and reminds about them. Targets are iOS and Android; web is a development preview only (no scanner, notifications, or calendar). Prioritize mobile-first patterns, performance, accessibility, privacy, and cross-platform compatibility.

## Product docs — read before feature work

- `docs/SPEC.md` — requirements (IDs like CAP-2, ANL-8), data model, API contract, analysis schema. Source of truth for behavior.
- `docs/IMPLEMENTATION_PLAN.md` — stages, tasks (e.g. 1.3), acceptance criteria, which skill to use.
- Decisions D-2 and D-3 in SPEC §11.1 are **not made yet** (D-1, D-4 and D-5 are accepted and already reflected in the SPEC). Don't implement code that depends on an open decision; ask instead. When a decision is made, it is moved into the SPEC sections it affects.
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
npm run check:bundle       # export web (with API routes) + android, fail on server-only names (LLM_*) in client bundles
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
    api/v1/*+api.ts    # thin API routes: parse request, call a handler in src/server
  features/<feature>/  # one folder per domain area: capture, documents, analysis, deadlines,
                       #   reminders, onboarding, settings (see the plan's target structure)
    types.ts api.ts queries.ts
    components/ screens/
  components/          # shared UI; ui/ for primitives (Button), screen-state.tsx for loading/error/empty
  constants/theme.ts   # colors (light/dark), Spacing, Fonts, layout constants
  hooks/               # shared hooks (useTheme, useColorScheme)
  lib/                 # client infrastructure: env.ts, api/client.ts, query-client.ts, device-id.ts
    db/                # SQLite: migrations, repositories (getRepositories()), query keys (dbKeys)
    files/             # page files under Paths.document/documents/<id>/ (relative paths in the DB)
    i18n/              # i18next instance, Intl polyfills, ru/en dictionaries (resources/),
                       #   OS-level strings such as permission texts (native/, wired in app.json)
  shared/              # pure TS shared by client and server: limits.ts, explanation-locales.ts,
                       #   analysis/ (zod schema, API contract, LLM JSON Schema, synthetic fixtures)
  server/              # server-only code for API routes: http/ (errors, client headers, multipart),
                       #   analysis/ (handler, LlmProvider, providers/), testing/ (request and PDF helpers)
  providers/           # AppProviders (React Query, navigation theme)
  test/                # test helpers (renderWithProviders)
scripts/eval/          # analysis quality evaluation: synthetic test documents with reference labels
                       #   (synthetic/, Python, task 0.6); the evaluation runner is (planned, 0.3/3.7)
```

## Conventions

- **Routes are thin.** `src/app/**` files only read params and render a screen from `src/features/*/screens/`. API route files (`+api.ts`) only parse the request and delegate to a handler in `src/server/`. Never put components, hooks, utils, or tests in `src/app/`.
- **Files** kebab-case; **exports** named (default exports only for route files). Import with the `@/` alias (`@/components/...`); relative imports only within a feature folder. No barrel `index.ts` files.
- **Styling**: `StyleSheet.create`; colors from `useTheme()` / `ThemedText` / `ThemedView` only — no hex literals outside `src/constants/theme.ts` (ESLint fails on them); spacing from `Spacing`. Support light and dark mode. New color tokens need AA contrast in both themes — add the pair to `src/constants/theme.test.ts`. Risk levels and the fraud warning have their own tokens (`riskHigh`/`riskMedium`/`riskLow`/`fraudWarning` + `…Background`).
- **Data is local-first.** Documents, pages, deadlines, actions and settings live on the device in SQLite; access them only through repositories in `src/lib/db/` (`getRepositories()`), read and written through React Query (`queryOptions` for reads, mutations that invalidate the affected `dbKeys`). Local queries spread `localQueryDefaults` (`staleTime: Infinity`, no retries). The only HTTP calls are to this app's own API routes (`/api/v1/*`) through `apiClient`. No `fetch`, direct DB calls, or `useEffect` data loading in components. Every data screen handles loading, error (with retry), and empty states.
  - `features/documents` is the reference implementation of a local-data feature.
- **Feature dependencies**: features may import another feature's components and explicitly shared functions (e.g. `syncReminders()`), never in a cycle (`import/no-cycle` on `src/features/**`). DB access always goes through `src/lib/db`, never another feature's internals.
- **Server code** (`src/server/**`) is imported only from `src/app/api/**/*+api.ts`, and itself imports only `src/server`, `src/shared` and `expo-server` among app and Expo code (all enforced by ESLint, `eslint.config.js`). It runs on EAS Hosting (Cloudflare Workers): no native binaries, in-memory `fs`, about 250 MB of memory per isolate shared by all its concurrent requests (measured in spike 0.2, `docs/spikes/0.2-eas-hosting.md`). Secrets (LLM keys) are read from `process.env` only here, never with an `EXPO_PUBLIC_` prefix.
- **Shared code** (`src/shared/**`) is plain TypeScript: no `react`, `react-native`, or `expo*` imports, and only `src/shared` among app code (enforced by ESLint). The zod schema there is the single source of truth for the analysis type, runtime validation, and the JSON Schema sent to the LLM.
- **Config**: public runtime config via `EXPO_PUBLIC_*` env vars, read only through `src/lib/env.ts`. Never put secrets in the client.
- **Strings**: every user-facing string goes through the i18n dictionaries in `src/lib/i18n/resources/` (`ru.ts` is the source, `en.ts` must match its keys), including accessibility labels: `const { t } = useTranslation()`. Plurals use i18next `_one`/`_few`/`_many`/`_other` keys (Russian needs all four). Format dates and amounts with `Intl` in the current language (`src/lib/i18n/format.ts`). Permission texts and other strings the OS shows go into `src/lib/i18n/native/*.json`.
- **Privacy**: never log, send to crash reporting, or put in notification text the contents of a document or its analysis (titles, senders, amounts, quotes). Server logs carry metadata only (SPEC §7.1). Deleting a document wipes its content immediately (SPEC STO-6).
- **React Compiler is on**: don't add `useMemo`/`useCallback`/`memo` by default; obey the `react-hooks` lint rules.
- **Accessibility**: interactive elements get `role` + an accessible name (`aria-label` when needed); touch targets ≥ 44pt (`MinTouchTarget`); headings get `role="heading"`. Never convey risk level or warnings by color alone.
- **Platform code**: `Platform.select` / `process.env.EXPO_OS` for small differences; `.web.tsx` / `.ios.tsx` / `.android.tsx` siblings for large ones. Native modules (scanner, notifications, calendar) sit behind thin adapters with `.web.ts` stubs.

## Testing

Tests live next to the code as `*.test.ts(x)` (never under `src/app/`). Render data-driven UI with `renderWithProviders` from `@/test/render`; test navigation with `renderRouter` from `expo-router/testing-library`.

- Pure logic (date handling, `planReminders`, response post-processing, re-analysis merge) gets plain unit tests — that's where most edge cases are covered.
- API handlers are tested in `src/server/` by calling them with a `Request` and asserting on the `Response`, with `MockLlmProvider` instead of a real model (`/** @jest-environment node */`; request and PDF builders in `src/server/testing/`, since server code can't import `@/test`).
- Repositories run on real SQLite in memory in Jest (`installTestRepositories()` from `@/test/sqlite`, Node's built-in `node:sqlite`); native modules are replaced at the adapter boundary (mocked adapter), not deep inside library internals.
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
- The skills in `.claude/skills/` follow this file and `docs/SPEC.md` (updated in plan task 1.0). If a skill and this file or the SPEC ever disagree, this file and the SPEC win — and fix the skill.
- Never commit real documents containing personal data (eval sets included); use synthetic or anonymized samples.
- Run `npm run verify` before declaring any task done.
