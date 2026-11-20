import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Biometry } from '@/features/app-lock/local-auth';
import { lockSupportQuery } from '@/features/app-lock/queries';
import { settingsQuery } from '@/lib/db/settings-query';

import { useSetAppLock } from '../queries';
import { SwitchRow } from './switch-row';

const LABELS = {
  faceId: 'settings.appLock.label.faceId',
  touchId: 'settings.appLock.label.touchId',
  face: 'settings.appLock.label.face',
  fingerprint: 'settings.appLock.label.fingerprint',
  biometrics: 'settings.appLock.label.biometrics',
} as const satisfies Record<NonNullable<Biometry>, string>;

/**
 * «Security» (SET-8): the app lock, named after what the phone unlocks it with (Face ID, a
 * fingerprint… or only its code). Turning it on or off asks for that first. Without a screen lock
 * on the phone it can't be turned on, and one turned on earlier says the app opens unchecked. Not
 * shown where there is no lock at all (web).
 */
export function AppLockSetting() {
  const { t } = useTranslation();
  const { data: settings } = useQuery(settingsQuery());
  const { data: support, refetch: checkSupport } = useQuery(lockSupportQuery());
  const setAppLock = useSetAppLock();
  if (!settings || !support?.supported) return null;

  const { available, biometry } = support;
  const label = !available
    ? t('settings.appLock.label.generic')
    : biometry
      ? t(LABELS[biometry])
      : t('settings.appLock.label.passcode');
  const hint = !available
    ? t(settings.appLock ? 'settings.appLock.unavailableOn' : 'settings.appLock.unavailable')
    : t(biometry ? 'settings.appLock.hint' : 'settings.appLock.hintPasscode');
  const result = setAppLock.data;

  const toggle = (enabled: boolean) =>
    setAppLock.mutate(
      {
        enabled,
        prompt: available
          ? {
              message: t(enabled ? 'settings.appLock.promptOn' : 'settings.appLock.promptOff'),
              cancelLabel: t('common.cancel'),
            }
          : null,
      },
      // The screen lock was removed meanwhile: show the setting as it now is.
      { onSuccess: (outcome) => (outcome === 'unavailable' ? checkSupport() : undefined) }
    );

  return (
    <Section gap={Spacing.three} title={t('settings.sections.security')}>
      <View style={styles.group}>
        <SwitchRow
          label={label}
          hint={hint}
          value={setAppLock.isPending ? setAppLock.variables.enabled : settings.appLock}
          disabled={setAppLock.isPending || (!available && !settings.appLock)}
          onValueChange={toggle}
        />
        {(result === 'lockout' || result === 'failed') && (
          <ThemedText type="small" role="alert">
            {t(result === 'lockout' ? 'appLock.lockout' : 'appLock.failed')}
          </ThemedText>
        )}
        {setAppLock.isError && (
          <ThemedText type="small" role="alert">
            {t('settings.saveFailed')}
          </ThemedText>
        )}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
});
