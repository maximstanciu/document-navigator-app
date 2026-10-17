import type { DocumentRecord } from '@/lib/db/types';

/** A row in the documents list. HOME-2 adds type and nearest deadline in task 4.5. */
export type DocumentSummary = Pick<
  DocumentRecord,
  'id' | 'title' | 'status' | 'senderName' | 'pageCount' | 'createdAt'
>;

/** What the document screen shows until the full analysis blocks arrive in task 4.2. */
export type DocumentDetail = DocumentSummary &
  Pick<DocumentRecord, 'documentDate' | 'analyzedAt' | 'mimeType'>;
