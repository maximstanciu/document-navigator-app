import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** «⋯» in the header of the document screen: opens the document's actions (DET-9). */
export function DocumentActionsButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Pressable
      role="button"
      aria-label={t('documents.actions.open')}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'ellipsis.circle', android: 'more_vert', web: 'more_horiz' }}
        size={24}
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

type Confirmation = 'reanalyze' | 'delete';

type DocumentActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The document's title, so it's clear what the actions apply to. */
  title: string;
  /**
   * Only a ready document with all its page files is analyzed again; a draft or a failed one has
   * its own button.
   */
  canReanalyze: boolean;
  onRename: () => void;
  onReanalyze: () => void;
  onDelete: () => void;
};

/**
 * The document's actions (DET-9): «Rename», «Analyze again» and «Delete», as a sheet from the
 * bottom. Analyzing again and deleting ask first, in the same sheet (ANL-8, STO-6): a system alert
 * shown while a modal closes is unreliable on iOS.
 */
export function DocumentActionsSheet({
  visible,
  onClose,
  title,
  canReanalyze,
  onRename,
  onReanalyze,
  onDelete,
}: DocumentActionsSheetProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const close = () => {
    setConfirmation(null);
    onClose();
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  let content;
  if (confirmation === 'reanalyze') {
    content = (
      <>
        <ThemedText type="smallBold" role="heading">
          {t('documents.actions.reanalyzeTitle')}
        </ThemedText>
        <ThemedText type="small">{t('documents.actions.reanalyzeMessage')}</ThemedText>
        <Button label={t('documents.actions.reanalyze')} onPress={run(onReanalyze)} />
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </>
    );
  } else if (confirmation === 'delete') {
    content = (
      <>
        <ThemedText type="smallBold" role="heading">
          {t('documents.actions.deleteTitle')}
        </ThemedText>
        <ThemedText type="small">{t('documents.actions.deleteMessage')}</ThemedText>
        <Button
          label={t('documents.actions.delete')}
          variant="destructive"
          onPress={run(onDelete)}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </>
    );
  } else {
    content = (
      <>
        <ThemedText type="smallBold" role="heading" numberOfLines={2}>
          {title}
        </ThemedText>
        <Button label={t('documents.actions.rename')} variant="secondary" onPress={run(onRename)} />
        {canReanalyze && (
          <Button
            label={t('documents.actions.reanalyze')}
            variant="secondary"
            onPress={() => setConfirmation('reanalyze')}
          />
        )}
        <Button
          label={t('documents.actions.delete')}
          variant="destructive"
          onPress={() => setConfirmation('delete')}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <Pressable
          role="button"
          aria-label={t('documents.actions.close')}
          style={StyleSheet.absoluteFill}
          onPress={close}
        />
        <ThemedView
          aria-modal
          style={[
            styles.sheet,
            { borderColor: theme.border, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          {content}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.two,
    padding: Spacing.three,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
