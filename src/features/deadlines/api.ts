import { remindTomorrowAt } from '@/features/reminders/plan-reminders';
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

/** What a reminder's button changed, for the Deadlines tab to show and undo (REM-15). */
export type NotificationOutcome =
  | {
      kind: 'done';
      deadlineId: string;
      description: string;
      /** The actions the button ticked; none for a deadline without actions, closed itself. */
      actionIds: string[];
    }
  | { kind: 'snoozed'; deadlineId: string; remindAt: string };

/** The deadline a reminder's button is about, if it is still open: otherwise the button does nothing. */
async function openDeadline(id: string): Promise<DeadlineRecord | null> {
  const deadline = await getRepositories().deadlines.get(id);
  return deadline?.status === 'open' ? deadline : null;
}

/**
 * «Done» on a reminder's notification (REM-15): closes the deadline as the Deadlines tab would
 * (REM-9) — a deadline without actions itself, one with actions by ticking every action still open.
 * `null` when the deadline is already closed or gone: nothing changes.
 */
export async function completeFromNotification(
  deadlineId: string
): Promise<NotificationOutcome | null> {
  const deadline = await openDeadline(deadlineId);
  if (!deadline) return null;
  const { deadlines, actions } = getRepositories();
  const all = await actions.listByDeadline(deadlineId);
  if (all.length === 0) {
    await deadlines.update(deadlineId, { status: 'done' });
    return { kind: 'done', deadlineId, description: deadline.description, actionIds: [] };
  }
  const open = all.filter((action) => !action.done);
  for (const action of open) await actions.setDone(action.id, true);
  return {
    kind: 'done',
    deadlineId,
    description: deadline.description,
    actionIds: open.map((action) => action.id),
  };
}

/**
 * «Undo» after «Done» from a notification: reopens exactly what the button closed — the deadline
 * itself, or the actions it ticked, which reopen the deadline with them (REM-9).
 */
export async function undoCompleteFromNotification(
  outcome: Extract<NotificationOutcome, { kind: 'done' }>
): Promise<void> {
  if (outcome.actionIds.length === 0) {
    await setDeadlineDone(outcome.deadlineId, false);
    return;
  }
  for (const id of outcome.actionIds) await setActionDone(id, false);
}

/**
 * «Remind tomorrow» on a reminder's notification (REM-15): one more reminder tomorrow at the reminder
 * time (SET-2). `null` when the deadline is already closed or gone: nothing changes.
 */
export async function snoozeFromNotification(
  deadlineId: string,
  now: Date
): Promise<NotificationOutcome | null> {
  if (!(await openDeadline(deadlineId))) return null;
  const { deadlines, settings } = getRepositories();
  const remindAt = remindTomorrowAt(now, (await settings.get()).reminderTime);
  await deadlines.update(deadlineId, { snoozedUntil: remindAt });
  return { kind: 'snoozed', deadlineId, remindAt };
}
