import { router } from 'expo-router';
import {
  TabList,
  Tabs,
  TabSlot,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState, type ComponentRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fonts, Radius, Spacing, TabBarHeight, TabBarMaxWidth } from '@/constants/theme';
import { tabBarBottom } from '@/hooks/use-bottom-tab-inset';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Icon = SymbolViewProps['name'];

const ICONS = {
  documents: { ios: 'doc.text', android: 'description', web: 'description' },
  deadlines: { ios: 'clock', android: 'schedule', web: 'schedule' },
  settings: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  add: { ios: 'doc.viewfinder', android: 'document_scanner', web: 'document_scanner' },
} as const satisfies Record<string, Icon>;

/**
 * The tabs (SPEC §5): a bar floating over the bottom of every tab, the same on iOS, Android and
 * web, as in the design: Documents, Deadlines, the round «Add a document» that opens the capture
 * modal (CAP-1), Settings. Tab screens leave room under their content with `useBottomTabInset()`.
 */
export default function AppTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={ICONS.documents}>{t('tabs.documents')}</TabButton>
          </TabTrigger>
          <TabTrigger name="deadlines" href="/deadlines" asChild>
            <TabButton icon={ICONS.deadlines}>{t('tabs.deadlines')}</TabButton>
          </TabTrigger>
          <AddDocumentTab />
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon={ICONS.settings}>{t('tabs.settings')}</TabButton>
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

/**
 * Whether the on-screen keyboard is up. Android resizes the window for it (`adjustResize`), which
 * would lift the bar over the field being typed into, so the bar steps aside meanwhile.
 */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

function TabBar({ children, style: _style, ...props }: TabListProps) {
  const theme = useTheme();
  const { bottom } = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();

  return (
    <View
      {...props}
      style={[
        styles.barArea,
        { bottom: tabBarBottom(bottom) },
        keyboardShown && process.env.EXPO_OS === 'android' && styles.hidden,
      ]}>
      <View
        role="tablist"
        style={[
          styles.bar,
          {
            backgroundColor: theme.tabBar,
            borderColor: theme.tabBarBorder,
            boxShadow: `0 12px 32px ${theme.tabBarShadow}`,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

function TabButton({
  children,
  isFocused = false,
  icon,
  ref,
  ...props
}: TabTriggerSlotProps & { icon: Icon }) {
  const theme = useTheme();
  const color = isFocused ? theme.text : theme.textSecondary;

  return (
    <Pressable
      {...props}
      // expo-router types the slot ref as `Ref<View>` (the component type); Pressable wants the instance.
      ref={ref as unknown as Ref<ComponentRef<typeof Pressable>>}
      role="tab"
      aria-selected={isFocused}
      style={({ pressed }) => [
        styles.tab,
        isFocused && { backgroundColor: theme.background },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={icon} size={20} tintColor={color} />
      <ThemedText
        numberOfLines={1}
        style={[styles.tabLabel, isFocused && styles.tabLabelFocused, { color }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

/** Not a tab: opens the choice of source for a new document over the current tab (CAP-1). */
function AddDocumentTab() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      role="button"
      aria-label={t('documents.addDocument')}
      onPress={() => router.push('/capture')}
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: theme.tint },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={ICONS.add} size={24} tintColor={theme.onTint} />
    </Pressable>
  );
}

const ADD_SIZE = 56;
const TAB_HEIGHT = 52;

const styles = StyleSheet.create({
  slot: {
    flex: 1,
  },
  barArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three + Spacing.one,
    // Taps beside the bar reach the screen under it.
    pointerEvents: 'box-none',
  },
  hidden: {
    display: 'none',
  },
  bar: {
    width: '100%',
    maxWidth: TabBarMaxWidth,
    height: TabBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tab: {
    minWidth: 72,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  tabLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 500,
  },
  tabLabelFocused: {
    fontWeight: 600,
  },
  add: {
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
