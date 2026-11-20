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
  /** The case is in the archive (CASE-6): «Restore from archive» instead of «Archive». */
  archived: boolean;
  /** How many open deadlines its documents have: archiving asks first when there are any. */
  openDeadlines: number;
  onRename: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

/**
 * The case's actions (CASE-5, CASE-6): «Rename», «Archive» or «Restore from archive», and «Delete
 * case». Deleting asks first, in the same sheet, and says that the documents stay. Archiving asks
 * only when the case has open deadlines, to say they stay live.
 */
export function CaseActionsSheet({
  visible,
  onClose,
  name,
  archived,
  openDeadlines,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: CaseActionsSheetProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<'delete' | 'archive' | null>(null);

  const close = () => {
    setConfirming(null);
    onClose();
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <BottomSheet visible={visible} onClose={close} closeLabel={t('cases.actions.close')}>
      {confirming === 'archive' ? (
        <>
          <ThemedText type="smallBold" role="heading">
            {t('cases.actions.archiveTitle')}
          </ThemedText>
          <ThemedText type="small">{t('cases.actions.archiveDocuments')}</ThemedText>
          <ThemedText type="small">
            {t('cases.actions.archiveDeadlines', { count: openDeadlines })}
          </ThemedText>
          <ThemedText type="small">{t('cases.actions.archiveHint')}</ThemedText>
          <Button label={t('cases.actions.archive')} onPress={run(onArchive)} />
          <Button label={t('common.cancel')} variant="secondary" onPress={close} />
        </>
      ) : confirming === 'delete' ? (
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
          {archived ? (
            <Button label={t('archive.restore')} variant="secondary" onPress={run(onRestore)} />
          ) : (
            <Button
              label={t('cases.actions.archive')}
              variant="secondary"
              onPress={openDeadlines > 0 ? () => setConfirming('archive') : run(onArchive)}
            />
          )}
          <Button
            label={t('cases.actions.delete')}
            variant="destructive"
            onPress={() => setConfirming('delete')}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={close} />
        </>
      )}
    </BottomSheet>
  );
}
