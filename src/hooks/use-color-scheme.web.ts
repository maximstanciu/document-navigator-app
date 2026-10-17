import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const subscribe = () => () => {};

/**
 * Static web rendering has no color scheme on the server, so render 'light' there and during
 * hydration, then switch to the real value on the client.
 */
export function useColorScheme() {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const colorScheme = useRNColorScheme();

  return isClient ? colorScheme : 'light';
}
