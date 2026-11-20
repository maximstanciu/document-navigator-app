import type { PropsWithChildren } from 'react';
import { FullWindowOverlay } from 'react-native-screens';

/**
 * iOS: the lock as the topmost view of the app's window. Modal screens (capture, a new case) and
 * system sheets the app presented (the scanner, the photo picker, a share sheet) are view
 * controllers above the root view, where neither a view in the tree nor a React Native `Modal`
 * presented from the root would reach; the overlay goes above what is already presented. VoiceOver
 * stays inside the lock.
 */
export function LockOverlay({ visible, children }: PropsWithChildren<{ visible: boolean }>) {
  if (!visible) return null;
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal>{children}</FullWindowOverlay>
  );
}
