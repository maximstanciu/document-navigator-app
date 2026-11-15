import { useLocalSearchParams } from 'expo-router';

import { NewCaseScreen } from '@/features/cases/screens/new-case-screen';

export default function NewCaseRoute() {
  const { documentId, withDocumentId } = useLocalSearchParams<{
    documentId?: string;
    withDocumentId?: string;
  }>();
  return <NewCaseScreen documentId={documentId} withDocumentId={withDocumentId} />;
}
