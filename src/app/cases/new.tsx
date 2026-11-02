import { useLocalSearchParams } from 'expo-router';

import { NewCaseScreen } from '@/features/cases/screens/new-case-screen';

export default function NewCaseRoute() {
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  return <NewCaseScreen documentId={documentId} />;
}
