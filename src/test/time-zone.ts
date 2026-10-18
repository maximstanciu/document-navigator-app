/**
 * Test-only: puts the device in `timeZone` (an IANA name such as `Europe/Berlin`), so `Date` gives
 * local times there. Needs `/** @jest-environment ./src/test/time-zone-environment.js *\/` in the
 * test file; the zone is restored after that file.
 */
export function setTimeZone(timeZone: string) {
  const set = (globalThis as { __setTimeZone?: (timeZone: string) => void }).__setTimeZone;
  if (!set)
    throw new Error('setTimeZone() needs the ./src/test/time-zone-environment.js environment');
  set(timeZone);
}
