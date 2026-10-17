---
name: add-dependency
description: Add, replace, or remove an npm package or native module safely in this Expo project — SDK-compatible versions, Expo Go vs development build, config plugins, permissions, and app.json changes. Use when the user wants to install a library, use a device capability (camera, location, notifications, files, biometrics, storage, maps, payments), or edit native configuration.
argument-hint: '<package or capability>'
---

# Add a dependency

## 1. Choose the library

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
- **Never** create or edit `ios/` or `android/` — they're generated (Continuous Native Generation) and git-ignored. All native config goes through `app.json` and config plugins. If no plugin exists, write a local one in `plugins/` and reference it by path.
- **Rebuild**: native changes don't reach the app via Fast Refresh. Expo Go only contains the Expo SDK's built-in modules; anything else needs a development build:

  ```bash
  npx expo install expo-dev-client   # once per project
  npx expo run:android                # or run:ios on macOS — local build
  npx eas-cli@latest build --profile development --platform android   # cloud build
  ```

  Tell the user a rebuild is required; it's not automatic.

- **Inspect** the resolved config: `npx expo config --type introspect`.

## 4. Web and tests

- If the app ships on web, confirm the library supports web or guard it (`Platform.OS !== 'web'`, or a `.web.tsx` sibling with a fallback).
- If Jest crashes with "native module not found" or an ESM syntax error, add a mock (`jest.mock`) or the package to `transformIgnorePatterns` — see `write-tests` and `troubleshoot`.

## 5. Verify

```bash
npm run doctor     # dependency/config compatibility
npm run verify
```

Then mention in your summary: the package added, any `app.json` change, and whether a new development build is needed.

## Common choices

| Need                              | Use                                                                   |
| --------------------------------- | --------------------------------------------------------------------- |
| Secure token storage              | `expo-secure-store`                                                   |
| Key-value / app settings          | `expo-sqlite/kv-store` or `@react-native-async-storage/async-storage` |
| Images                            | `expo-image`                                                          |
| Files / documents                 | `expo-file-system`, `expo-document-picker`, `expo-sharing`            |
| Camera / media                    | `expo-camera`, `expo-image-picker`                                    |
| Notifications                     | `expo-notifications`                                                  |
| Long lists                        | `@shopify/flash-list`                                                 |
| Forms                             | `react-hook-form` (+ `zod`)                                           |
| Client state beyond React context | `zustand`                                                             |

Confirm each against the versioned docs before relying on its API — names and APIs change between SDKs.
