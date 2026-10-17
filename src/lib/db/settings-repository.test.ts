import { createTestDatabase } from '@/test/sqlite';

import type { SqlDatabase } from './database';
import { createSettingsRepository } from './settings-repository';
import { DEFAULT_SETTINGS } from './types';

let db: SqlDatabase;
let settings: ReturnType<typeof createSettingsRepository>;

beforeEach(async () => {
  db = await createTestDatabase();
  settings = createSettingsRepository(db);
});

describe('settings repository', () => {
  it('returns the defaults on a fresh install', async () => {
    expect(await settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      explanationLocale: null,
      reminderOffsetsDays: [7, 1, 0],
      reminderTime: '09:00',
      notificationDetails: false,
    });
  });

  it('stores changes, including the explanation language and consent version', async () => {
    const updated = await settings.update({
      locale: 'ru',
      explanationLocale: 'en',
      consent: { version: '2026-10-1', acceptedAt: '2026-10-17T09:00:00.000Z' },
    });

    expect(updated).toEqual({
      ...DEFAULT_SETTINGS,
      locale: 'ru',
      explanationLocale: 'en',
      consent: { version: '2026-10-1', acceptedAt: '2026-10-17T09:00:00.000Z' },
    });
    expect(await settings.get()).toEqual(updated);
    expect(
      await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'explanation_locale'"
      )
    ).toEqual({ value: '"en"' });
  });

  it('can reset the explanation language to "same as interface"', async () => {
    await settings.update({ explanationLocale: 'en' });

    await settings.update({ explanationLocale: null });

    expect((await settings.get()).explanationLocale).toBeNull();
  });

  it('rejects invalid values without writing anything', async () => {
    await expect(
      settings.update({ locale: 'ru', reminderTime: '25:00' } as Parameters<
        typeof settings.update
      >[0])
    ).rejects.toThrow(/reminderTime/);

    expect(await settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the default when a stored value is unreadable', async () => {
    await db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('reminder_offsets_days', 'not json')"
    );
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('locale', '\"de\"')");

    const current = await settings.get();

    expect(current.reminderOffsetsDays).toEqual([7, 1, 0]);
    expect(current.locale).toBe('system');
  });
});
