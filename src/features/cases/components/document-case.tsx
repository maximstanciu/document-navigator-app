import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { caseQueries, useMoveToCase } from '../queries';

function CaseOption({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      {/* The mark, not only its color, tells the chosen case. */}
      <SymbolView
        name={
          selected
            ? {
                ios: 'checkmark.circle.fill',
                android: 'radio_button_checked',
                web: 'radio_button_checked',
              }
            : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
        }
        size={24}
        tintColor={selected ? theme.tint : theme.textSecondary}
      />
      <ThemedText type={selected ? 'smallBold' : 'small'} style={styles.optionLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type DocumentCaseProps = {
  documentId: string;
  /** The case the document is filed in, `null` — none. */
  caseId: string | null;
};

/**
 * The case a document is filed in, under its title (CASE-2): «Case: Apartment», or «Add to a case»
 * while it has none. It opens a sheet to file the document in another case, take it out, open its
 * case, or start a new case with it.
 */
export function DocumentCase({ documentId, caseId }: DocumentCaseProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const cases = useQuery(caseQueries.list());
  const move = useMoveToCase();
  const [open, setOpen] = useState(false);

  // Until the cases are read, its case has no name to show.
  if (caseId !== null && cases.isPending) return null;
  const current = cases.data?.find((item) => item.id === caseId);

  const close = () => {
    move.reset();
    setOpen(false);
  };
  const choose = (target: string | null) => {
    if (target === caseId) return close();
    move.mutate({ documentIds: [documentId], caseId: target }, { onSuccess: close });
  };
  const goTo = (go: () => void) => () => {
    close();
    go();
  };

  let options;
  if (cases.isPending) {
    options = <ActivityIndicator color={theme.textSecondary} aria-label={t('cases.loadingList')} />;
  } else if (cases.isError) {
    options = (
      <>
        <ThemedText type="small" role="alert">
          {t('cases.loadListFailed')}
        </ThemedText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => cases.refetch()} />
      </>
    );
  } else {
    options = (
      <ScrollView
        role="radiogroup"
        aria-label={t('cases.picker.label')}
        style={styles.options}
        contentContainerStyle={styles.optionsContent}>
        <CaseOption
          label={t('cases.picker.none')}
          selected={caseId === null}
          disabled={move.isPending}
          onPress={() => choose(null)}
        />
        {cases.data.map((item) => (
          <CaseOption
            key={item.id}
            label={item.name}
            selected={item.id === caseId}
            disabled={move.isPending}
            onPress={() => choose(item.id)}
          />
        ))}
      </ScrollView>
    );
  }

  const label = current
    ? t('cases.document.inCase', { name: current.name })
    : t('cases.document.add');

  return (
    <>
      <Pressable
        role="button"
        aria-label={current ? t('cases.document.change', { name: current.name }) : label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'folder', android: 'folder', web: 'folder' }}
          size={20}
          tintColor={theme.tint}
        />
        <ThemedText
          type="smallBold"
          numberOfLines={1}
          style={[styles.triggerLabel, { color: theme.tint }]}>
          {label}
        </ThemedText>
      </Pressable>
      <BottomSheet visible={open} onClose={close} closeLabel={t('cases.picker.close')}>
        <ThemedText type="smallBold" role="heading">
          {t('cases.picker.title')}
        </ThemedText>
        {options}
        {move.isError && (
          <ThemedText type="small" role="alert">
            {t('cases.picker.moveFailed')}
          </ThemedText>
        )}
        <View style={styles.buttons}>
          {current && (
            <Button
              label={t('cases.picker.openCase', { name: current.name })}
              variant="secondary"
              onPress={goTo(() =>
                router.push({ pathname: '/cases/[id]', params: { id: current.id } })
              )}
            />
          )}
          <Button
            label={t('cases.newCase')}
            variant="secondary"
            onPress={goTo(() => router.push({ pathname: '/cases/new', params: { documentId } }))}
          />
          <Button label={t('common.cancel')} variant="secondary" onPress={close} />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: Spacing.two,
  },
  triggerLabel: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  options: {
    flexGrow: 0,
  },
  optionsContent: {
    gap: Spacing.half,
  },
  option: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  optionLabel: {
    flex: 1,
  },
  buttons: {
    gap: Spacing.two,
  },
});
