---
name: api-integration
description: Wire data into the app the project's way — local SQLite data through repositories in src/lib/db and React Query, calls to this app's own API routes (/api/v1/*) through apiClient, and the server side of those routes (thin +api.ts, handlers in src/server, MockLlmProvider tests). Use when the user asks to load, save, store, query, cache, invalidate, add a mutation, call or add an endpoint/API route, handle request errors, or change env config.
argument-hint: '<what data or endpoint> [feature]'
---

# Data and API integration

Read first: `AGENTS.md` (Conventions → Data is local-first, Server code, Shared code), `docs/SPEC.md` §6 (data model) and §7 (API contract, error codes). This skill describes the target architecture; folders marked _planned_ in `AGENTS.md` are created by the plan task named there — create them exactly there.

Data has two sources, and components never touch either directly:

| Source                                                      | Lives in                                         | Reached through                                       |
| ----------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Local data (documents, pages, deadlines, actions, settings) | SQLite on the device                             | `getRepositories()` from `src/lib/db/repositories.ts` |
| Analysis and limits                                         | this app's API routes `/api/v1/*` on EAS Hosting | `apiClient` (`src/lib/api/client.ts`)                 |

Screens and components only call hooks: `useQuery(deadlineQueries.list())`, `useMarkDeadlineDone()`. No `fetch`, no direct DB calls, no `useEffect` data loading.

> Reference: `src/features/documents` is the reference local-data feature: `api.ts` reads through `getRepositories()`, `queries.ts` uses `dbKeys` + `localQueryDefaults`, screen tests seed an in-memory database.

## 1. Local data (most features)

**Layers**

| Layer        | File                          | Knows about                                                      |
| ------------ | ----------------------------- | ---------------------------------------------------------------- |
| Storage      | `src/lib/db/`                 | opening SQLite, migrations, one repository per table, query keys |
| Feature data | `src/features/<f>/api.ts`     | calls repositories, maps rows to feature types; no React         |
| Cache        | `src/features/<f>/queries.ts` | `queryOptions` for reads, mutation hooks, invalidation           |

- Repositories are plain SQL over a small `SqlDatabase` interface (`database.ts`): expo-sqlite in the app, Node's `node:sqlite` in Jest. Every query goes through one serial queue; inside `db.transaction(async (tx) => ...)` use **only** `tx`, or the call deadlocks.
- New table or column → a new entry in `migrations.ts` (never edit a shipped one), a repository function, a test on the in-memory database.
- `search_text` is derived by the documents repository from title, sender, summary and key facts (HOME-3); features never write it.
- **Query keys come from `src/lib/db`**, per table, not invented per feature. A mutation in one feature (analysis writes deadlines) must be able to invalidate what another feature reads (the Deadlines tab).
- No other feature's internals: if you need a table, use its repository from `src/lib/db`.

**Reads**

```ts
export const deadlineQueries = {
  list: () =>
    queryOptions({
      queryKey: dbKeys.deadlines.list({ statuses: ['open'] }),
      queryFn: () => getRepositories().deadlines.list({ statuses: ['open'] }),
      ...localQueryDefaults, // staleTime: Infinity, no retries, no refetch on focus
    }),
};
```

Local queries always spread `localQueryDefaults` from `src/lib/db/query-keys.ts`. The network-oriented defaults in `createQueryClient()` are for API queries only.

**Writes**

```ts
export function useMarkDeadlineDone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getRepositories().deadlines.update(id, { status: 'done' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() });
      await syncReminders(); // explicit shared function from features/reminders
    },
  });
}
```

- Invalidate **every** table the write touched (documents + deadlines + actions after an analysis).
- Side effects that other features own go through their explicitly shared functions (`syncReminders()`), never through their internals, and never in a cycle (`documents → analysis → reminders`, `deadlines → reminders`, `settings → reminders`).
- Deleting a document wipes its content immediately (STO-6): `documents.remove()` returns the page paths and notification ids; delete the files with `deleteDocumentFiles()` from `src/lib/files/page-files.ts` and cancel the reminders. Store only relative page paths (STO-3).

## 2. Calling the app's API routes

The app calls two endpoints: `POST /api/v1/analyze` and `GET /api/v1/limits` (SPEC §7.2). Their client functions live in `features/analysis/api.ts` (and settings for limits). `GET /api/v1/metrics` is for the team only (bearer `METRICS_TOKEN`), never called from the app.

- Base URL: `EXPO_PUBLIC_API_URL` via `env.apiUrl` (`src/lib/env.ts`). New public config → `.env.example` **and** `src/lib/env.ts` with direct `process.env.EXPO_PUBLIC_X` access. Never secrets in `EXPO_PUBLIC_*`.
- Request types and the response schema come from `src/shared/`: the zod schema is the single source of truth. Validate the response at the boundary (`analyzeResponseSchema.parse` from `@/shared/analysis/contract`); error codes are `ANALYZE_ERROR_CODES` there.
- Headers on every call: `X-Device-Id`, `X-App-Version`, `X-Platform` (SPEC §7.2). `apiClient` adds them itself (`src/lib/api/client-headers.ts`). There are no accounts in MVP; `setAccessTokenGetter` stays unused.
- `apiClient` sends a `FormData` body as it is (multipart, no JSON `Content-Type`) and takes `timeoutMs`, which aborts the request with `ApiTimeoutError`; `ApiError` keeps the response `headers` (`Retry-After`).
- `useAnalyzeDocument()` (`features/analysis/queries.ts`) is a mutation **without retries** and with `networkMode: 'always'`, `multipart/form-data`, 90 s client timeout. `analyzeDocument()` in `features/analysis/api.ts` owns the document's way through `analyzing` to `ready` or `failed`, with the screen kept on meanwhile (D-1 = A, ANL-3). Files go up through the `upload-file` adapter: an `expo-file-system` `File` on native, a Blob on web. Never React Native's `{ uri, name, type }` part: since SDK 58 the global `fetch` on Android and iOS is `expo/fetch`, which rejects it («Unsupported FormDataPart implementation»), and the error surfaces as `network`.
- Errors: server errors are `{ error: { code, message } }` → `ApiError`. Network `TypeError`, timeout, offline (`isOnline()` from `src/lib/network.ts` first, ANL-10), missing page files and app restart mid-analysis map to `ClientErrorCode`. The mapping happens **once**, in `features/analysis/errors.ts` (`toAnalysisError`), not per screen. A `5xx` without a JSON body (isolate crash, spike 0.2) is `unavailable`.
- Never log or send to crash reporting the document or its analysis — metadata only.

## 3. Writing an API route (server side)

```
src/app/api/v1/analyze+api.ts            thin: parse request, call the handler, return its Response
src/server/analysis/handle-analyze.ts     validation, limits, provider call, post-processing
src/server/analysis/providers/*.ts        LlmProvider implementations (mock + the chosen one)
src/shared/analysis/*.ts                  zod schema, API contract, toLlmJsonSchema(), fixtures
src/shared/limits.ts                      pages and bytes per document (no react/react-native/expo imports)
```

```ts
// src/app/api/v1/analyze+api.ts
import { handleAnalyze } from '@/server/analysis/handle-analyze';

export function POST(request: Request) {
  return handleAnalyze(request, createAnalyzeDeps());
}
```

- Handlers take their dependencies (provider, counter store, limits, log, clock) as an argument so tests can pass fakes; `createServerDeps()` (`src/server/server-deps.ts`) builds the shared ones from server env vars and `createAnalyzeDeps()` adds the provider. In tests use `testServerDeps()` from `src/server/testing/server-deps.ts`: counters in memory, a clock that moves only with `advance()`, logs in `events`.
- Limits and beta metrics go through `AnalysisUsage` (`src/server/limits/`): `begin()` before the body is read (429/503 with `Retry-After`), `end()` with the outcome; the device is charged only for a `200`. Counters live in a `CounterStore` (Redis commands; Upstash REST on EAS Hosting, `MemoryCounterStore` otherwise); keys come from `usage-keys.ts` with pseudonyms, never raw ids or IPs. A store failure lets the analysis through and logs `limits.unavailable`. `MockLlmProvider` is used when `LLM_PROVIDER` is unset; it returns `ANALYSIS_FIXTURES` from `src/shared/analysis/fixtures.ts` (`LLM_MOCK_FIXTURE` picks one, `LLM_MOCK_DELAY_MS` makes it slow).
- Check a request with the helpers in `src/server/http/` (`readClientHeaders()`, `readMultipartForm()` with a byte limit) and fail with `throw new ApiFailure(code, message)`; the handler turns it into the SPEC §7.2 body.
- The provider sends `toLlmJsonSchema()` as its structured-output schema: the model's output without `schemaVersion`, which the server adds. `finalizeAnalysis()` checks the output's shape with `llmAnalysisShapeSchema` (a failure there is worth a retry), then `postProcessAnalysis()` repairs bounds, dates, pages and `deadlineId` links, and the result always passes the strict `analysisResultSchema`.
- Return the SPEC §7.2 error codes with the JSON error body. Unsupported methods get 405 automatically.
- Runtime is Cloudflare Workers on EAS Hosting: no native binaries, in-memory `fs`, ~250 MB per isolate **shared by concurrent requests**, and on the Free plan 10 ms CPU per request, enforced after a burst of heavy requests (`504 CPU time limit exceeded`, re-measured in task 3.1). Keep at most ~3× the upload size in memory: drop references to `File`/`ArrayBuffer` after encoding, before awaiting the model (spike 0.2, `docs/spikes/0.2-eas-hosting.md`). A client disconnect cancels the handler, so charge the daily limit only after the model responds.
- Global `FormData` types in this project come from React Native; give uploaded files their own minimal type in server code.
- Secrets via `process.env` only in `src/server/**`. `src/server` is imported only from `src/app/api/**`; server code may import only `src/server`, `src/shared` and `expo-server` (ESLint enforces both). `npm run check:bundle` fails if an `LLM_*` name reaches a client bundle.
- Logs: latency, tokens, cost, error code, hashed device id — never content (SPEC §7.1). Log through the handler's `deps.log` (`ServerLog` from `src/server/logs/server-log.ts`, one JSON line per event) with numbers, flags and closed sets of words only; no titles, file names, model output or error messages. Hash device ids with `hashDeviceId()` from `src/server/privacy/`. Rethrow unexpected errors through `redactError()` so crash reports carry no message. Test that a request's content never reaches the log (`handle-analyze.test.ts` shows the check).

## 4. Tests

- Feature data and screens: `await installTestRepositories()` from `@/test/sqlite` (real SQLite in memory, installed as `getRepositories()`), seed through the repositories, render with `renderWithProviders`; `setRepositories(null)` in `afterEach`. Don't mock React Query or SQLite.
- API client functions: `jest.spyOn(globalThis, 'fetch')` and assert URL, method, headers and body; cover every error code the UI distinguishes (`src/lib/api/client.test.ts` shows the pattern).
- Handlers: call `handleX(new Request(url, { method, body }), fakeDeps)` and assert on the `Response` (status, JSON). One test per SPEC §7.2 error code. Server tests start with `/** @jest-environment node */` and build requests and PDFs with `src/server/testing/analyze-request.ts` (server code can't import `@/test`). Jest's stream globals come from another realm than Node's `fetch`, so `pipeThrough()` on a request body fails there: wrap the reader in a plain `ReadableStream` instead.
- Pure post-processing (dates, `deadlineId` links, trimming) gets plain unit tests.

Then run the `verify` skill.
