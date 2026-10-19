import { getRepositories } from '@/lib/db/repositories';

/**
 * Data access for deadlines and the actions that close them, no React: what the document screen
 * (DET-3, DET-4) and the Deadlines tab (task 5.4) change. `./queries.ts` wraps it.
 */

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
