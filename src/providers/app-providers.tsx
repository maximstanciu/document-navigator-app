import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { createQueryClient, useAppStateFocusManager } from '@/lib/query-client';

/** Every app-wide provider, in one place. Tests use a lighter wrapper: `@/test/render`. */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  const colorScheme = useColorScheme();
  useAppStateFocusManager();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
