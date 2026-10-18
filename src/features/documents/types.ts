import type { ActionRecord, DeadlineRecord, DocumentRecord } from '@/lib/db/types';

/**
 * A row in the documents list (HOME-2) and what the «Needs attention» rule needs to know about the
 * analysis (HOME-1), without carrying the analysis itself.
 */
export type DocumentSummary = Pick<
  DocumentRecord,
  | 'id'
  | 'title'
  | 'status'
  | 'documentType'
  | 'senderName'
  | 'pageCount'
  | 'createdAt'
  | 'analyzedAt'
  | 'attentionDismissedAt'
> & {
  /** The analysis found signs of fraud (ANL-11). */
  hasFraudSignals: boolean;
  /** The analysis found at least one high risk (DET-5). */
  hasHighRisk: boolean;
};

/** An open deadline as the documents list shows it: the nearest one on a card (HOME-2, HOME-1). */
export type DeadlineSummary = Pick<
  DeadlineRecord,
  'id' | 'documentId' | 'description' | 'dueDate' | 'dueTime'
>;

/** Everything the document screen shows about the document itself (DET-1…DET-10). */
export type DocumentDetail = DocumentSummary &
  Pick<DocumentRecord, 'documentDate' | 'mimeType' | 'errorCode' | 'fileSize' | 'analysis'>;

/** A page of the original. `uri` is `null` when its file is gone from the device (STO-8). */
export type DocumentPage = { id: string; index: number; uri: string | null };

/**
 * Deadlines that have actions show inside the action list, once, with their actions (DET-3);
 * `deadline` is `null` for the actions without a date.
 */
export type ActionGroup = { deadline: DeadlineRecord | null; actions: ActionRecord[] };
