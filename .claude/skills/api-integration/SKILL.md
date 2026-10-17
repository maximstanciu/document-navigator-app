---
name: api-integration
description: Connect the app to a backend endpoint the project's way — typed endpoint functions on the shared apiClient, React Query queryOptions and mutations, cache invalidation, auth headers, env config, and tests. Use when the user asks to fetch, load, save, sync, call an API/endpoint, add a mutation, handle auth tokens, or replace fixtures with a real backend.
argument-hint: '<METHOD /path> [feature]'
---

# API integration

Three layers, each in one place:

| Layer     | File                          | Knows about                             |
| --------- | ----------------------------- | --------------------------------------- |
| HTTP      | `src/lib/api/client.ts`       | base URL, JSON, auth header, `ApiError` |
| Endpoints | `src/features/<f>/api.ts`     | paths, request/response types           |
| Cache     | `src/features/<f>/queries.ts` | query keys, invalidation                |

Screens only call hooks: `useQuery(documentQueries.list())`, `useCreateDocument()`. Never `fetch` or `useEffect`-load data in a component.

Reference: `src/features/documents/{api,queries}.ts`, `src/lib/api/client.ts`, `src/lib/query-client.ts`.

## 1. Config

- Base URL comes from `EXPO_PUBLIC_API_URL` via `env.apiUrl` (`src/lib/env.ts`). Developers put it in `.env.local` (see `.env.example`); EAS builds get it from EAS environment variables.
- New config → add to `.env.example` **and** `src/lib/env.ts` with direct `process.env.EXPO_PUBLIC_X` access (Expo inlines only that form).
- `EXPO_PUBLIC_*` ships inside the app. Secrets (API keys with write access, signing keys) never go in the client — they belong on the server.

## 2. Endpoint function (`api.ts`)

```ts
export async function fetchDocuments(signal?: AbortSignal) {
  return apiClient.get<DocumentSummary[]>('/documents', { signal, query: { page: 1 } });
}

export async function createDocument(input: DocumentInput) {
  return apiClient.post<DocumentDetail>('/documents', { body: input });
}
```

- One function per endpoint. Typed return. Accept `signal` on reads so React Query can cancel.
- Encode path params: `` `/documents/${encodeURIComponent(id)}` ``.
- Map server shapes to app types here if they differ (snake_case → camelCase, date strings, etc.) — screens see clean types only.
- If the backend isn't trusted to match the types, validate at this boundary (e.g. add `zod` with `npx expo install zod` and `schema.parse(data)`).
- Keep the fixtures fallback (`if (!env.apiUrl) ...`) only while the backend doesn't exist; remove it once it does.

## 3. Queries (`queries.ts`)

```ts
export const documentQueries = {
  all: () => ['documents'] as const,
  list: (filters?: { q?: string }) =>
    queryOptions({
      queryKey: [...documentQueries.all(), 'list', filters ?? {}],
      queryFn: ({ signal }) => fetchDocuments(signal),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...documentQueries.all(), 'detail', id],
      queryFn: ({ signal }) => fetchDocument(id, signal),
    }),
};
```

Keys are hierarchical so `invalidateQueries({ queryKey: documentQueries.all() })` refreshes the whole feature. Everything the fetch depends on goes in the key.

## 4. Mutations

```ts
export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDocument,
    onSuccess: (created) => {
      queryClient.setQueryData(documentQueries.detail(created.id).queryKey, created);
      return queryClient.invalidateQueries({ queryKey: documentQueries.all() });
    },
  });
}
```

In the screen: disable the submit button while `isPending`, show `error` inline, navigate on success. Use optimistic updates (`onMutate` + rollback in `onError`) only where latency is visible and the operation rarely fails.

## 5. Errors, retries, auth

- Non-2xx → `ApiError` with `status` and parsed `body`. `createQueryClient()` already skips retries for 4xx; check `error instanceof ApiError && error.status === 404` for specific UI.
- Auth: call `setAccessTokenGetter(() => token)` once at sign-in (and `undefined` at sign-out). Store tokens with `expo-secure-store`, not AsyncStorage. On 401, clear the session and redirect to sign-in in one central place (e.g. a `QueryCache({ onError })` in `createQueryClient`), not per screen.
- App foreground refetch is already wired (`useAppStateFocusManager`). For connectivity-aware behavior, connect React Query's `onlineManager` to `expo-network` (check its current API in the versioned docs).

## 6. Tests

- `api.ts`: mock `fetch` with `jest.spyOn(globalThis, 'fetch')` and assert URL/method/body, or test the fixture path. Example: `src/lib/api/client.test.ts`.
- Screens: stub the endpoint function, not React Query — `jest.spyOn(api, 'fetchDocuments').mockResolvedValue([...])` — and render with `renderWithProviders` (fresh `QueryClient`, retries off). Example: `document-list-screen.test.tsx`.

Then run the `verify` skill.
