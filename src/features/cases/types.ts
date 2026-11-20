import type { CaseRecord } from '@/lib/db/types';

/** A case as the screens show it (CASE-1); `archivedAt` set — in the archive (CASE-6). */
export type CaseSummary = Pick<CaseRecord, 'id' | 'name' | 'createdAt' | 'archivedAt'>;

/** A case's name fits a chip on the Documents tab and the header of its screen (CASE-1). */
export const MAX_CASE_NAME_LENGTH = 60;
