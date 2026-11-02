import { createFakeClock, createTestDatabase } from '@/test/sqlite';

import type { SqlDatabase } from './database';
import { createRepositories, purgeTombstones, type Repositories } from './repositories';

const DAY = 24 * 60 * 60 * 1000;

let db: SqlDatabase;
let repos: Repositories;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createFakeClock();
  repos = createRepositories(db, clock.now);
});

async function addDocument(id: string, caseId: string | null = null) {
  await repos.documents.create({
    id,
    title: `Документ ${id}`,
    source: 'scan',
    mimeType: 'image/jpeg',
    fileSize: 1000,
    caseId,
  });
}

async function caseOf(id: string) {
  const row = await db.getFirstAsync<{ case_id: string | null; updated_at: string }>(
    'SELECT case_id, updated_at FROM documents WHERE id = ?',
    [id]
  );
  return { ...row };
}

describe('cases repository (CASE-1…CASE-5)', () => {
  it('creates cases and lists the active ones newest first', async () => {
    const flat = await repos.cases.create({ id: 'flat', name: 'Квартира' });
    clock.advance(1000);
    await repos.cases.create({ id: 'car', name: 'Машина' });

    expect(flat).toEqual({
      id: 'flat',
      name: 'Квартира',
      createdAt: '2026-10-17T09:00:00.000Z',
      updatedAt: '2026-10-17T09:00:00.000Z',
      deletedAt: null,
    });
    expect((await repos.cases.list()).map(({ id }) => id)).toEqual(['car', 'flat']);
    expect(await repos.cases.get('flat')).toEqual(flat);
    expect(await repos.cases.get('missing')).toBeNull();
  });

  it('files the given documents in a new case in the same transaction (CASE-2)', async () => {
    await addDocument('doc-1');
    await addDocument('doc-2');
    await addDocument('gone');
    await repos.documents.remove('gone');
    clock.advance(1000);

    await repos.cases.create({ id: 'flat', name: 'Квартира' }, ['doc-1', 'gone']);

    expect(await caseOf('doc-1')).toEqual({
      case_id: 'flat',
      updated_at: '2026-10-17T09:00:01.000Z',
    });
    expect((await caseOf('doc-2')).case_id).toBeNull();
    expect((await caseOf('gone')).case_id).toBeNull();
  });

  it('renames a case, but not a deleted one', async () => {
    await repos.cases.create({ id: 'flat', name: 'Квартира' });
    clock.advance(1000);

    await expect(repos.cases.rename('flat', 'Квартира на Ленина')).resolves.toBe(true);

    expect(await repos.cases.get('flat')).toMatchObject({
      name: 'Квартира на Ленина',
      updatedAt: '2026-10-17T09:00:01.000Z',
    });
    await repos.cases.remove('flat');
    await expect(repos.cases.rename('flat', 'Снова')).resolves.toBe(false);
  });

  describe('remove (CASE-5)', () => {
    it('keeps the documents, out of any case, and only a tombstone without the name', async () => {
      await repos.cases.create({ id: 'flat', name: 'Квартира' });
      await repos.cases.create({ id: 'car', name: 'Машина' });
      await addDocument('doc-1', 'flat');
      await addDocument('doc-2', 'car');
      clock.advance(1000);

      await expect(repos.cases.remove('flat')).resolves.toBe(true);

      expect(await repos.cases.get('flat')).toBeNull();
      expect((await repos.cases.list()).map(({ id }) => id)).toEqual(['car']);
      expect(await repos.documents.get('doc-1')).toMatchObject({
        caseId: null,
        updatedAt: '2026-10-17T09:00:01.000Z',
      });
      expect((await repos.documents.get('doc-2'))?.caseId).toBe('car');
      const tombstone = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT name, deleted_at FROM cases WHERE id = ?',
        ['flat']
      );
      expect({ ...tombstone }).toEqual({ name: '', deleted_at: '2026-10-17T09:00:01.000Z' });
    });

    it('returns false for a case that is already gone', async () => {
      await repos.cases.create({ id: 'flat', name: 'Квартира' });
      await repos.cases.remove('flat');

      await expect(repos.cases.remove('flat')).resolves.toBe(false);
    });

    it('purges case tombstones after the retention period (STO-6)', async () => {
      await repos.cases.create({ id: 'flat', name: 'Квартира' });
      await repos.cases.remove('flat');

      await purgeTombstones(db, new Date(clock.now().getTime() - 30 * DAY));
      expect(await db.getAllAsync('SELECT id FROM cases')).toHaveLength(1);

      clock.advance(31 * DAY);
      await purgeTombstones(db, new Date(clock.now().getTime() - 30 * DAY));
      expect(await db.getAllAsync('SELECT id FROM cases')).toEqual([]);
    });

    it('goes with everything else on «Delete all data» (STO-7)', async () => {
      await repos.cases.create({ id: 'flat', name: 'Квартира' });
      await addDocument('doc-1', 'flat');
      await repos.cases.create({ id: 'old', name: 'Старое' });
      await repos.cases.remove('old');

      await repos.wipeAll();

      expect(await db.getAllAsync('SELECT * FROM cases')).toEqual([]);
      expect(await db.getAllAsync('SELECT * FROM documents')).toEqual([]);
    });
  });
});

describe('documents in cases (CASE-2, CASE-4)', () => {
  beforeEach(async () => {
    await repos.cases.create({ id: 'flat', name: 'Квартира' });
    await repos.cases.create({ id: 'car', name: 'Машина' });
  });

  it('files a new document in its case, unless the case was deleted meanwhile', async () => {
    await addDocument('doc-1', 'flat');
    await repos.cases.remove('car');
    await addDocument('doc-2', 'car');

    expect((await repos.documents.get('doc-1'))?.caseId).toBe('flat');
    expect((await repos.documents.get('doc-2'))?.caseId).toBeNull();
  });

  it('moves documents into a case, from another one too, and out of any with null', async () => {
    await addDocument('doc-1');
    await addDocument('doc-2', 'car');
    clock.advance(1000);

    await expect(repos.documents.moveToCase(['doc-1', 'doc-2'], 'flat')).resolves.toBe(true);
    expect((await repos.documents.list()).map(({ id, caseId }) => [id, caseId])).toEqual([
      ['doc-1', 'flat'],
      ['doc-2', 'flat'],
    ]);

    await expect(repos.documents.moveToCase(['doc-2'], null)).resolves.toBe(true);
    expect((await repos.documents.get('doc-2'))?.caseId).toBeNull();
  });

  it('leaves a document already in the case untouched', async () => {
    await addDocument('doc-1', 'flat');
    clock.advance(1000);

    await repos.documents.moveToCase(['doc-1'], 'flat');

    expect((await repos.documents.get('doc-1'))?.updatedAt).toBe('2026-10-17T09:00:00.000Z');
  });

  it('files nothing in a deleted case', async () => {
    await addDocument('doc-1', 'car');
    await repos.cases.remove('flat');

    await expect(repos.documents.moveToCase(['doc-1'], 'flat')).resolves.toBe(false);

    expect((await repos.documents.get('doc-1'))?.caseId).toBe('car');
  });

  it('takes a deleted document out of its case (STO-6)', async () => {
    await addDocument('doc-1', 'flat');

    await repos.documents.remove('doc-1');

    expect((await caseOf('doc-1')).case_id).toBeNull();
  });
});
