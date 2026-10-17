---
name: run-app
description: Start this Expo app and look at it running — web preview in the browser pane, Android emulator, iOS simulator, a physical device via Expo Go, or a development build — and read its logs. Use when asked to run, start, launch, preview, or screenshot the app, or to confirm a UI change actually works.
---

# Run the app

## Fastest check: web (works on any machine)

`.claude/launch.json` has a `web` configuration (`npx expo start --web --port 8081`).

1. Start it with the browser preview tool (`preview_start` with name `web`), or in a terminal: `npm run web`.
2. First bundle takes ~10–20s. Then navigate to routes directly: `http://localhost:8081/`, `/settings`, `/documents/getting-started`.
3. Read the page as text or take a screenshot; check the console for errors.
4. Check both color schemes (the browser pane can emulate light/dark) and a phone-sized viewport.

Web is a proxy, not proof: native-only code (`NativeTabs`, `expo-symbols` SF Symbols, haptics, permissions) renders differently or not at all. Say what you couldn't check.

## Native

| Target            | Command                                     | Needs                                                                               |
| ----------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Android emulator  | `npm run android`                           | Android Studio + a running AVD                                                      |
| iOS simulator     | `npm run ios`                               | macOS + Xcode                                                                       |
| Physical device   | `npm start`, scan the QR code               | Expo Go app matching this SDK                                                       |
| Development build | `npx expo run:android` / `npx expo run:ios` | `expo-dev-client` installed; required once the app has native modules Expo Go lacks |

In the `expo start` terminal: `a` Android, `i` iOS, `w` web, `r` reload, `j` open the JS debugger, `m` dev menu, `s` switch Expo Go ↔ development build.

Deep links: `npx uri-scheme open "documentnavigatorapp://documents/getting-started" --android` (scheme from `app.json`).

## Logs and debugging

- JS logs stream to the `expo start` terminal; with the preview tool use its log reader.
- Press `j` for React Native DevTools (console, breakpoints, React components, profiler).
- Native crashes: `adb logcat` (Android), Xcode / Console.app (iOS).

## When it doesn't start

- Port busy → stop the other Metro (`lsof -i :8081`) or pass `--port`.
- Stale bundle or weird resolution errors → `npx expo start --clear`.
- "Native module cannot be found" in Expo Go → you need a development build (see `add-dependency`).
- More: `troubleshoot` skill.

Stop the dev server when you're done if you started it.
