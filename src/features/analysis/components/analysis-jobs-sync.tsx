import { useAnalysisJobsPolling } from '../queries';

/**
 * Checks the analysis jobs at startup, on return to the foreground and every 10 s while one waits
 * (SPEC §7.2 «Опрос»), whatever screen is open: a result is stored as soon as it is ready, and
 * queued deletions are sent again. Mount once, inside the database gate.
 */
export function AnalysisJobsSync() {
  useAnalysisJobsPolling();
  return null;
}
