# Document Navigator

React Native boilerplate built on [Expo](https://expo.dev) (SDK 58) with Expo Router, TypeScript, React Query, Jest + React Native Testing Library, and a set of [Claude Code](https://claude.com/claude-code) skills that encode the project's workflows.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: set EXPO_PUBLIC_API_URL
npm start                    # then press a (Android), i (iOS), or w (web)
```

Without `EXPO_PUBLIC_API_URL` the app runs on local fixtures, so it works with no backend.

## Scripts

| Script                    | What it does                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `npm start`               | Expo dev server                                                  |
| `npm run android/ios/web` | Dev server + open the platform                                   |
| `npm run verify`          | Typecheck, lint, format check, tests (CI gate)                   |
| `npm run typecheck`       | `tsc --noEmit`                                                   |
| `npm run lint`            | ESLint (`eslint-config-expo` + Prettier + Testing Library rules) |
| `npm run format`          | Prettier write                                                   |
| `npm test`                | Jest (`jest-expo` preset)                                        |
| `npm run doctor`          | `expo-doctor` dependency/config checks                           |

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `master` and on pull requests: `npm ci`, then `npm run verify`, with `expo-doctor` in a parallel job. Node 22. If `npm run verify` passes locally, the verify job should pass too.

## What's inside

- **Routing** — Expo Router with typed routes: a root Stack, a tab group (native tabs on iOS/Android, custom tab bar on web), a dynamic detail route, and a not-found screen.
- **Feature modules** — `src/features/<feature>/` holds types, API calls, React Query `queryOptions`, components, and screens. `documents` is the reference feature (list → detail); `settings` shows app info.
- **Data layer** — `src/lib/api/client.ts` (typed fetch wrapper, `ApiError`, bearer token hook), `src/lib/query-client.ts` (retry policy, refetch on app foreground).
- **UI kit** — themed text/view, light/dark color tokens, `Button`, loading/error/empty states, accessibility built in (ARIA props, 44pt targets, AA contrast).
- **Testing** — Jest with RNTL v14 (async APIs), `renderWithProviders`, and router tests with `expo-router/testing-library`.
- **Tooling** — ESLint flat config, Prettier, React Compiler, `eas.json` with development/preview/production profiles.

```
src/
  app/          routes only (thin)
  features/     domain modules (documents, settings)
  components/   shared UI (ui/ primitives)
  constants/    theme tokens
  hooks/        shared hooks
  lib/          env, API client, query client
  providers/    app-wide providers
  test/         test helpers
.claude/
  skills/       project skills for Claude Code
  settings.json shared Claude Code settings (Expo plugin, safe command allowlist)
  launch.json   dev server config for the browser preview
```

## Claude Code skills

`CLAUDE.md` loads the project conventions from `AGENTS.md` (shared with other coding agents) and indexes the skills in `.claude/skills/`. Claude picks them up automatically; you can also invoke one directly, e.g. `/new-screen settings/profile`.

| Skill                 | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `verify`              | Quality gate before anything is "done"                                |
| `new-screen`          | Add a route/screen/tab/modal with all UI states and a test            |
| `new-component`       | Themed, accessible component + test in the right folder               |
| `new-feature`         | Scaffold a full feature module                                        |
| `api-integration`     | Endpoints, queries, mutations, auth, env config                       |
| `write-tests`         | Jest + RNTL v14 patterns, router tests, mocks                         |
| `add-dependency`      | Expo-compatible installs, native modules, config plugins, permissions |
| `run-app`             | Run on web/emulator/simulator/device, read logs                       |
| `troubleshoot`        | Common Metro / Jest / native / build failures                         |
| `performance-audit`   | Lists, re-renders, images, startup, bundle size                       |
| `accessibility-audit` | Screen readers, targets, contrast, font scaling, motion               |
| `release`             | Version bump + EAS build/submit/update (manual `/release` only)       |

The project also enables the official [`expo` plugin](https://github.com/expo/skills) for Expo-maintained skills (native UI, deployment, CI/CD, SDK upgrades). Claude Code offers to install it when you trust the folder.

## Making it yours

1. Rename the app: `name`, `slug`, `scheme` in `app.json`; `name` in `package.json`.
2. Set `ios.bundleIdentifier` and `android.package` in `app.json` before your first store build.
3. Replace icons and splash in `assets/`.
4. Point `EXPO_PUBLIC_API_URL` at your backend and drop the fixture fallback in `src/features/documents/api.ts` (or delete the feature).
5. Link EAS: `npx eas-cli@latest init`.
