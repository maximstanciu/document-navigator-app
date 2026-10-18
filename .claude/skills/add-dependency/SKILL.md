---
name: add-dependency
description: Add, replace, or remove an npm package or native module safely in this Expo project — SDK-compatible versions, Expo Go vs development build, config plugins, permissions, and app.json changes. Use when the user wants to install a library, use a device capability (camera, location, notifications, files, biometrics, storage, maps, payments), or edit native configuration.
argument-hint: '<package or capability>'
---

# Add a dependency

## 1. Choose the library

**The approved candidate list is `docs/SPEC.md` §10.** Anything not on it needs the user's OK before installing: say what it's for and why an Expo module or existing code won't do (AGENTS.md → Rules). Packages on the list still need a go-ahead when the plan task doesn't already cover them.

In order of preference:

1. Already installed? Check `package.json` first.
2. An Expo SDK module (`expo-*`) — check the versioned docs for the SDK in `package.json` (`https://docs.expo.dev/versions/v<major>.0.0/`). They ship config plugins, web support where possible, and Jest mocks.
3. A community library listed on https://reactnative.dev/directory with New Architecture support and recent releases.
4. Writing it yourself (small utilities) — no dependency at all.

Tell the user which library you picked and why when it isn't obvious. Prefer pure-JS libraries when they do the job; every native module forces a development build.

## 2. Install

```bash
npx expo install <package>            # runtime dependency
npx expo install <package> -- --save-dev   # dev dependency
```

Never `npm install <pkg>` for anything that touches React Native — `expo install` picks the version that matches this SDK. Remove with `npm uninstall <pkg>` and delete its plugin entry from `app.json`.

## 3. Native code? Then:

- **Config plugin**: if the library has one, add it to `plugins` in `app.json` with its options (permission strings, API keys from env, etc.). `npx expo install` adds some automatically — check the diff.
- **Permissions**: every iOS permission needs a human-readable purpose string explaining _why_ (App Store review rejects vague ones). Set them through the plugin options, or `ios.infoPlist` / `android.permissions` in `app.json`. Request at the moment of use, handle "denied" and "blocked" states in the UI.
- **Plugins share iOS keys**: setting a permission to `false` in one plugin deletes the key for everyone. `expo-image-picker` with `cameraPermission: false` would remove the `NSCameraUsageDescription` the scanner needs, so `app.json` passes it the same camera text and blocks Android's `CAMERA` with `android.blockedPermissions` instead (task 2.3).
- **Check the generated manifest**: prebuild can add Android permissions you didn't ask for (e.g. `READ_CALENDAR`/`WRITE_CALENDAR` with `expo-calendar`, spike 0.7; `CAMERA` from `expo-image-picker`'s library manifest). Inspect `android/app/src/main/AndroidManifest.xml` after `npx expo prebuild --platform android --clean` and remove unneeded ones with `android.blockedPermissions` in `app.json` — sensitive permissions must be declared in Play's Data safety form.
- **Never** create or edit `ios/` or `android/` — they're generated (Continuous Native Generation) and git-ignored. All native config goes through `app.json` and config plugins. If no plugin exists, write a local one in `plugins/` and reference it by path.
- **Rebuild**: native changes don't reach the app via Fast Refresh. Expo Go only contains the Expo SDK's built-in modules; anything else needs a development build:

  ```bash
  npx expo prebuild --platform android --clean   # apply plugin changes
  ANDROID_HOME=~/Android/Sdk npx expo run:android --device <name>   # local build (see run-app)
  ```

  iOS development builds go through EAS (`eas build` — ask the user first; it uses build quota). Tell the user a rebuild is required; it's not automatic.

- **Inspect** the resolved config: `npx expo config --type introspect`.

## 4. Adapters, web and tests

- Put a native library behind a thin adapter in the feature (`scanner.ts`) with a `.web.ts` stub, so the web dev preview keeps working (CAP-10) and tests mock the adapter, not the library.
- Before relying on a platform API, check `docs/spikes/` for measured behavior (e.g. the scanner reports "unavailable" as a cancel; Hermes on Android has no `Intl.PluralRules`).
- If Jest crashes with "native module not found" or an ESM syntax error, add a mock (`jest.mock`) or the package to `transformIgnorePatterns` — see `write-tests` and `troubleshoot`.

## 5. Verify

```bash
npm run doctor     # dependency/config compatibility
npm run verify
```

Then mention in your summary: the package added, any `app.json` change, and whether a new development build is needed.

## Common choices in this app

| Need                    | Use                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Local data and settings | `expo-sqlite` through repositories in `src/lib/db` (settings are a table, not AsyncStorage)                |
| `deviceId`              | `expo-secure-store`                                                                                        |
| Page files              | `expo-file-system` under `Paths.document` (`src/lib/files`)                                                |
| Document scanning       | `react-native-document-scanner-plugin` (installed; fork as fallback, spike 0.4)                            |
| Photos / files          | `expo-image-picker`, `expo-document-picker` (installed, task 2.3); normalize with `expo-image-manipulator` |
| Images in UI            | `expo-image`                                                                                               |
| Notifications           | `expo-notifications` (local only)                                                                          |
| "Add to calendar"       | Android: `expo-intent-launcher` `ACTION_INSERT`; iOS: `expo-calendar` (spike 0.7)                          |
| Validation / schema     | `zod` v4 in `src/shared`                                                                                   |
| Localization            | `expo-localization`, `i18next` + `react-i18next` (installed, task 1.1)                                     |
| Plurals in Hermes       | `@formatjs/intl-pluralrules` + `@formatjs/intl-locale` polyfills (installed, task 1.1)                     |

Not on SPEC §10 (ask first): form libraries, global state managers, UI kits, analytics, crash reporting (open question 6). Confirm each API against the versioned docs before relying on it — names and APIs change between SDKs.
