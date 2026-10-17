@AGENTS.md

## Claude Code skills in this repo

Project skills live in `.claude/skills/`. Use the matching skill instead of improvising a workflow; they encode this repo's conventions (local-first data, own API routes, adapters, tests at the adapter boundary). `src/features/documents` is the reference local-data feature.

| Skill                 | Use for                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `verify`              | The done-gate: typecheck, lint, format, tests. Run after every change.  |
| `new-screen`          | Adding a route/screen, tab, modal, or deep link                         |
| `new-component`       | Creating reusable or feature UI with theming, a11y, and a test          |
| `new-feature`         | A feature module from a SPEC requirement or plan task                   |
| `api-integration`     | Local data (repositories + React Query), API routes, handlers, env      |
| `write-tests`         | Jest + RNTL v14 tests, router tests, fixing flaky tests                 |
| `add-dependency`      | Installing libraries / native modules, config plugins, permissions      |
| `run-app`             | Web preview, Android development build on emulator or phone, logs       |
| `troubleshoot`        | Metro, native module, Jest, typing, and build errors                    |
| `performance-audit`   | Jank, slow lists, re-renders, startup, bundle size                      |
| `accessibility-audit` | Screen reader, touch targets, contrast, font scaling                    |
| `release`             | Version, EAS build/submit/update/deploy (user-invoked only: `/release`) |

The official `expo` plugin (enabled in `.claude/settings.json`) adds Expo-maintained skills for native UI, Tailwind, API routes, deployment, CI/CD, and SDK upgrades. Prefer project skills for conventions; use the `expo` plugin skills for Expo platform details.

## Working rules

- Ask before running anything that publishes or costs money: `eas build`, `eas submit`, `eas update`, `eas deploy`, store uploads.
- Ask before adding a dependency the user didn't request; say why it's needed.
- If you can't verify something in this environment (e.g. iOS-only behavior on Linux), say so in your summary.
