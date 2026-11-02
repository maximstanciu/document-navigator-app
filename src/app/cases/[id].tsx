import { useLocalSearchParams } from 'expo-router';

import { CaseScreen } from '@/features/documents/screens/case-screen';

export default function CaseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaseScreen id={id} />;
}
