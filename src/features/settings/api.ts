import { clearAllReminders } from '@/features/reminders/sync-reminders';
import { getRepositories } from '@/lib/db/repositories';
import { deleteAllDocumentFiles } from '@/lib/files/page-files';

/**
 * Data access for the settings feature, no React. Settings themselves are read and written through
 * `settingsQuery()` and `useUpdateSettings()`.
 */

/**
 * «Delete all data» (STO-7, SET-3): the database first (documents, deadlines, settings…, as on a
 * fresh install), then the page files and the reminders in the OS. Each step can run again, so after
 * a failure the whole thing is simply repeated. The device id stays: it only counts analyses (§8.3).
 */
export async function deleteAllData(): Promise<void> {
  await getRepositories().wipeAll();
  await deleteAllDocumentFiles();
  await clearAllReminders();
}
