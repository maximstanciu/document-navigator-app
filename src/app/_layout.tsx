import { Stack } from 'expo-router';

import { AppProviders } from '@/providers/app-providers';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="documents/[id]" options={{ title: '' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </AppProviders>
  );
}
