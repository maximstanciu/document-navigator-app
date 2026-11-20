import type { PropsWithChildren } from 'react';
import { BackHandler, Modal } from 'react-native';

/**
 * Android (and web): the lock in a dialog window of its own, above the app's screens and above a
 * bottom sheet left open (also a dialog). «Back» leaves the app instead of reaching the screens
 * behind. iOS: lock-overlay.ios.tsx.
 */
export function LockOverlay({ visible, children }: PropsWithChildren<{ visible: boolean }>) {
  return (
    <Modal
      visible={visible}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => BackHandler.exitApp()}>
      {children}
    </Modal>
  );
}
