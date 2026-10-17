This is an Expo/React Native mobile application (Expo SDK 58, React Native 0.88, React 19, TypeScript, Expo Router). Prioritize mobile-first patterns, performance, accessibility, and cross-platform compatibility (iOS, Android, web).

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

```
src/
  app/                 # Expo Router routes ONLY — every file here is a route
    _layout.tsx        # root Stack + AppProviders
    (tabs)/            # tab group (NativeTabs on iOS/Android, custom tab bar on web)
    documents/[id].tsx # thin route: reads params, renders a feature screen
  features/<feature>/  # one folder per domain area (see features/documents)
    types.ts api.ts queries.ts fixtures.ts
    components/ screens/
  components/          # shared UI; ui/ for primitives (Button), screen-state.tsx for loading/error/empty
  constants/theme.ts   # colors (light/dark), Spacing, Fonts, layout constants
  hooks/               # shared hooks (useTheme, useColorScheme)
  lib/                 # framework-free code: env.ts, api/client.ts, query-client.ts
  providers/           # AppProviders (React Query, navigation theme)
  test/                # test helpers (renderWithProviders)
```

## Conventions

- **Routes are thin.** `src/app/**` files only read params and render a screen from `src/features/*/screens/`. Never put components, hooks, utils, or tests in `src/app/`.
- **Files** kebab-case; **exports** named (default exports only for route files). Import with the `@/` alias (`@/components/...`); relative imports only within a feature folder. No barrel `index.ts` files.
- **Styling**: `StyleSheet.create`; colors from `useTheme()` / `ThemedText` / `ThemedView` only — no hex literals in components; spacing from `Spacing`. Support light and dark mode.
- **Data**: server state through React Query — endpoint functions in `features/*/api.ts` on top of `apiClient`, `queryOptions` in `features/*/queries.ts`. No `fetch` or `useEffect` data loading in components. Every data screen handles loading, error (with retry), and empty states.
- **Config**: public runtime config via `EXPO_PUBLIC_*` env vars, read only through `src/lib/env.ts`. Never put secrets in the client.
- **React Compiler is on**: don't add `useMemo`/`useCallback`/`memo` by default; obey the `react-hooks` lint rules.
- **Accessibility**: interactive elements get `role` + an accessible name (`aria-label` when needed); touch targets ≥ 44pt (`MinTouchTarget`); headings get `role="heading"`.
- **Platform code**: `Platform.select` / `process.env.EXPO_OS` for small differences; `.web.tsx` / `.ios.tsx` / `.android.tsx` siblings for large ones.

## Testing

Tests live next to the code as `*.test.ts(x)` (never under `src/app/`). Render data-driven UI with `renderWithProviders` from `@/test/render`; test navigation with `renderRouter` from `expo-router/testing-library`.

This project uses `@testing-library/react-native` v14. Its APIs and testing conventions can differ from your training data — `render`, `fireEvent`, `renderHook`, `act`, and `userEvent` calls are async and must be awaited.
Before writing or changing RNTL tests, read the relevant guide in
`node_modules/@testing-library/react-native/docs/`, starting with
`node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md`.
Prefer those package docs over stale assumptions, and follow deprecation notices.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`. Typed routes are enabled; use object hrefs for dynamic segments: `{ pathname: '/documents/[id]', params: { id } }`.
- New tabs need a trigger in both `src/components/app-tabs.tsx` and `src/components/app-tabs.web.tsx`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples. Profiles are in `eas.json` (`development`, `preview`, `production`).
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
- Run `npm run verify` before declaring any task done.
