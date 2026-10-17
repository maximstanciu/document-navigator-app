---
name: release
description: Cut a release of the mobile app — version bump, pre-flight checks, EAS build, store submission, or an over-the-air EAS Update. Run only when the user explicitly asks to release, ship, build for the stores, submit, or push an OTA update.
argument-hint: '[build|submit|update] [patch|minor|major] [ios|android|all]'
disable-model-invocation: true
---

# Release

Builds cost EAS minutes; submissions, updates and deployments reach real users. **Confirm with the user before every `eas build`, `eas submit`, `eas update`, and `eas deploy` command**, showing the exact command, profile, platform, and version.

Run EAS CLI as `npx eas-cli@latest <command>`. For store-submission details, credentials, and CI (EAS Workflows), the official `expo` plugin skills have current guidance.

## Profiles (`eas.json`)

| Profile       | For                              | Distribution | Channel       |
| ------------- | -------------------------------- | ------------ | ------------- |
| `development` | dev client on testers' devices   | internal     | `development` |
| `preview`     | QA builds of a release candidate | internal     | `preview`     |
| `production`  | App Store / Play Store           | store        | `production`  |

`appVersionSource: "remote"` + `autoIncrement` means EAS owns the build number / versionCode. You only manage the user-facing `version` in `app.json`.

## One-time setup (if not done yet)

Already done (tasks 0.1, 0.2, 0.5): project `@maximst/docnavigator` is linked (`extra.eas.projectId`), `expo-dev-client` and `expo-updates` are installed, `runtimeVersion` uses the `fingerprint` policy, identifiers are `com.stanciu.docnavigator`. If `npx eas-cli@latest whoami` says "Not logged in", ask the user to run `npx eas-cli@latest login --device` in a terminal tab they can see — never enter their credentials.

iOS builds need a paid Apple Developer account; the first one signs in to Apple interactively.

## Store release

1. **Pre-flight**
   - Clean git tree on the release branch: `git status`.
   - `npm run verify` and `npm run doctor` pass.
   - Smoke-test the main flows on a `preview` build or development build.
2. **Version** — bump `expo.version` in `app.json` (semver: patch = fixes, minor = features, major = breaking/redesign). Commit: `chore(release): v<version>`.
3. **Build** (after confirmation):

   ```bash
   npx eas-cli@latest build --profile production --platform all
   ```

4. **Submit** (after confirmation):

   ```bash
   npx eas-cli@latest submit --profile production --platform ios --latest
   npx eas-cli@latest submit --profile production --platform android --latest
   ```

5. **Tag**: `git tag v<version>` and offer to push the tag.
6. **Report**: version, build links from the EAS output, what was submitted, what's left for the user (store listing, review, staged rollout).

## OTA update (JS/asset-only fixes)

Only when nothing native changed since the build users have: no new native module, no `app.json` plugin/permission/icon/splash change, no Expo SDK bump. With the `fingerprint` runtime policy a native change produces a new runtime version, so the update simply won't reach older builds — ship a new build instead.

```bash
npx eas-cli@latest update --channel production --message "<what changed>"
```

Prefer `--channel preview` first and verify on a preview build. Roll back with `npx eas-cli@latest update:republish` to a previous update group if needed.

## API routes (EAS Hosting)

API routes deploy separately from app builds (task 3.6). After confirmation:

```bash
npx expo export --platform web
npx eas-cli@latest deploy                 # preview deployment
npx eas-cli@latest deploy --prod          # production, only when the user says so
```

Secrets (LLM keys) live in EAS environment variables, never in `EXPO_PUBLIC_*`. Production URL changes need a matching `EXPO_PUBLIC_API_URL` in the app build.

## Never

- Commit credentials (`*.p8`, `*.p12`, `*.jks`, keystore passwords) — `.gitignore` already blocks the common ones.
- Put secrets in `EXPO_PUBLIC_*` variables — they're readable inside the app bundle.
- Edit `ios/`/`android/` to fix a build — fix `app.json` or a config plugin.
