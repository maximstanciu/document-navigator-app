import { HeaderIconButton } from './header-icon-button';

/** «⋯» in a screen's header: opens the actions of what the screen shows. */
export function HeaderMenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <HeaderIconButton
      label={label}
      icon={{ ios: 'ellipsis.circle', android: 'more_vert', web: 'more_horiz' }}
      onPress={onPress}
    />
  );
}
