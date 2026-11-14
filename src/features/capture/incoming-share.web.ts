import type { SharedFilesResult } from './incoming-share';

export type { SharedFilesResult } from './incoming-share';

/** Web has no «Share» into the app (CAP-10, CAP-11): the shared-files route shows the source choice. */
export async function takeSharedFiles(): Promise<SharedFilesResult> {
  return { status: 'none' };
}
