import { useLocalSearchParams } from 'expo-router';

import { CaptureSourceScreen } from '@/features/capture/screens/capture-source-screen';

export default function CaptureRoute() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  return <CaptureSourceScreen caseId={caseId} />;
}
