import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ContentColumn, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { UnlockStatus } from '../app-lock';

type LockScreenProps = {
  status: UnlockStatus;
  /** `false` while the app is in the background (covered): nothing to press yet. */
  canUnlock: boolean;
  onUnlock: () => void;
};

/**
 * What a locked app shows instead of its screens (SET-8): that it is locked, «Unlock» to show the
 * system prompt again, and why the last try failed. Nothing about the documents.
 */
export function LockScreen({ status, canUnlock, onUnlock }: LockScreenProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.four },
      ]}>
      <View style={styles.column}>
        <SymbolView
          name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }}
          size={40}
          tintColor={theme.text}
        />
        <ThemedText type="subtitle" role="heading" style={styles.center}>
          {t('appLock.title')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {t('appLock.message')}
        </ThemedText>
        {(status === 'lockout' || status === 'failed') && (
          <ThemedText type="small" role="alert" style={styles.center}>
            {t(status === 'lockout' ? 'appLock.lockout' : 'appLock.failed')}
          </ThemedText>
        )}
        <Button
          label={t('appLock.unlock')}
          disabled={!canUnlock || status === 'checking'}
          onPress={onUnlock}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  column: {
    ...ContentColumn,
    maxWidth: 360,
    alignItems: 'stretch',
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
    alignSelf: 'center',
  },
});
