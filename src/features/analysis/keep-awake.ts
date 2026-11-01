import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Keeps the screen on until the returned function is called: while the pages upload (ANL-3, D-1),
 * since a sleeping screen sends the app to the background, and the upload breaks off. Tags let
 * several uploads overlap: the screen may sleep again once each has released its own. Best effort:
 * where the platform refuses (a browser without the Wake Lock API, a hidden tab), the upload runs
 * without it.
 */
export function keepScreenAwake(tag: string): () => void {
  const activated = activateKeepAwakeAsync(tag).then(
    () => true,
    () => false
  );
  return () => {
    void activated
      .then((active) => (active ? deactivateKeepAwake(tag) : undefined))
      .catch(() => {});
  };
}
