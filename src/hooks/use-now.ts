import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time for screens that say «today», «overdue» or «in 3 days». Taken on mount and again
 * each time the app comes back to the foreground, so a tab left open overnight doesn't show
 * yesterday, and every `tickMs` if given, for a countdown. Reading `new Date()` during render
 * instead would be cached by the React Compiler.
 */
export function useNow(tickMs?: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    const timer = tickMs ? setInterval(() => setNow(new Date()), tickMs) : null;
    return () => {
      subscription.remove();
      if (timer !== null) clearInterval(timer);
    };
  }, [tickMs]);
  return now;
}
