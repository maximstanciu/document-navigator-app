---
name: run-app
description: Start this Expo app and look at it running — web preview in the browser pane for layout, or a development build on an Android emulator or a USB-connected phone — and read its logs. Use when asked to run, start, launch, preview, or screenshot the app, or to confirm a UI change actually works.
---

# Run the app

## Fastest check: web (works on any machine)

`.claude/launch.json` has a `web` configuration (`npx expo start --web --port 8081`).

1. Start it with the browser preview tool (`preview_start` with name `web`), or in a terminal: `npm run web`.
2. First bundle takes ~10–20s. Then navigate to routes directly: `http://localhost:8081/`, `/settings`, `/documents/<id>`.
3. Read the page as text or take a screenshot; check the console for errors.
4. Check both color schemes (the browser pane can emulate light/dark) and a phone-sized viewport.

Web is a development preview only (SPEC §9): no scanner, notifications or calendar — those render their `.web.ts` stubs. Native-only code (`NativeTabs`, SF Symbols, permissions) renders differently or not at all. Say what you couldn't check.

## Native: development build only

The app uses native modules Expo Go doesn't have (document scanner, calendar), so **Expo Go does not work** — always a development build (`expo-dev-client`).

| Target              | Build and install                                                                     | Then                                                                    |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Android emulator    | `ANDROID_HOME=~/Android/Sdk npx expo run:android --device <AVD name>`                 | `npx expo start --dev-client`; the app connects to Metro                |
| Android phone (USB) | same with `--device <adb serial>` (builds arm64)                                      | `adb reverse tcp:8081 tcp:8081` so the phone reaches Metro on localhost |
| iOS                 | EAS only: `npx eas-cli@latest build --profile development --platform ios` (ask first) | Needs a paid Apple Developer account and a registered iPhone            |

- `npm run android` runs `expo run:android` (a native build), not Expo Go.
- `--no-bundler` builds and installs without starting Metro; start Metro yourself in a terminal tab, or with `preview_start` and the `metro` configuration in `.claude/launch.json` (`expo start --dev-client`, port 8082 or the next free one).
- After installing a native module or changing a config plugin in `app.json`: `npx expo prebuild --platform android --clean`, then rebuild. JS-only changes need no rebuild.
- An APK built for one device contains only that device's architecture (x86_64 emulator vs arm64 phone); build per target.
- Open the dev client on a given Metro: `adb shell am start -a android.intent.action.VIEW -d "exp+docnavigator://expo-development-client/?url=http%3A%2F%2F<host>%3A<port>"` (`10.0.2.2` from the emulator, `localhost` with `adb reverse`).

In the `expo start` terminal: `a` Android, `r` reload, `j` open the JS debugger, `m` dev menu.

Deep links: `adb shell am start -a android.intent.action.VIEW -d "docnavigator://documents/<id>"` (scheme from `app.json`).

## Logs and debugging

- JS logs stream to the `expo start` terminal; with the preview tool use its log reader.
- Press `j` for React Native DevTools (console, breakpoints, React components, profiler).
- Native crashes and JS logs from a device: `adb logcat -s ReactNativeJS:* AndroidRuntime:E` (Android), Xcode / Console.app (iOS).
- Logs never contain document content — only metadata (AGENTS.md → Privacy).

## When it doesn't start

- Port busy → stop the other Metro (`lsof -i :8081`) or pass `--port 8082` and point the dev client at it.
- Phone not listed by `adb devices`, or `unauthorized` → unlock it, enable USB debugging, accept the RSA prompt; on Samsung turn off Auto Blocker (Security and privacy) for USB commands.
- Stale bundle or weird resolution errors → `npx expo start --clear`.
- Web shows «Could not open the app data» with `createSyncAccessHandle … another open Access Handle` → another page or a leftover worker of the same origin holds the SQLite file in OPFS. Close other tabs of that origin, or open the preview by another host name (`127.0.0.1`, `[::1]` instead of `localhost`): a different origin has its own storage.
- A change on disk doesn't reach the app (e.g. `undefined is not a function` for an export the file has) → a long-running Metro missed file changes (seen in task 2.4 with a day-old server). Start a fresh Metro on another port and open the dev client on it with the `adb shell am start` command above.
- `TurboModuleRegistry.getEnforcing(...): 'X' could not be found` → the installed build predates the native module; rebuild (see `add-dependency`).
- Gradle `Java heap space` during the build → `cd android && ./gradlew --stop`, then rebuild.
- More: `troubleshoot` skill.

Stop the dev server when you're done if you started it.
