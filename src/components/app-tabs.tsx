import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform, useColorScheme } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export default function AppTabs() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      // Android's pill behind the chosen tab: the accent fill, with its icon in `onTint`.
      indicatorColor={colors.tint}
      // iOS has no indicator: there the chosen icon is in the text color.
      iconColor={{
        default: colors.textSecondary,
        selected: Platform.OS === 'android' ? colors.onTint : colors.text,
      }}
      tintColor={colors.text}
      labelStyle={{
        default: { fontFamily: Fonts.sans, fontWeight: '500', color: colors.textSecondary },
        selected: { fontFamily: Fonts.sans, fontWeight: '600', color: colors.text },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.documents')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="deadlines">
        <NativeTabs.Trigger.Label>{t('tabs.deadlines')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar' }} md="event" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('tabs.settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
