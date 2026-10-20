import { getRepositories } from '@/lib/db/repositories';
import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';

/**
 * Data access for deadlines and the actions that close them, no React: what the document screen
 * (DET-3, DET-4) and the Deadlines tab (REM-1) read and change. `./queries.ts` wraps it.
 */

/** Open deadlines of all documents, soonest first (REM-1, HOME-1, HOME-2). */
export function listOpenDeadlines(): Promise<DeadlineRecord[]> {
  return getRepositories().deadlines.list({ statuses: ['open'] });
}

/** Actions due by a deadline, of all documents (DET-3): the Deadlines tab shows them with it. */
export function listDatedActions(): Promise<ActionRecord[]> {
  return getRepositories().actions.listDated();
}

/** Each active document's title by its id: the Deadlines tab names the document of a deadline. */
export async function listDocumentTitles(): Promise<Map<string, string>> {
  const documents = await getRepositories().documents.listTitles();
  return new Map(documents.map((document) => [document.id, document.title]));
}

/** «Done» on an action; its deadline closes or reopens with it (REM-9). */
export function setActionDone(id: string, done: boolean): Promise<void> {
  return getRepositories().actions.setDone(id, done);
}

/** «Done» on a deadline without actions (REM-9). */
export async function setDeadlineDone(id: string, done: boolean): Promise<void> {
  await getRepositories().deadlines.update(id, { status: done ? 'done' : 'open' });
}

/** «Not relevant» (DET-4, US-12): the deadline stays, collapsed, and gets no reminders. */
export async function dismissDeadline(id: string): Promise<void> {
  await getRepositories().deadlines.update(id, { status: 'dismissed' });
}

/** «Change date» (US-8, DET-4): the person's date, kept through a re-analysis (ANL-8). */
export function changeDeadlineDate(id: string, dueDate: string): Promise<void> {
  return getRepositories().deadlines.changeDate(id, dueDate);
}

/** «Restore» of a deadline marked «Not relevant» (DET-4). */
export function restoreDeadline(id: string): Promise<void> {
  return getRepositories().deadlines.restore(id);
}
