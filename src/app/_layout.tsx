import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AppProviders } from '@/providers/app-providers';

export { ErrorBoundary } from 'expo-router';

// Keep the splash screen until the database is migrated; DatabaseGate hides it.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="documents/[id]" options={{ title: '' }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </AppProviders>
  );
}
