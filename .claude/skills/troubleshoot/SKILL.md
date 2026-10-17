---
name: troubleshoot
description: Diagnose and fix React Native / Expo errors — Metro bundler failures, red screens, "native module not found", dependency version mismatches, Jest transform errors, typed route errors, build failures, and blank screens. Use when the app or tests crash, fail to start, fail to build, or show an error the user pastes.
argument-hint: '[error message or symptom]'
---

# Troubleshoot

1. **Get the exact error** — full message and stack, from the Metro terminal, the red screen, `npx jest` output, or the EAS build log. Don't guess from a summary.
2. **Find where it comes from** — app code, a dependency, config, or the native build. The first frame in `src/` is usually the place to look.
3. **Check the matching row below**, then the SDK's versioned docs (`https://docs.expo.dev/versions/v<major>.0.0/`) — Expo changes between SDKs and remembered fixes may be stale.
4. **Fix the cause, then run the `verify` skill.** Explain what was wrong in one or two sentences.

## Health checks first

```bash
npm run doctor              # expo-doctor: SDK compatibility, duplicate deps, config issues
npx expo install --check    # versions that don't match this SDK
npx expo config --type public   # what app.json resolves to
```

## Common failures

| Symptom                                                                       | Likely cause                                                                           | Fix                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unable to resolve module X`                                                  | Not installed, wrong path, or stale cache                                              | Install with `npx expo install X`; check the `@/` path exists; `npx expo start --clear`                                                                                 |
| `Cannot find native module 'X'` / `TurboModuleRegistry.getEnforcing(...)`     | Library with native code running in Expo Go or an old dev build                        | Rebuild the development build (`npx expo run:android` / `eas build --profile development`) — see `add-dependency`                                                       |
| Version mismatch warnings, odd runtime errors after install                   | Package installed with npm instead of `expo install`                                   | `npx expo install --fix`                                                                                                                                                |
| Invariant Violation: `"main" has not been registered`                         | Crash during module init (top-level code threw)                                        | Scroll up for the first error; fix that one                                                                                                                             |
| Screen renders blank / route not found                                        | File outside `src/app/`, missing default export, or a non-route file inside `src/app/` | Routes need `export default`; move helpers and tests out of `src/app/`                                                                                                  |
| `tsc`: `Href` / route type errors after adding a route                        | Stale typed routes                                                                     | Run `npx expo start` once to regenerate `.expo/types`                                                                                                                   |
| `tsc`: cannot find `describe`/`expect` or `.css` side-effect import           | `types` missing in `tsconfig.json`                                                     | Keep `"types": ["jest", "expo/types"]`                                                                                                                                  |
| Jest: `SyntaxError: Unexpected token 'export'` / `import` in `node_modules/x` | ESM package not transformed                                                            | Add `x` to `transformIgnorePatterns` (extend the jest-expo preset's pattern, don't replace it)                                                                          |
| Jest: `Unexpected token ':'` in a `.css` file                                 | CSS reached Jest                                                                       | The `\.css$` mapper in `jest.config.js` must stay above the `@/` aliases                                                                                                |
| Jest: native module undefined                                                 | Library without Jest mocks                                                             | `jest.mock('x', () => ({...}))` in the test or a shared setup file                                                                                                      |
| Jest: `act(...)` warnings / flaky async tests                                 | Missing `await` on RNTL v14 APIs                                                       | `await render(...)`, `await user.press(...)`, use `findBy*` (see `write-tests`)                                                                                         |
| Reanimated / worklets errors                                                  | Version mismatch with the SDK                                                          | `npx expo install react-native-reanimated react-native-worklets`; clear cache                                                                                           |
| Works in dev, broken in release build                                         | Dev-only globals, `console` assumptions, env vars missing in EAS                       | Check `EXPO_PUBLIC_*` are set for the EAS environment; test with `npx expo start --no-dev --minify`                                                                     |
| EAS build fails in a native step                                              | Bad config plugin options / incompatible native lib                                    | Read the first error in the build log phase; reproduce locally with `npx expo prebuild --clean` in a throwaway checkout and inspect, but never commit `ios/`/`android/` |
| `EADDRINUSE :8081`                                                            | Another Metro running                                                                  | Stop it, or `npx expo start --port 8082`                                                                                                                                |
| Gradle: `Java heap space` / dex merging fails                                 | Long-lived Gradle daemon out of heap                                                   | `cd android && ./gradlew --stop`, rebuild                                                                                                                               |
| Phone missing or `unauthorized` in `adb devices`                              | USB debugging not authorized; Samsung Auto Blocker; charge-only cable                  | Unlock, accept the RSA prompt, turn off Auto Blocker for USB commands, use a data cable; `adb kill-server && adb start-server`                                          |
| Dev client on a phone can't reach Metro                                       | Phone can't see the dev machine's port                                                 | `adb reverse tcp:8081 tcp:8081` (or the port Metro uses)                                                                                                                |
| `Intl.PluralRules is not a constructor` / wrong plural forms on device        | Hermes on Android lacks `Intl.PluralRules` (spike 0.7); Jest on Node has it            | Import the polyfill in the app entry (task 1.1); tests can't catch this                                                                                                 |
| Scanner returns `cancel` instantly                                            | ML Kit scanner module unavailable (no Play services or not downloaded, spike 0.4)      | Expected; the capture screen offers gallery and file instead (CAP-9)                                                                                                    |

## Last resorts (in this order, and say you did them)

```bash
npx expo start --clear                       # Metro cache
rm -rf node_modules && npm install           # dependency tree
rm -rf .expo && npx expo start               # generated types/state
```

If none of this explains it, search the library's GitHub issues for the exact error text and report what you found, with links, instead of trying random fixes.
