import type { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  /** The accessible name of the backdrop, which closes the sheet. */
  closeLabel: string;
}>;

/**
 * A sheet from the bottom over a scrim, for a short list of choices. Confirmations belong inside the
 * sheet too: a system alert shown while a modal closes is unreliable on iOS. Not for text input: the
 * keyboard would cover it.
 */
export function BottomSheet({ visible, onClose, closeLabel, children }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <Pressable
          role="button"
          aria-label={closeLabel}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <ThemedView
          aria-modal
          style={[
            styles.sheet,
            { borderColor: theme.border, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          {children}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '80%',
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
