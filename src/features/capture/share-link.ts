/** The capture route that takes the files another app shared (CAP-11). */
export const SHARED_FILES_PATH = '/capture/shared';

/**
 * The link expo-sharing opens the app with when another app shares files into it: Android turns
 * the «Share» intent into `<scheme>://expo-sharing`. Any scheme, so a development build's matches.
 */
const SHARE_LINK = /^[a-z][a-z0-9+.-]*:\/\/expo-sharing(?:[/?#]|$)/i;

/**
 * Where a link the OS opened the app with leads (src/app/+native-intent.ts): a share goes to the
 * capture route that takes the shared files, any other link stays as it is. Each share gets its own
 * `share` key, so one that arrives while that route is open still reaches it: the screen takes the
 * files again when the key changes.
 */
export function redirectShareLink(path: string, shareKey = String(Date.now())): string {
  return SHARE_LINK.test(path) ? `${SHARED_FILES_PATH}?share=${shareKey}` : path;
}
