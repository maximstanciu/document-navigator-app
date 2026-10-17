import Constants from 'expo-constants';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { env } from '@/lib/env';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.value} numberOfLines={1}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

export function SettingsScreen() {
  const colorScheme = useColorScheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" role="heading" style={styles.heading}>
            Settings
          </ThemedText>
          <InfoRow label="Version" value={Constants.expoConfig?.version ?? 'unknown'} />
          <InfoRow
            label="Platform"
            value={Platform.OS === 'web' ? 'web' : `${Platform.OS} ${Platform.Version}`}
          />
          <InfoRow label="Appearance" value={colorScheme ?? 'unspecified'} />
          <InfoRow label="API" value={env.apiUrl || 'Not configured'} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  heading: {
    paddingTop: TopTabInset + Spacing.three,
    paddingBottom: Spacing.two,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
