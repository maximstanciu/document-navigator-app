import { isExplanationLocale } from '@/shared/explanation-locales';

import type { SqlDatabase } from './database';
import { fromJson } from './sql';
import { DEFAULT_SETTINGS, type Settings } from './types';

/** Key under which each setting is stored in the `settings` table (SPEC §6.2). */
const KEYS: { [K in keyof Settings]: string } = {
  locale: 'locale',
  explanationLocale: 'explanation_locale',
  reminderOffsetsDays: 'reminder_offsets_days',
  reminderTime: 'reminder_time',
  notificationDetails: 'notification_details',
  onboardingCompleted: 'onboarding_completed',
  consent: 'consent',
};

/** Accepts a stored value only if it has the type of the default; otherwise the default wins. */
function isValid<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  switch (key) {
    case 'locale':
      return value === 'system' || value === 'ru' || value === 'en';
    case 'explanationLocale':
      return value === null || isExplanationLocale(value);
    case 'reminderOffsetsDays':
      return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0);
    case 'reminderTime':
      return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    case 'notificationDetails':
    case 'onboardingCompleted':
      return typeof value === 'boolean';
    case 'consent':
      return (
        value === null ||
        (typeof value === 'object' &&
          typeof (value as { version?: unknown }).version === 'string' &&
          typeof (value as { acceptedAt?: unknown }).acceptedAt === 'string')
      );
    default:
      return false;
  }
}

export function createSettingsRepository(db: SqlDatabase) {
  async function get(): Promise<Settings> {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    const stored = new Map(rows.map((row) => [row.key, fromJson(row.value)]));
    const settings = { ...DEFAULT_SETTINGS };
    for (const name of Object.keys(KEYS) as (keyof Settings)[]) {
      const key = KEYS[name];
      if (!stored.has(key)) continue;
      const value = stored.get(key);
      if (isValid(name, value)) {
        (settings as Record<keyof Settings, unknown>)[name] = value;
      }
    }
    return settings;
  }

  return {
    /** All settings, with defaults for anything unset or unreadable. */
    get,

    async update(patch: Partial<Settings>): Promise<Settings> {
      await db.transaction(async (tx) => {
        for (const name of Object.keys(patch) as (keyof Settings)[]) {
          const value = patch[name];
          if (value === undefined || !(name in KEYS)) continue;
          if (!isValid(name, value)) throw new Error(`Invalid value for setting ${name}`);
          await tx.runAsync(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
            [KEYS[name], JSON.stringify(value)]
          );
        }
      });
      return get();
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
