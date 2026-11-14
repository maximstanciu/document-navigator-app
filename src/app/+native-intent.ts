import { redirectShareLink } from '@/features/capture/share-link';

/** Links the OS opens the app with, before Expo Router reads them: files shared from other apps (CAP-11). */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return redirectShareLink(path);
}
