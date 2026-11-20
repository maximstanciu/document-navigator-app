import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { HeaderMenuButton } from '@/components/ui/header-menu-button';
import type { DocumentCountryChoice } from '@/features/analysis/document-country';
import { MEMO_COUNTRIES } from '@/shared/legal-memo-countries';

/** «⋯» in the header of the document screen: opens the document's actions (DET-9). */
export function DocumentActionsButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return <HeaderMenuButton label={t('documents.actions.open')} onPress={onPress} />;
}

type Confirmation = 'reanalyze' | 'country' | 'archive' | 'delete';

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
  /** Only a document with an analysis goes to the archive (HOME-6). */
  canArchive: boolean;
  /** The document is in the archive (HOME-6): «Restore from archive» instead of «Archive». */
  archived: boolean;
  /** How many open deadlines it has: archiving asks first when there are any. */
  openDeadlines: number;
  onRename: () => void;
  /** With the country picked in «Analyze for another country» (ANL-14), else as settings say. */
  onReanalyze: (country?: DocumentCountryChoice) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

/**
 * The document's actions (DET-9): «Rename», «Analyze again», «Analyze for another country»,
 * «Archive» or «Restore from archive» (HOME-6) and «Delete», as a sheet from the bottom. Analyzing
 * again and deleting ask first, in the same sheet (ANL-8, STO-6): a system alert shown while a
 * modal closes is unreliable on iOS. Another country is picked first, then asked about like
 * analyzing again (ANL-14). Archiving asks only when the document has open deadlines, to say they
 * stay live.
 */
export function DocumentActionsSheet({
  visible,
  onClose,
  title,
  canReanalyze,
  canArchive,
  archived,
  openDeadlines,
  onRename,
  onReanalyze,
  onArchive,
  onRestore,
  onDelete,
}: DocumentActionsSheetProps) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [country, setCountry] = useState<DocumentCountryChoice | undefined>(undefined);

  const close = () => {
    setConfirmation(null);
    setCountry(undefined);
    onClose();
  };
  const pickCountry = (choice: DocumentCountryChoice) => () => {
    setCountry(choice);
    setConfirmation('reanalyze');
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
        <Button
          label={t('documents.actions.reanalyze')}
          onPress={run(() => onReanalyze(country))}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </>
    );
  } else if (confirmation === 'country') {
    content = (
      <>
        <ThemedText type="smallBold" role="heading">
          {t('documents.actions.countryTitle')}
        </ThemedText>
        <ThemedText type="small">{t('documents.actions.countryMessage')}</ThemedText>
        {MEMO_COUNTRIES.map((code) => (
          <Button
            key={code}
            label={t(`countries.${code}`)}
            variant="secondary"
            onPress={pickCountry(code)}
          />
        ))}
        <Button
          label={t('documents.actions.otherCountry')}
          variant="secondary"
          onPress={pickCountry('other')}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </>
    );
  } else if (confirmation === 'archive') {
    content = (
      <>
        <ThemedText type="smallBold" role="heading">
          {t('documents.actions.archiveTitle')}
        </ThemedText>
        <ThemedText type="small">{t('documents.actions.archiveMessage')}</ThemedText>
        <ThemedText type="small">
          {t('documents.actions.archiveDeadlines', { count: openDeadlines })}
        </ThemedText>
        <ThemedText type="small">{t('documents.actions.archiveHint')}</ThemedText>
        <Button label={t('documents.actions.archive')} onPress={run(onArchive)} />
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
          <>
            <Button
              label={t('documents.actions.reanalyze')}
              variant="secondary"
              onPress={() => setConfirmation('reanalyze')}
            />
            <Button
              label={t('documents.actions.reanalyzeCountry')}
              variant="secondary"
              onPress={() => setConfirmation('country')}
            />
          </>
        )}
        {archived ? (
          <Button label={t('archive.restore')} variant="secondary" onPress={run(onRestore)} />
        ) : (
          canArchive && (
            <Button
              label={t('documents.actions.archive')}
              variant="secondary"
              onPress={openDeadlines > 0 ? () => setConfirmation('archive') : run(onArchive)}
            />
          )
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
