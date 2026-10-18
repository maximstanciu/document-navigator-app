---
name: write-tests
description: Write or fix Jest tests for pure logic, components, screens, hooks, navigation, API client calls and API route handlers using jest-expo and React Native Testing Library v14 (async APIs), with dependencies replaced at the adapter boundary (repositories on in-memory SQLite, mocked native adapter, MockLlmProvider). Use when the user asks for tests, coverage, a regression test for a bug, or when a test is failing or flaky.
argument-hint: '[file or behavior to test]'
---

# Write tests

Stack: `jest-expo` preset, `@testing-library/react-native` **v14**, `expo-router/testing-library`, config in `jest.config.js`.

RNTL v14 differs from most training data. Before writing tests, skim `node_modules/@testing-library/react-native/docs/guides/llm-guidelines.md` (and other files in that folder as needed) — it matches the installed version.

## What to test where (AGENTS.md → Testing)

| Code                                                                   | Test                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pure logic: dates, `planReminders`, post-processing, re-analysis merge | plain unit tests — most edge cases live here                                               |
| Screens and components with data                                       | `renderWithProviders` + `installTestRepositories()` (SQLite in memory) or a mocked adapter |
| Navigation, guards (onboarding)                                        | `renderRouter` from `expo-router/testing-library`                                          |
| API client functions                                                   | `jest.spyOn(globalThis, 'fetch')`                                                          |
| API handlers in `src/server/`                                          | call the handler with a `Request`, assert on the `Response`, `MockLlmProvider`             |
| Scanner, notifications, calendar                                       | mock our adapter module; the real flow goes to `docs/smoke-test.md` (task 4.7)             |

Replace dependencies at the adapter boundary (repository, our native adapter, `fetch`) — never deep inside SQLite, Expo modules or React Query.

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

**Screen with data** — render with `renderWithProviders` (fresh `QueryClient`, retries off) and seed real data through the repositories on an in-memory SQLite database:

```tsx
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { installTestRepositories } from '@/test/sqlite';

let repositories: Repositories;
beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
});
afterEach(() => setRepositories(null));

await repositories.documents.create({
  id: 'doc-1',
  title: 'Счёт',
  source: 'scan',
  mimeType: 'image/jpeg',
  fileSize: 1,
});
await renderWithProviders(<DocumentListScreen />);
expect(await screen.findByText('Счёт')).toBeOnTheScreen();
```

Pass `createFakeClock().now` to `installTestRepositories` to control timestamps. Repository behavior itself (SQL, migrations, search) is tested in `src/lib/db/*.test.ts`. For the error state, make the feature's data function reject once — `jest.spyOn(api, 'listDocuments').mockRejectedValueOnce(new Error('…'))` — and check that retry recovers. Full example: `src/features/documents/screens/document-list-screen.test.tsx`. A screen that sets its header with `<Stack.Screen options>` needs a router: render it with `renderRouter` (see `document-detail-screen.test.tsx`).

Cover: data, empty, error → retry. Restore spies in `afterEach(() => jest.restoreAllMocks())`. After a mutation, assert what the user sees change, not that `invalidateQueries` was called.

**Pure logic** — pass time in explicitly; never read `Date.now()` inside the function under test:

```ts
const plan = planReminders(deadlines, settings, new Date('2026-10-30T09:00:00+01:00'));
expect(plan).toEqual([...]);
```

Cover the cases the plan task lists (past dates, due today, time zone change, limits, repeated calls change nothing). Write calendar dates as `YYYY-MM-DD` strings, as in the data model.

**Navigation** — mount real screens in an in-memory router:

```tsx
import { renderRouter } from 'expo-router/testing-library';

await renderRouter(
  { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
  { initialUrl: '/', wrapper: createTestProviders() }
);
await user.press(await screen.findByRole('link', { name: /Счёт за газ/ }));
expect(screen).toHavePathname('/documents/doc-1');
```

**Hook** — `const { result } = await renderHook(() => useThing(), { wrapper: createTestProviders() });`

**HTTP layer** — `jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))`. See `src/lib/api/client.test.ts`. Cover each error code the UI distinguishes (SPEC §7.2) plus network failure, timeout and offline. Mock modules (e.g. `@/lib/env`) with `jest.mock(path, factory)` at the top of the file.

**API handler** — no HTTP server, no real model:

```ts
const response = await handleAnalyze(
  new Request('http://test/api/v1/analyze', { method: 'POST', body: formData }),
  { provider: new MockLlmProvider(), limits: fakeLimits, now: () => fixedNow }
);
expect(response.status).toBe(413);
expect(await response.json()).toEqual({
  error: { code: 'too_large', message: expect.any(String) },
});
```

One test per error code. If a Fetch API global is missing in the default Jest environment, add `/** @jest-environment node */` to the server test file.

**Native modules** — mock **our adapter** (`jest.mock('../scanner', ...)`), not the library: the adapter is the contract the feature relies on. `jest-expo` mocks most Expo modules for code that imports them indirectly. For a library without mocks, add `jest.mock('lib-name', () => ({ ... }))` in the test, or in a shared setup file registered via `setupFilesAfterEnv` in `jest.config.js` if many tests need it.

**Strings** — tests start in English (`src/test/setup-i18n.ts` resets the language before each test), so query by the English dictionary text or by role and name. To check Russian, `await i18n.changeLanguage('ru')` (from `@/lib/i18n/i18n`) before rendering; cover Russian plurals with counts 1, 2, 5, 11 and 21.

**Intl caveat** — Jest runs on Node with full ICU; Hermes on Android has no `Intl.PluralRules`, `Intl.Locale` or `Intl.RelativeTimeFormat` (spike 0.7). Plural tests do exercise the formatjs polyfill (it is force-installed, also in Jest), but for any other `Intl` API a green test does not prove the device has it: check on a device.

**Time** — `jest.useFakeTimers()` with `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`.

## Test data

Synthetic only. Never put real documents, names, IBANs or addresses in fixtures or snapshots (eval sets included).

For an analysis, start from `ANALYSIS_FIXTURES` in `src/shared/analysis/fixtures.ts` (invoice, official notice, contract, fraudulent invoice, unreadable) and override only the fields the test is about: `{ ...ANALYSIS_FIXTURES.invoice, summary: '…' }`. They pass `analysisResultSchema`, so the type checker and the schema both accept them.

## Bug fixes

Write the failing test first, watch it fail for the right reason, then fix. Name the test after the behavior, not the bug ID.

## Running

```bash
npx jest path/to/file.test.tsx      # one file
npx jest -t "shows an empty state"  # by name
npm test -- --coverage              # coverage report in coverage/
```

Finish with the `verify` skill. Never `.skip`, delete, or loosen an assertion just to get green — fix the code or explain why the test was wrong.
