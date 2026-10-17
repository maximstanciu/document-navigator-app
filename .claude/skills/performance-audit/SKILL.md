---
name: performance-audit
description: Find and fix React Native performance problems — slow or janky lists, excess re-renders, heavy images, slow startup, animation jank, large JS bundles. Use when the user reports lag, stutter, dropped frames, slow screens, slow startup, high memory, or asks to optimize or profile the app.
argument-hint: '[screen or symptom]'
---

# Performance audit

Measure first, change second, measure again. Report before/after numbers, not impressions.

## 1. Reproduce and measure

- Use a **release-like build** for anything timing-related — dev mode is several times slower. `npx expo start --no-dev --minify` gets close for JS; a `preview` build is the real thing.
- React Native DevTools (press `j` in `expo start`): **Profiler** tab to record renders, **Performance** tab for JS thread activity.
- Perf Monitor in the dev menu shows UI and JS FPS. JS FPS dropping = JS thread work; UI FPS dropping = native/rendering work.

## 2. Usual suspects, in order of payoff

**Lists**

- `ScrollView` + `.map()` over unbounded data → `FlatList`, or `@shopify/flash-list` for long/complex lists.
- Stable `keyExtractor` returning an id, never the index.
- Rows: no inline heavy work, no `useQuery` per row (fetch the list once), images sized to the row.
- Large lists: `initialNumToRender`, `windowSize`, `maxToRenderPerBatch` tuning; `getItemLayout` when rows have a fixed height.

**Re-renders**

- React Compiler is on (`experiments.reactCompiler`): it memoizes components and hooks automatically. Check whether it compiled the component (DevTools marks compiled components). If it bailed out, the `react-hooks` lint errors usually say why — fix the rule violation rather than adding manual `memo`/`useMemo`.
- Context providers with frequently changing values re-render every consumer — split the context or move state down.
- React Query: select only what a component needs (`select` option) so unrelated cache changes don't re-render it.

**Images**

- `expo-image` with explicit `style` dimensions, `contentFit`, and `cachePolicy`. Serve images near display size; avoid decoding 4000px photos into 80px thumbnails.
- Use `placeholder` (blurhash/thumbhash) instead of layout jumps.

**Animations**

- Animate with `react-native-reanimated` (runs on the UI thread). Animate `transform` and `opacity`, not `width`/`height`/`top`.
- No `setState` per animation frame; worklets for gesture-driven values.

**Startup**

- Keep root `_layout.tsx` and providers light; defer non-critical work until after first render.
- Keep heavy modules out of the root layout and providers; import them only from the screens that use them.
- Fonts: load with the `expo-font` config plugin (embedded at build time) instead of runtime loading where possible.

**Bundle size**

- `npx expo export --platform android` and check the output size; analyze with Expo Atlas (see the Expo docs "Analyzing JavaScript bundles" for the current command).
- Watch for whole-library imports (`lodash`, icon packs, `moment`) — import per-function or use smaller alternatives.

## 3. Fix, verify, report

- One change at a time; re-measure after each.
- Keep tests green (`verify` skill). Add a regression test if the fix changes behavior (e.g. list virtualization props).
- Report: symptom, cause, change, before/after measurement, and anything not measured on a real device.
