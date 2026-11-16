import { SymbolView } from 'expo-symbols';

/**
 * The chevron of something that opens on a press: up while open, down while closed. The pressable
 * around it carries `aria-expanded`, so the state never rests on the icon alone.
 */
export function DisclosureChevron({ open, color }: { open: boolean; color: string }) {
  return (
    <SymbolView
      name={
        open
          ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
          : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
      }
      size={16}
      tintColor={color}
    />
  );
}
