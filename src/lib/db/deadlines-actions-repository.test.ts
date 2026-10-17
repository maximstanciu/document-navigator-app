import { createFakeClock, createTestDatabase } from '@/test/sqlite';

import { createRepositories, type Repositories } from './repositories';

let repos: Repositories;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(async () => {
  clock = createFakeClock();
  repos = createRepositories(await createTestDatabase(), clock.now);
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
    kind: 'payment',
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

  it('marks an action done and lists actions of a deadline (REM-9)', async () => {
    await repos.actions.update('a1', { done: true });

    expect(await repos.actions.listByDeadline('d1')).toEqual([
      expect.objectContaining({ id: 'a1', done: true }),
    ]);
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
