import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { HeaderMenuButton } from '@/components/ui/header-menu-button';

/** «⋯» in the header of the document screen: opens the document's actions (DET-9). */
export function DocumentActionsButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return <HeaderMenuButton label={t('documents.actions.open')} onPress={onPress} />;
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
  const { t } = useTranslation();
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
    <BottomSheet visible={visible} onClose={close} closeLabel={t('documents.actions.close')}>
      {content}
    </BottomSheet>
  );
}
