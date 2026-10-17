---
name: write-tests
description: Write or fix Jest tests for components, screens, hooks, navigation, and API code using jest-expo and React Native Testing Library v14 (async APIs). Use when the user asks for tests, coverage, a regression test for a bug, or when a test is failing or flaky.
argument-hint: '[file or behavior to test]'
---

# Write tests

Stack: `jest-expo` preset, `@testing-library/react-native` **v14**, `expo-router/testing-library`, config in `jest.config.js`.

RNTL v14 differs from most training data. Before writing tests, skim `node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md` (and other files in that folder as needed) — it matches the installed version.

## Where tests go

- Next to the code: `button.tsx` → `button.test.tsx`.
- **Never in `src/app/`** — Expo Router would treat the test file as a route. Test the screen component in `src/features/*/screens/` instead; route behavior is covered with `renderRouter`.
- Shared helpers: `src/test/render.tsx` (`renderWithProviders`, `createTestProviders`, `createTestQueryClient`).

## The v14 rules that matter

- `render`, `renderHook`, `fireEvent`, `act`, `rerender`, `unmount`, and all `userEvent` calls are **async** — always `await` them; make tests `async`.
- Prefer `userEvent.setup()` + `await user.press(...)` / `user.type(...)` over `fireEvent`.
- Query priority: `getByRole(role, { name })` → `getByLabelText` → `getByText` → `getByTestId` (last resort).
- `findBy*` for things that appear after async work. `queryBy*` only to assert absence. Don't wrap `getBy*` in `waitFor`.
- Use `screen.*`, not destructured queries. Assert with RNTL matchers (`toBeOnTheScreen`, `toBeDisabled`, `toHaveTextContent`, `toHaveAccessibleName`...).
- No manual `cleanup()` or `act()` wrapping.

## Recipes

**Component** — `src/components/ui/button.test.tsx`:

```tsx
const user = userEvent.setup();
await render(<Button label="Save" onPress={onPress} />);
await user.press(screen.getByRole('button', { name: 'Save' }));
expect(onPress).toHaveBeenCalledTimes(1);
```

**Screen with data** — `src/features/documents/screens/document-list-screen.test.tsx`. Render with `renderWithProviders` (fresh `QueryClient`, retries off) and control data by stubbing the feature's endpoint function:

```tsx
import * as api from '../api';
jest.spyOn(api, 'fetchDocuments').mockResolvedValue([]);
await renderWithProviders(<DocumentListScreen />);
expect(await screen.findByText('No documents yet')).toBeOnTheScreen();
```

Cover: data, empty, error → retry. Restore spies in `afterEach(() => jest.restoreAllMocks())`.

**Navigation** — mount real screens in an in-memory router:

```tsx
import { renderRouter } from 'expo-router/testing-library';

await renderRouter(
  { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
  { initialUrl: '/', wrapper: createTestProviders() }
);
await user.press(await screen.findByRole('link', { name: /Getting started/ }));
expect(screen).toHavePathname('/documents/getting-started');
```

**Hook** — `const { result } = await renderHook(() => useThing(), { wrapper: createTestProviders() });`

**HTTP layer** — `jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))`. See `src/lib/api/client.test.ts`. Mock modules (e.g. `@/lib/env`) with `jest.mock(path, factory)` at the top of the file.

**Native modules** — `jest-expo` mocks most Expo modules. For a library without mocks, add `jest.mock('lib-name', () => ({ ... }))` in the test, or in a shared setup file registered via `setupFilesAfterEnv` in `jest.config.js` if many tests need it.

**Time** — `jest.useFakeTimers()` with `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`.

## Bug fixes

Write the failing test first, watch it fail for the right reason, then fix. Name the test after the behavior, not the bug ID.

## Running

```bash
npx jest path/to/file.test.tsx      # one file
npx jest -t "shows an empty state"  # by name
npm test -- --coverage              # coverage report in coverage/
```

Finish with the `verify` skill. Never `.skip`, delete, or loosen an assertion just to get green — fix the code or explain why the test was wrong.
