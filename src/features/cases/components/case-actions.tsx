import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { HeaderMenuButton } from '@/components/ui/header-menu-button';

/** «⋯» in the header of the case screen: opens the case's actions (CASE-5). */
export function CaseActionsButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return <HeaderMenuButton label={t('cases.actions.open')} onPress={onPress} />;
}

type CaseActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The case's name, so it's clear what the actions apply to. */
  name: string;
  onRename: () => void;
  onDelete: () => void;
};

/**
 * The case's actions (CASE-5): «Rename» and «Delete case». Deleting asks first, in the same sheet,
 * and says that the documents stay.
 */
export function CaseActionsSheet({
  visible,
  onClose,
  name,
  onRename,
  onDelete,
}: CaseActionsSheetProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    setConfirming(false);
    onClose();
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <BottomSheet visible={visible} onClose={close} closeLabel={t('cases.actions.close')}>
      {confirming ? (
        <>
          <ThemedText type="smallBold" role="heading">
            {t('cases.actions.deleteTitle')}
          </ThemedText>
          <ThemedText type="small">{t('cases.actions.deleteMessage')}</ThemedText>
          <Button label={t('cases.actions.delete')} variant="destructive" onPress={run(onDelete)} />
          <Button label={t('common.cancel')} variant="secondary" onPress={close} />
        </>
      ) : (
        <>
          <ThemedText type="smallBold" role="heading" numberOfLines={2}>
            {name}
          </ThemedText>
          <Button label={t('cases.actions.rename')} variant="secondary" onPress={run(onRename)} />
          <Button
            label={t('cases.actions.delete')}
            variant="destructive"
            onPress={() => setConfirming(true)}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={close} />
        </>
      )}
    </BottomSheet>
  );
}
