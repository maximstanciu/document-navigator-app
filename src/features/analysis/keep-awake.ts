import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Keeps the screen on until the returned function is called (D-1: a sleeping screen sends the app
 * to the background, and its analysis request breaks off). Tags let several analyses overlap: the
 * screen may sleep again once each has released its own. Best effort: where the platform refuses
 * (a browser without the Wake Lock API, a hidden tab), the analysis runs without it.
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
