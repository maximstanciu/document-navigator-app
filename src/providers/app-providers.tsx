import '@/lib/i18n/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ReminderSync } from '@/features/reminders/components/reminder-sync';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createQueryClient, useAppStateFocusManager } from '@/lib/query-client';

import { DatabaseGate } from './database-gate';
import { LanguageSync } from './language-sync';

/** Every app-wide provider, in one place. Tests use a lighter wrapper: `@/test/render`. */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  const colorScheme = useColorScheme();
  useAppStateFocusManager();

  return (
    // Gestures beyond taps (dragging pages on the capture review, CAP-6) need this at the root.
    <GestureHandlerRootView>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <DatabaseGate>
            <LanguageSync />
            <ReminderSync />
            {children}
          </DatabaseGate>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
