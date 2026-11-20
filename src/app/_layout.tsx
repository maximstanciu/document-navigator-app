import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AppProviders } from '@/providers/app-providers';

export { ErrorBoundary } from 'expo-router';

// A link that opens a screen over the tabs, such as files shared from another app (CAP-11), keeps
// the documents list beneath it, so «Back» and closing the modal lead there.
export const unstable_settings = { anchor: '(tabs)' };

// Keep the splash screen until the database is migrated; DatabaseGate hides it.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="documents/[id]" options={{ title: '' }} />
        <Stack.Screen name="documents/[id]/pages" options={{ title: '' }} />
        <Stack.Screen name="cases/[id]" options={{ title: '' }} />
        <Stack.Screen name="cases/archive" options={{ title: '' }} />
        <Stack.Screen name="cases/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cases/[id]/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
    </AppProviders>
  );
}
