import type { ActionRecord, DeadlineRecord, DocumentRecord } from '@/lib/db/types';

/** A row in the documents list. HOME-2 adds type and nearest deadline in task 4.5. */
export type DocumentSummary = Pick<
  DocumentRecord,
  'id' | 'title' | 'status' | 'senderName' | 'pageCount' | 'createdAt'
>;

/** Everything the document screen shows about the document itself (DET-1…DET-10). */
export type DocumentDetail = DocumentSummary &
  Pick<
    DocumentRecord,
    | 'documentType'
    | 'documentDate'
    | 'analyzedAt'
    | 'mimeType'
    | 'errorCode'
    | 'fileSize'
    | 'analysis'
  >;

/** A page of the original. `uri` is `null` when its file is gone from the device (STO-8). */
export type DocumentPage = { id: string; index: number; uri: string | null };

/**
 * Deadlines that have actions show inside the action list, once, with their actions (DET-3);
 * `deadline` is `null` for the actions without a date.
 */
export type ActionGroup = { deadline: DeadlineRecord | null; actions: ActionRecord[] };
