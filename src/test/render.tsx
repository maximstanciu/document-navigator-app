import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';

/** Fresh client per test: no retries (errors surface immediately), no cache shared across tests. */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function createTestProviders(queryClient = createTestQueryClient()) {
  return function TestProviders({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** `render` with the app's data providers. Returns the query client so tests can seed or inspect it. */
export async function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    ...options
  }: RenderOptions & { queryClient?: QueryClient } = {}
) {
  const result = await render(ui, { wrapper: createTestProviders(queryClient), ...options });
  return { ...result, queryClient };
}
