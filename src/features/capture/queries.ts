import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dbKeys } from '@/lib/db/query-keys';
import type { DocumentSource } from '@/lib/db/types';

import { saveDraft } from './api';
import type { CapturedPage } from './types';

/** Saves the reviewed pages as a draft document and refreshes the documents list. */
export function useSaveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      source,
      pages,
      caseId = null,
    }: {
      source: DocumentSource;
      pages: readonly CapturedPage[];
      caseId?: string | null;
    }) => saveDraft(source, pages, caseId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
        queryClient.invalidateQueries({ queryKey: dbKeys.pages.all() }),
      ]),
  });
}
