import { useSyncExternalStore } from 'react';

import type { NotificationOutcome } from './api';

/**
 * What the last press on a reminder's button changed (REM-15), from `DeadlineNotificationActions` to
 * the Deadlines tab, which shows it: «Undo» after «Done», the time after «Remind tomorrow». It lives
 * until the next change on the tab, until the person leaves the tab, or until the next press.
 * Screen state only: the change itself is already in the database.
 */
let current: NotificationOutcome | null = null;
const listeners = new Set<() => void>();

function set(next: NotificationOutcome | null) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function showNotificationOutcome(outcome: NotificationOutcome): void {
  set(outcome);
}

export function clearNotificationOutcome(): void {
  set(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => current;

export function useNotificationOutcome(): NotificationOutcome | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
