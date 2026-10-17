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

function newDocument(id: string, title = 'Счёт за электричество') {
  return { id, title, source: 'scan' as const, mimeType: 'image/jpeg' as const, fileSize: 1000 };
}

describe('documents repository', () => {
  it('creates a draft with timestamps from the clock', async () => {
    const created = await repos.documents.create({ ...newDocument('doc-1'), pageCount: 2 });

    expect(created).toMatchObject({
      id: 'doc-1',
      title: 'Счёт за электричество',
      status: 'draft',
      pageCount: 2,
      analysis: null,
      searchText: 'счет за электричество',
      createdAt: '2026-10-17T09:00:00.000Z',
      updatedAt: '2026-10-17T09:00:00.000Z',
      deletedAt: null,
    });
    expect(await repos.documents.get('doc-1')).toEqual(created);
  });

  it('lists active documents newest first', async () => {
    await repos.documents.create(newDocument('older', 'Old'));
    clock.advance(1000);
    await repos.documents.create(newDocument('newer', 'New'));

    const list = await repos.documents.list();

    expect(list.map((document) => document.id)).toEqual(['newer', 'older']);
  });

  it('stores the analysis as JSON and rebuilds the search text on update', async () => {
    await repos.documents.create(newDocument('doc-1', 'Письмо'));
    clock.advance(1000);

    const updated = await repos.documents.update('doc-1', {
      status: 'ready',
      senderName: 'Finanzamt Berlin',
      analysis: {
        summary: 'Нужно оплатить ШТРАФ до конца месяца.',
        keyFacts: [{ kind: 'amount', label: 'Сумма', value: '84,20 €' }],
      },
      analysisLocale: 'ru',
    });

    expect(updated.analysis).toEqual({
      summary: 'Нужно оплатить ШТРАФ до конца месяца.',
      keyFacts: [{ kind: 'amount', label: 'Сумма', value: '84,20 €' }],
    });
    expect(updated.searchText).toBe(
      'письмо finanzamt berlin нужно оплатить штраф до конца месяца. 84,20 €'
    );
    expect(updated.updatedAt).toBe('2026-10-17T09:00:01.000Z');
    expect(updated.createdAt).toBe('2026-10-17T09:00:00.000Z');
  });

  it('throws when updating a missing document', async () => {
    await expect(repos.documents.update('missing', { title: 'x' })).rejects.toThrow(/not found/);
  });

  describe('search (HOME-3)', () => {
    beforeEach(async () => {
      await repos.documents.create(newDocument('fine', 'Штраф за парковку'));
      await repos.documents.create(newDocument('invoice', 'Invoice 50% discount'));
      await repos.documents.update('invoice', { senderName: 'Stadtwerke' });
    });

    it('finds Cyrillic text regardless of case', async () => {
      expect((await repos.documents.search('штраф')).map((d) => d.id)).toEqual(['fine']);
      expect((await repos.documents.search('ПАРКОВКУ')).map((d) => d.id)).toEqual(['fine']);
    });

    it('treats «ё» and «е» as the same letter', async () => {
      await repos.documents.create(newDocument('bill', 'Счёт'));

      expect((await repos.documents.search('счет')).map((d) => d.id)).toEqual(['bill']);
      expect((await repos.documents.search('СЧЁТ')).map((d) => d.id)).toEqual(['bill']);
    });

    it('matches the sender and takes % and _ literally', async () => {
      expect((await repos.documents.search('stadtwerke')).map((d) => d.id)).toEqual(['invoice']);
      expect((await repos.documents.search('50%')).map((d) => d.id)).toEqual(['invoice']);
      expect(await repos.documents.search('5_%')).toEqual([]);
    });

    it('returns nothing for a blank query', async () => {
      expect(await repos.documents.search('   ')).toEqual([]);
    });
  });

  describe('remove (STO-6)', () => {
    beforeEach(async () => {
      await repos.documents.create(newDocument('doc-1', 'Договор аренды'));
      await repos.documents.update('doc-1', {
        senderName: 'ООО Ромашка',
        analysis: { summary: 'Секретное содержание' },
      });
      await repos.pages.replaceForDocument('doc-1', [
        { id: 'p1', relativePath: 'documents/doc-1/page-1.jpg', width: 100, height: 200 },
        { id: 'p2', relativePath: 'documents/doc-1/page-2.jpg', width: 100, height: 200 },
      ]);
      await repos.deadlines.insertMany([
        {
          id: 'd1',
          documentId: 'doc-1',
          kind: 'payment',
          description: 'Оплатить 84,20 €',
          dueDate: '2026-10-31',
          dateSource: 'explicit',
          confidence: 'high',
        },
      ]);
      await repos.actions.insertMany([
        {
          id: 'a1',
          documentId: 'doc-1',
          deadlineId: 'd1',
          description: 'Перевести деньги',
          priority: 'high',
        },
      ]);
      await repos.scheduledNotifications.insert({
        notificationId: 'n1',
        deadlineId: 'd1',
        fireAt: '2026-10-24T07:00:00.000Z',
      });
    });

    it('returns what to clean up outside the database', async () => {
      await expect(repos.documents.remove('doc-1')).resolves.toEqual({
        pagePaths: ['documents/doc-1/page-1.jpg', 'documents/doc-1/page-2.jpg'],
        notificationIds: ['n1'],
      });
    });

    it('leaves only a tombstone without content', async () => {
      clock.advance(1000);
      await repos.documents.remove('doc-1');

      expect(await repos.documents.get('doc-1')).toBeNull();
      expect(await repos.documents.list()).toEqual([]);
      expect(await repos.pages.listByDocument('doc-1')).toEqual([]);
      expect(await repos.deadlines.list()).toEqual([]);
      expect(await repos.actions.listByDocument('doc-1')).toEqual([]);
      expect(await repos.scheduledNotifications.list()).toEqual([]);

      const tombstone = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT title, sender_name, analysis, search_text, deleted_at FROM documents WHERE id = ?',
        ['doc-1']
      );
      expect({ ...tombstone }).toEqual({
        title: '',
        sender_name: null,
        analysis: null,
        search_text: '',
        deleted_at: '2026-10-17T09:00:01.000Z',
      });
      const deadline = await db.getFirstAsync<{ description: string; deleted_at: string }>(
        'SELECT description, deleted_at FROM deadlines WHERE id = ?',
        ['d1']
      );
      expect({ ...deadline }).toEqual({ description: '', deleted_at: '2026-10-17T09:00:01.000Z' });
      const action = await db.getFirstAsync<{ description: string }>(
        'SELECT description FROM actions WHERE id = ?',
        ['a1']
      );
      expect(action?.description).toBe('');
    });

    it('returns null for a document that is already gone', async () => {
      await repos.documents.remove('doc-1');

      await expect(repos.documents.remove('doc-1')).resolves.toBeNull();
    });

    it('purges tombstones after the retention period, children included', async () => {
      await repos.documents.remove('doc-1');

      await purgeTombstones(db, new Date(clock.now().getTime() - 30 * DAY));
      expect(await db.getAllAsync('SELECT id FROM documents')).toHaveLength(1);

      clock.advance(31 * DAY);
      await purgeTombstones(db, new Date(clock.now().getTime() - 30 * DAY));
      expect(await db.getAllAsync('SELECT id FROM documents')).toEqual([]);
      expect(await db.getAllAsync('SELECT id FROM deadlines')).toEqual([]);
      expect(await db.getAllAsync('SELECT id FROM actions')).toEqual([]);
    });
  });
});
