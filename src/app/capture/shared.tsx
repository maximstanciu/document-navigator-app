import { useLocalSearchParams } from 'expo-router';

import { CaptureSourceScreen } from '@/features/capture/screens/capture-source-screen';

/** Files shared from another app (CAP-11): src/app/+native-intent.ts leads each share here. */
export default function CaptureSharedRoute() {
  const { share } = useLocalSearchParams<{ share?: string }>();
  return <CaptureSourceScreen share={share ?? ''} />;
}
