import { Stack } from 'expo-router';

/** The capture flow runs in its own stack inside one modal: source choice, then page review (2.5). */
export default function CaptureLayout() {
  return <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }} />;
}
