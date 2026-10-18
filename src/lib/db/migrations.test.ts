import { createNodeDatabase } from '@/test/sqlite';

import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate, MIGRATIONS } from './migrations';

async function tableNames(db: ReturnType<typeof createNodeDatabase>) {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((row) => row.name);
}

describe('migrate', () => {
  it('creates the schema from SPEC §6.2 on a fresh database', async () => {
    const db = createNodeDatabase();

    await expect(migrate(db)).resolves.toEqual({ from: 0, to: LATEST_SCHEMA_VERSION });

    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual([
      'actions',
      'deadlines',
      'documents',
      'pages',
      'scheduled_notifications',
      'settings',
    ]);
  });

  it('is idempotent: a second run changes nothing and keeps the data', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('locale', '\"ru\"')");

    await expect(migrate(db)).resolves.toEqual({
      from: LATEST_SCHEMA_VERSION,
      to: LATEST_SCHEMA_VERSION,
    });

    expect(await db.getAllAsync('SELECT key, value FROM settings')).toEqual([
      { key: 'locale', value: '"ru"' },
    ]);
  });

  it('applies only the migrations newer than the stored version', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    const next = [
      ...MIGRATIONS,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        statements: ['ALTER TABLE settings ADD COLUMN note TEXT'],
      },
    ];

    await migrate(db, next);

    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1);
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(settings)');
    expect(columns.map((column) => column.name)).toContain('note');
  });

  it('rolls back a failing migration together with its version bump', async () => {
    const db = createNodeDatabase();
    await migrate(db);
    const broken = [
      ...MIGRATIONS,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        statements: ['CREATE TABLE extra (id TEXT)', 'THIS IS NOT SQL'],
      },
    ];

    await expect(migrate(db, broken)).rejects.toThrow();

    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await tableNames(db)).not.toContain('extra');
  });

  it('adds the quote columns to deadlines stored by version 1, keeping them (task 4.2)', async () => {
    const db = createNodeDatabase();
    await migrate(db, MIGRATIONS.slice(0, 1));
    await db.runAsync(
      `INSERT INTO documents (id, title, status, source, mime_type, file_size, created_at, updated_at)
       VALUES ('doc-1', 'Счёт', 'ready', 'scan', 'image/jpeg', 10, 't', 't')`
    );
    await db.runAsync(
      `INSERT INTO deadlines (id, document_id, kind, description, due_date, date_source, confidence,
         status, created_at, updated_at)
       VALUES ('d1', 'doc-1', 'payment', 'Оплатить', '2026-10-31', 'explicit', 'high', 'open', 't', 't')`
    );

    await expect(migrate(db)).resolves.toEqual({ from: 1, to: LATEST_SCHEMA_VERSION });

    expect(
      await db.getAllAsync('SELECT id, source_quote, source_page, computation FROM deadlines')
    ).toEqual([{ id: 'd1', source_quote: null, source_page: null, computation: null }]);
  });

  it('refuses a database created by a newer app version', async () => {
    const db = createNodeDatabase();
    await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 5}`);

    await expect(migrate(db)).rejects.toThrow(/newer than this app supports/);
  });
});
