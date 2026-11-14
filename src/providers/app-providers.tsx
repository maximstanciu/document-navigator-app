import '@/lib/i18n/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Colors, Fonts } from '@/constants/theme';
import { AnalysisJobsSync } from '@/features/analysis/components/analysis-jobs-sync';
import { DeadlineNotificationActions } from '@/features/deadlines/components/deadline-notification-actions';
import { NotificationOpener } from '@/features/reminders/components/notification-opener';
import { ReminderSync } from '@/features/reminders/components/reminder-sync';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppFonts } from '@/lib/fonts';
import { createQueryClient, useAppStateFocusManager } from '@/lib/query-client';

import { DatabaseGate } from './database-gate';
import { LanguageSync } from './language-sync';

/** Headers and the navigator's own surfaces in the app's colors and type. */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
    fonts: {
      regular: { fontFamily: Fonts.sans, fontWeight: '400' },
      medium: { fontFamily: Fonts.sans, fontWeight: '500' },
      bold: { fontFamily: Fonts.sans, fontWeight: '600' },
      heavy: { fontFamily: Fonts.sans, fontWeight: '700' },
    },
  };
}

/** Every app-wide provider, in one place. Tests use a lighter wrapper: `@/test/render`. */
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  const colorScheme = useColorScheme();
  useAppStateFocusManager();
  useAppFonts();

  return (
    // Gestures beyond taps (dragging pages on the capture review, CAP-6) need this at the root.
    <GestureHandlerRootView>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navigationTheme(colorScheme === 'dark' ? 'dark' : 'light')}>
          <DatabaseGate>
            <LanguageSync />
            <ReminderSync />
            <AnalysisJobsSync />
            {children}
            {/* After the navigator, so its effect runs once the root stack is mounted (REM-6). */}
            <NotificationOpener />
            <DeadlineNotificationActions />
          </DatabaseGate>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
