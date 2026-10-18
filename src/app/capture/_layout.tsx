import { Stack } from 'expo-router';

import { CaptureSessionProvider } from '@/features/capture/capture-session';

/** The capture flow runs in its own stack inside one modal: source choice, then page review. */
export default function CaptureLayout() {
  return (
    <CaptureSessionProvider>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }} />
    </CaptureSessionProvider>
  );
}
