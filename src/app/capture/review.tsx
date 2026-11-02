import { useLocalSearchParams } from 'expo-router';

import { CaptureReviewScreen } from '@/features/capture/screens/capture-review-screen';

export default function CaptureReviewRoute() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  return <CaptureReviewScreen caseId={caseId} />;
}
