import { createFakeClock, createTestDatabase } from '@/test/sqlite';

import type { SqlDatabase } from './database';
import { createRepositories, type Repositories } from './repositories';

let db: SqlDatabase;
let repos: Repositories;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(async () => {
  clock = createFakeClock();
  db = await createTestDatabase();
  repos = createRepositories(db, clock.now);
  await repos.documents.create({
    id: 'doc-1',
    title: 'Письмо',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 10,
  });
  await repos.documents.create({
    id: 'doc-2',
    title: 'Счёт',
    source: 'scan',
    mimeType: 'image/jpeg',
    fileSize: 10,
  });
});

function deadline(id: string, documentId: string, dueDate: string, dueTime: string | null = null) {
  return {
    id,
    documentId,
    kind: 'payment' as const,
    description: `Срок ${id}`,
    dueDate,
    dueTime,
    dateSource: 'explicit' as const,
    confidence: 'high' as const,
  };
}

describe('deadlines repository', () => {
  beforeEach(async () => {
    await repos.deadlines.insertMany([
      deadline('late', 'doc-1', '2026-11-20'),
      deadline('soon-evening', 'doc-2', '2026-10-31', '18:00'),
      deadline('soon-morning', 'doc-1', '2026-10-31', '09:00'),
      deadline('soon-no-time', 'doc-1', '2026-10-31'),
    ]);
  });

  it('lists soonest first, timed deadlines before untimed ones on the same day', async () => {
    const list = await repos.deadlines.list();

    expect(list.map((item) => item.id)).toEqual([
      'soon-morning',
      'soon-evening',
      'soon-no-time',
      'late',
    ]);
    expect(list[0]).toMatchObject({
      status: 'open',
      reminderOffsetsDays: null,
      originalDate: null,
      createdAt: '2026-10-17T09:00:00.000Z',
    });
  });

  it('filters by document and status', async () => {
    await repos.deadlines.update('late', { status: 'done' });

    expect((await repos.deadlines.list({ documentId: 'doc-2' })).map((d) => d.id)).toEqual([
      'soon-evening',
    ]);
    expect((await repos.deadlines.list({ statuses: ['done'] })).map((d) => d.id)).toEqual(['late']);
    expect(await repos.deadlines.list({ statuses: [] })).toEqual([]);
  });

  it('keeps a manual date fix with the original date (DET-9)', async () => {
    clock.advance(5000);

    const updated = await repos.deadlines.update('late', {
      dueDate: '2026-11-25',
      dateSource: 'user',
      originalDate: '2026-11-20',
    });

    expect(updated).toMatchObject({
      dueDate: '2026-11-25',
      dateSource: 'user',
      originalDate: '2026-11-20',
      updatedAt: '2026-10-17T09:00:05.000Z',
    });
  });

  it('changes the date to the person’s, remembering the analysis’s date once (US-8)', async () => {
    clock.advance(5000);

    await repos.deadlines.changeDate('late', '2026-11-25');
    expect(await repos.deadlines.get('late')).toMatchObject({
      dueDate: '2026-11-25',
      dateSource: 'user',
      originalDate: '2026-11-20',
      updatedAt: '2026-10-17T09:00:05.000Z',
    });

    await repos.deadlines.changeDate('late', '2026-11-27');
    expect(await repos.deadlines.get('late')).toMatchObject({
      dueDate: '2026-11-27',
      originalDate: '2026-11-20',
    });
  });

  it('refuses a date that is not in the calendar, and a missing deadline', async () => {
    await expect(repos.deadlines.changeDate('late', '2026-02-30')).rejects.toThrow(/calendar/);
    await expect(repos.deadlines.changeDate('missing', '2026-11-25')).rejects.toThrow(/not found/);
    expect(await repos.deadlines.get('late')).toMatchObject({ dueDate: '2026-11-20' });
  });

  it('distinguishes default reminders (null) from reminders turned off ([])', async () => {
    await repos.deadlines.update('late', { reminderOffsetsDays: [] });
    await repos.deadlines.update('soon-morning', { reminderOffsetsDays: [3, 0] });

    expect((await repos.deadlines.get('late'))?.reminderOffsetsDays).toEqual([]);
    expect((await repos.deadlines.get('soon-morning'))?.reminderOffsetsDays).toEqual([3, 0]);
    expect((await repos.deadlines.get('soon-evening'))?.reminderOffsetsDays).toBeNull();
  });

  it('throws when updating a missing deadline', async () => {
    await expect(repos.deadlines.update('missing', { status: 'done' })).rejects.toThrow(
      /not found/
    );
  });

  it('removes a deadline, its reminders and its link from actions', async () => {
    await repos.actions.insertMany([
      {
        id: 'a1',
        documentId: 'doc-1',
        deadlineId: 'late',
        description: 'Оплатить',
        priority: 'high',
      },
    ]);
    await repos.scheduledNotifications.insert({
      notificationId: 'n1',
      deadlineId: 'late',
      fireAt: '2026-11-13T08:00:00.000Z',
    });

    await expect(repos.deadlines.remove('late')).resolves.toEqual(['n1']);

    expect(await repos.deadlines.get('late')).toBeNull();
    expect(await repos.scheduledNotifications.list()).toEqual([]);
    expect((await repos.actions.get('a1'))?.deadlineId).toBeNull();
  });

  it('keeps the quote, its page and the computation of a deadline (ANL-6)', async () => {
    await repos.deadlines.insertMany([
      {
        ...deadline('computed', 'doc-1', '2026-10-23'),
        dateSource: 'computed',
        sourceQuote: 'Bitte antworten Sie innerhalb von 14 Tagen.',
        sourcePage: 2,
        computation: '14 дней с даты письма 09.10.2026',
      },
    ]);

    expect(await repos.deadlines.get('computed')).toMatchObject({
      sourceQuote: 'Bitte antworten Sie innerhalb von 14 Tagen.',
      sourcePage: 2,
      computation: '14 дней с даты письма 09.10.2026',
    });
    expect(await repos.deadlines.get('late')).toMatchObject({
      sourceQuote: null,
      sourcePage: null,
      computation: null,
    });
  });

  it('wipes the quote and the computation when the document is deleted (STO-6)', async () => {
    await repos.deadlines.insertMany([
      { ...deadline('quoted', 'doc-1', '2026-10-23'), sourceQuote: 'Zitat', computation: 'Расчёт' },
    ]);

    await repos.documents.remove('doc-1');

    const rows = await db.getAllAsync<{ source_quote: string | null; computation: string | null }>(
      "SELECT source_quote, computation FROM deadlines WHERE id = 'quoted'"
    );
    expect(rows).toEqual([{ source_quote: null, computation: null }]);
  });

  it('brings a deadline marked «Not relevant» back as open (DET-4)', async () => {
    await repos.deadlines.update('late', { status: 'dismissed' });

    await repos.deadlines.restore('late');

    expect(await repos.deadlines.get('late')).toMatchObject({ status: 'open' });
  });
});

