import { useLocalSearchParams } from 'expo-router';

import { PageViewerScreen } from '@/features/documents/screens/page-viewer-screen';

export default function DocumentPagesRoute() {
  // `page` is the 1-based page number, as people read it in a link.
  const { id, page } = useLocalSearchParams<{ id: string; page?: string }>();
  return <PageViewerScreen id={id} initialIndex={(Number.parseInt(page ?? '', 10) || 1) - 1} />;
}
