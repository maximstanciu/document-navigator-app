// Spike 0.7 (IMPLEMENTATION_PLAN): throwaway screen to check Intl in Hermes and "Add to calendar"
// on Android. Removed once docs/spikes/0.7-platform-apis.md is written.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as IntentLauncher from 'expo-intent-launcher';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

type Check = { name: string; actual: string; expected?: string; pass?: boolean };

const INSTANT = new Date('2026-10-31T23:30:00Z');
const EVENT_TITLE = 'DocNavigator spike: do not save';

function normalizeSpaces(value: string) {
  return value.replace(/[  ]/g, ' ');
}

function check(name: string, run: () => string, expected?: string): Check {
  try {
    const actual = normalizeSpaces(run());
    return {
      name,
      actual,
      expected,
      pass: expected === undefined ? undefined : actual === expected,
    };
  } catch (error) {
    return {
      name,
      actual: `throws: ${String(error)}`,
      expected,
      pass: expected === undefined ? undefined : false,
    };
  }
}

function zoned(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(INSTANT);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '?';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

function runIntlChecks(): Check[] {
  const plural = (locale: string, n: number) => () => new Intl.PluralRules(locale).select(n);
  return [
    check('typeof Intl.PluralRules', () => typeof Intl.PluralRules, 'function'),
    check('ru 1', plural('ru', 1), 'one'),
    check('ru 2', plural('ru', 2), 'few'),
    check('ru 5', plural('ru', 5), 'many'),
    check('ru 11', plural('ru', 11), 'many'),
    check('ru 21', plural('ru', 21), 'one'),
    check('ru 22', plural('ru', 22), 'few'),
    check('ru 0', plural('ru', 0), 'many'),
    check('ru 1.5', plural('ru', 1.5), 'other'),
    check('uk 2', plural('uk', 2), 'few'),
    check('uk 5', plural('uk', 5), 'many'),
    check('en 1', plural('en', 1), 'one'),
    check('en 2', plural('en', 2), 'other'),
    check('de 2', plural('de', 2), 'other'),
    check('tz Europe/Berlin', () => zoned('Europe/Berlin'), '2026-11-01 00:30'),
    check('tz Asia/Almaty', () => zoned('Asia/Almaty'), '2026-11-01 04:30'),
    check('tz America/New_York', () => zoned('America/New_York'), '2026-10-31 19:30'),
    check('device timeZone', () => Intl.DateTimeFormat().resolvedOptions().timeZone),
    check(
      'ru long date',
      () =>
        new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
          INSTANT
        ),
      '31 октября'
    ),
    check(
      'de EUR',
      () => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(84.2),
      '84,20 €'
    ),
    check(
      'ru RUB',
      () => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(1234.5),
      '1 234,50 ₽'
    ),
    check('ru KZT', () =>
      new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'KZT' }).format(1234.5)
    ),
    check(
      'ru relative +3 days',
      () => new Intl.RelativeTimeFormat('ru').format(3, 'day'),
      'через 3 дня'
    ),
    check(
      'ru relative -1 day auto',
      () => new Intl.RelativeTimeFormat('ru', { numeric: 'auto' }).format(-1, 'day'),
      'вчера'
    ),
    check('typeof Intl.ListFormat', () => typeof Intl.ListFormat),
    check('typeof Intl.Locale', () => typeof Intl.Locale),
  ];
}

function eventWindow() {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) };
}

async function step(name: string, run: () => Promise<unknown>): Promise<string> {
  const started = Date.now();
  try {
    const result = await run();
    return `${name}: ok in ${Date.now() - started} ms → ${JSON.stringify(result)}`;
  } catch (error) {
    return `${name}: error in ${Date.now() - started} ms → ${String(error)}`;
  }
}

export function PlatformSpikeScreen() {
  const [intlChecks] = useState(() => {
    const checks = runIntlChecks();
    console.log('[platform-spike] intl', JSON.stringify(checks));
    return checks;
  });
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(name: string, action: () => Promise<unknown>) {
    setBusy(true);
    const line = await step(name, action);
    console.log('[platform-spike] calendar', line);
    setLog((previous) => [...previous, line]);
    setBusy(false);
  }

  const failed = intlChecks.filter((c) => c.pass === false).length;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle">Platform spike 0.7</ThemedText>

        <ThemedText type="smallBold">
          Intl: {intlChecks.length} checks, {failed} failed
        </ThemedText>
        {intlChecks.map((c) => (
          <ThemedText key={c.name} type="small">
            {c.pass === undefined ? '•' : c.pass ? '✓' : '✗'} {c.name}: {c.actual}
            {c.pass === false ? ` (expected ${c.expected})` : ''}
          </ThemedText>
        ))}

        <ThemedText type="smallBold">Calendar (cancel every form, do not save)</ThemedText>
        <Button
          label="1. Permission status"
          disabled={busy}
          onPress={() => run('1 permission status', () => Calendar.getCalendarPermissions())}
        />
        <Button
          label="2. getCalendars, no permission"
          disabled={busy}
          onPress={() =>
            run('2 getCalendars', async () =>
              (await Calendar.getCalendars()).map((c) => ({ id: c.id, primary: c.isPrimary }))
            )
          }
        />
        <Button
          label="3. addEventWithForm, id 1, no permission"
          disabled={busy}
          onPress={() => {
            const { start, end } = eventWindow();
            return run('3 addEventWithForm id=1', () =>
              new Calendar.ExpoCalendar('1').addEventWithForm({
                title: EVENT_TITLE,
                startDate: start,
                endDate: end,
              })
            );
          }}
        />
        <Button
          label="4. ACTION_INSERT intent, no permission"
          disabled={busy}
          onPress={() => {
            const { start, end } = eventWindow();
            return run('4 ACTION_INSERT', () =>
              IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
                data: 'content://com.android.calendar/events',
                extra: {
                  title: EVENT_TITLE,
                  beginTime: start.getTime(),
                  endTime: end.getTime(),
                },
              })
            );
          }}
        />
        <Button
          label="5. Request permission"
          variant="secondary"
          disabled={busy}
          onPress={() => run('5 request permission', () => Calendar.requestCalendarPermissions())}
        />
        <Button
          label="6. Primary calendar + addEventWithForm"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            const { start, end } = eventWindow();
            return run('6 primary addEventWithForm', async () => {
              const calendars = await Calendar.getCalendars();
              const target =
                calendars.find((c) => c.isPrimary && c.allowsModifications) ?? calendars[0];
              const result = await target.addEventWithForm({
                title: EVENT_TITLE,
                startDate: start,
                endDate: end,
              });
              return { calendars: calendars.length, primary: Boolean(target.isPrimary), result };
            });
          }}
        />
        <View style={styles.log}>
          {log.map((line, index) => (
            <ThemedText key={index} type="small">
              {line}
            </ThemedText>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two },
  log: { gap: Spacing.one },
});