describe('actions repository', () => {
  beforeEach(async () => {
    await repos.deadlines.insertMany([deadline('d1', 'doc-1', '2026-10-31')]);
    await repos.actions.insertMany([
      { id: 'a1', documentId: 'doc-1', deadlineId: 'd1', description: 'Первое', priority: 'high' },
      { id: 'a2', documentId: 'doc-1', description: 'Второе', priority: 'low' },
    ]);
  });

  it('keeps the order the analysis listed them in', async () => {
    const actions = await repos.actions.listByDocument('doc-1');

    expect(actions.map((action) => [action.id, action.done, action.deadlineId])).toEqual([
      ['a1', false, 'd1'],
      ['a2', false, null],
    ]);
  });

  it('lists the actions due by a deadline, of every document', async () => {
    await repos.deadlines.insertMany([deadline('d2', 'doc-2', '2026-11-02')]);
    await repos.actions.insertMany([
      {
        id: 'a3',
        documentId: 'doc-2',
        deadlineId: 'd2',
        description: 'Третье',
        priority: 'medium',
      },
    ]);
    await repos.actions.remove('a1');

    expect((await repos.actions.listDated()).map((action) => action.id)).toEqual(['a3']);
  });

  it('marks an action done and lists actions of a deadline (REM-9)', async () => {
    await repos.actions.update('a1', { done: true });

    expect(await repos.actions.listByDeadline('d1')).toEqual([
      expect.objectContaining({ id: 'a1', done: true }),
    ]);
  });

  it('closes a deadline once all its actions are done and reopens it when one is not (REM-9)', async () => {
    await repos.actions.insertMany([
      { id: 'a3', documentId: 'doc-1', deadlineId: 'd1', description: 'Третье', priority: 'high' },
    ]);

    await repos.actions.setDone('a1', true);
    expect(await repos.deadlines.get('d1')).toMatchObject({ status: 'open' });

    await repos.actions.setDone('a3', true);
    expect(await repos.deadlines.get('d1')).toMatchObject({ status: 'done' });
    expect((await repos.actions.get('a3'))?.done).toBe(true);

    await repos.actions.setDone('a1', false);
    expect(await repos.deadlines.get('d1')).toMatchObject({ status: 'open' });
  });

  it('leaves a deadline marked «Not relevant» as it is when its actions change (REM-9)', async () => {
    await repos.deadlines.update('d1', { status: 'dismissed' });

    await repos.actions.setDone('a1', true);

    expect(await repos.deadlines.get('d1')).toMatchObject({ status: 'dismissed' });
  });

  it('brings a deadline back as done when all its actions are done (DET-4, REM-9)', async () => {
    await repos.actions.setDone('a1', true);
    await repos.deadlines.update('d1', { status: 'dismissed' });

    await repos.deadlines.restore('d1');

    expect(await repos.deadlines.get('d1')).toMatchObject({ status: 'done' });
  });

  it('marks an action without a deadline done, and fails for a missing one', async () => {
    await repos.actions.setDone('a2', true);

    expect((await repos.actions.get('a2'))?.done).toBe(true);
    await expect(repos.actions.setDone('missing', true)).rejects.toThrow(/not found/);
  });

  it('soft-deletes and wipes an action', async () => {
    await repos.actions.remove('a2');

    expect(await repos.actions.get('a2')).toBeNull();
    expect((await repos.actions.listByDocument('doc-1')).map((action) => action.id)).toEqual([
      'a1',
    ]);
  });
});

describe('pages repository', () => {
  it('stores pages in the given order and reports files no longer used', async () => {
    await repos.pages.replaceForDocument('doc-2', [
      { id: 'p1', relativePath: 'documents/doc-2/1.jpg', width: 1000, height: 1400 },
      { id: 'p2', relativePath: 'documents/doc-2/2.jpg', width: 1000, height: 1400 },
    ]);

    const removed = await repos.pages.replaceForDocument('doc-2', [
      { id: 'p3', relativePath: 'documents/doc-2/3.jpg', width: null, height: null },
      { id: 'p1', relativePath: 'documents/doc-2/1.jpg', width: 1000, height: 1400 },
    ]);

    expect(removed).toEqual(['documents/doc-2/2.jpg']);
    expect(
      (await repos.pages.listByDocument('doc-2')).map((page) => [page.index, page.relativePath])
    ).toEqual([
      [0, 'documents/doc-2/3.jpg'],
      [1, 'documents/doc-2/1.jpg'],
    ]);
  });
});
