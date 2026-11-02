import { useLocalSearchParams } from 'expo-router';

import { AddToCaseScreen } from '@/features/documents/screens/add-to-case-screen';

export default function AddToCaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AddToCaseScreen caseId={id} />;
}
