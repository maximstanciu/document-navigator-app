import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time for screens that say «today», «overdue» or «in 3 days». Taken on mount and again
 * each time the app comes back to the foreground, so a tab left open overnight doesn't show
 * yesterday. Reading `new Date()` during render instead would be cached by the React Compiler.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);
  return now;
}
