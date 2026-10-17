---
name: new-screen
description: Add a screen/route to the app with Expo Router — a tab, a pushed detail screen, a modal, or a dynamic [param] route — wired into navigation with loading/error/empty states and a test. Use when the user asks for a new page, screen, route, tab, modal, or deep link.
argument-hint: '<route path, e.g. documents/[id]/edit> [what it shows]'
---

# New screen

Routes are files in `src/app/` (Expo Router). Route files stay **thin**: they read params and render a screen component that lives in a feature folder. That keeps screens testable without the router and keeps non-route files out of `src/app/` (every file there becomes a route).

Reference implementation — read these before writing anything:

- `src/app/documents/[id].tsx` → `src/features/documents/screens/document-detail-screen.tsx` (pushed screen with param)
- `src/app/(tabs)/index.tsx` → `src/features/documents/screens/document-list-screen.tsx` (tab with list)
- `src/app/_layout.tsx` (root Stack), `src/app/(tabs)/_layout.tsx` + `src/components/app-tabs.tsx` / `app-tabs.web.tsx` (tabs)

## 1. Pick the route file

| Want                           | File                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Screen pushed over the tabs    | `src/app/<feature>/<name>.tsx` or `src/app/<feature>/[id].tsx`                                                       |
| New tab                        | `src/app/(tabs)/<name>.tsx` **and** a trigger in both `app-tabs.tsx` and `app-tabs.web.tsx`                          |
| Modal                          | `src/app/<name>.tsx` + `<Stack.Screen name="<name>" options={{ presentation: 'modal' }} />` in `src/app/_layout.tsx` |
| Nested flow with its own stack | `src/app/<group>/_layout.tsx` exporting a `<Stack />`                                                                |

File names are kebab-case. `index.tsx` is the folder's default route. `(group)` folders don't appear in the URL.

## 2. Write the screen component

`src/features/<feature>/screens/<name>-screen.tsx`, a named export taking route params as props:

```tsx
export function DocumentEditScreen({ id }: { id: string }) {
  const { data, error, isPending, refetch } = useQuery(documentQueries.detail(id));

  if (isPending) return <LoadingState label="Loading document" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (/* ... */);
}
```

Rules:

- Data comes from React Query (`queries.ts` in the feature) — see the `api-integration` skill. No `fetch` or `useEffect` data loading in screens.
- Always handle all states: `LoadingState`, `ErrorState`, `EmptyState` from `@/components/screen-state`.
- Use `ThemedView`/`ThemedText` and tokens from `@/constants/theme` (`Spacing`, `MaxContentWidth`, ...). No hard-coded colors.
- Safe areas: tab screens wrap content in `SafeAreaView edges={['top', 'left', 'right']}` and pad the bottom with `BottomTabInset`; web pads the top with `TopTabInset` (see `document-list-screen.tsx`). Stack screens with a header use `contentInsetAdjustmentBehavior="automatic"` on the scroll view.
- Lists use `FlatList` (or FlashList — see `performance-audit`), never `ScrollView` + `.map()` for unbounded data.
- Set a header title from data with `<Stack.Screen options={{ title }} />` inside the screen. Static options go in the parent `_layout.tsx`.
- Give the main heading `role="heading"`.

## 3. Write the route file

```tsx
// src/app/documents/[id]/edit.tsx
import { useLocalSearchParams } from 'expo-router';

import { DocumentEditScreen } from '@/features/documents/screens/document-edit-screen';

export default function DocumentEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentEditScreen id={id} />;
}
```

No-param routes can just re-export: `export default SettingsScreen;` after importing it.

## 4. Link to it

Typed routes are on (`experiments.typedRoutes`). Use object hrefs for dynamic segments:

```tsx
<Link href={{ pathname: '/documents/[id]', params: { id } }} asChild>
  <Pressable role="link" aria-label={title}>
    ...
  </Pressable>
</Link>;
// or imperatively
router.push({ pathname: '/documents/[id]', params: { id } });
```

If `tsc` rejects a new href, run `npx expo start` once to regenerate `.expo/types`.

## 5. Test it

Add `<name>-screen.test.tsx` next to the screen (never under `src/app/`). Cover loading → data, error → retry, empty. If the screen navigates, add a `renderRouter` test. Patterns: `write-tests` skill and `src/features/documents/screens/document-list-screen.test.tsx`.

## 6. Finish

Run the `verify` skill, then look at the screen with the `run-app` skill (web preview at minimum). Deep link to check: `npx uri-scheme open "documentnavigatorapp://<path>" --ios|--android`.

For platform-native UI (SwiftUI / Jetpack Compose via `@expo/ui`, native headers, liquid glass), the official `expo` plugin skills have current guidance.
