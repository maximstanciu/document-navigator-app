import { useLocalSearchParams } from 'expo-router';

import { DocumentDetailScreen } from '@/features/documents/screens/document-detail-screen';

export default function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentDetailScreen id={id} />;
}
