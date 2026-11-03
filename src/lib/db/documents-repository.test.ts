import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { createFakeClock, createTestDatabase } from '@/test/sqlite';

import type { SqlDatabase } from './database';
import { createRepositories, purgeTombstones, type Repositories } from './repositories';
import { DEFAULT_SETTINGS } from './types';

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

  it('creates a document together with its pages in order (CAP-5)', async () => {
    const page = (id: string) => ({
      id,
      relativePath: `documents/doc-1/${id}.jpg`,
      width: 1448,
      height: 2048,
    });

    await repos.documents.create(newDocument('doc-1'), [page('p-a'), page('p-b')]);

    expect(await repos.pages.listByDocument('doc-1')).toEqual([
      { ...page('p-a'), documentId: 'doc-1', index: 0 },
      { ...page('p-b'), documentId: 'doc-1', index: 1 },
    ]);
  });

  it('creates nothing when a page can not be saved', async () => {
    const page = { id: 'same', relativePath: 'documents/doc-1/a.jpg', width: null, height: null };

    await expect(repos.documents.create(newDocument('doc-1'), [page, page])).rejects.toThrow();

    expect(await repos.documents.get('doc-1')).toBeNull();
    expect(await repos.pages.listByDocument('doc-1')).toEqual([]);
  });

  it('lists active documents newest first', async () => {
    await repos.documents.create(newDocument('older', 'Old'));
    clock.advance(1000);
    await repos.documents.create(newDocument('newer', 'New'));

    const list = await repos.documents.list();

    expect(list.map((document) => document.id)).toEqual(['newer', 'older']);
  });

  it('lists the titles of active documents newest first', async () => {
    await repos.documents.create(newDocument('older', 'Old'));
    clock.advance(1000);
    await repos.documents.create(newDocument('newer', 'New'));
    await repos.documents.create(newDocument('gone', 'Deleted'));
    await repos.documents.remove('gone');

    expect(await repos.documents.listTitles()).toEqual([
      { id: 'newer', title: 'New' },
      { id: 'older', title: 'Old' },
    ]);
  });

  it('stores the analysis as JSON and rebuilds the search text on update', async () => {
    await repos.documents.create(newDocument('doc-1', 'Письмо'));
    clock.advance(1000);

    const analysis = {
      ...ANALYSIS_FIXTURES.invoice,
      summary: 'Нужно оплатить ШТРАФ до конца месяца.',
      keyFacts: [{ kind: 'amount' as const, label: 'Сумма', value: '84,20 €' }],
    };

    const updated = await repos.documents.update('doc-1', {
      status: 'ready',
      senderName: 'Finanzamt Berlin',
      analysis,
      analysisLocale: 'ru',
    });

    expect(updated.analysis).toEqual(analysis);
    expect(updated.searchText).toBe(
      'письмо finanzamt berlin нужно оплатить штраф до конца месяца. 84,20 €'
    );
    expect(updated.updatedAt).toBe('2026-10-17T09:00:01.000Z');
    expect(updated.createdAt).toBe('2026-10-17T09:00:00.000Z');
  });

  it('throws when updating a missing document', async () => {
    await expect(repos.documents.update('missing', { title: 'x' })).rejects.toThrow(/not found/);
  });

  it('records «Got it» with the time from the clock (HOME-1)', async () => {
    await repos.documents.create(newDocument('doc-1'));
    clock.advance(5000);

    expect(await repos.documents.dismissAttention('doc-1')).toBe(true);

    expect(await repos.documents.get('doc-1')).toMatchObject({
      attentionDismissedAt: '2026-10-17T09:00:05.000Z',
      updatedAt: '2026-10-17T09:00:05.000Z',
    });
    await repos.documents.remove('doc-1');
    expect(await repos.documents.dismissAttention('doc-1')).toBe(false);
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

  describe('analysis status (SPEC §6.3)', () => {
    const invoice = ANALYSIS_FIXTURES.invoice;
    const job = (jobId = 'job-1') => ({ jobId, locale: 'ru' });
    const failure = (code: 'network' | 'interrupted', jobId = 'job-1') => ({ jobId, code });
    const queuedDeletions = () => repos.analysisJobDeletions.list();
    const outcome = (documentId: string, jobId = 'job-1') => ({
      jobId,
      analysis: invoice,
      pageCount: 2,
      deadlines: [
        {
          id: 'dl-1',
          documentId,
          kind: 'payment' as const,
          description: 'Оплатить счёт',
          dueDate: '2026-10-31',
          dateSource: 'explicit' as const,
          confidence: 'high' as const,
        },
      ],
      actions: [
        {
          id: 'ac-1',
          documentId,
          description: 'Оплатить 84,20 €',
          priority: 'high' as const,
          deadlineId: 'dl-1',
        },
      ],
    });

    it('starts an analysis of a draft once, and of a failed document again', async () => {
      await repos.documents.create(newDocument('doc-1', ''));

      expect(await repos.documents.startAnalysis('doc-1', job())).toBe(true);
      expect(await repos.documents.startAnalysis('doc-1', job())).toBe(false);
      expect(await repos.documents.failAnalysis('doc-1', failure('network'))).toBe(true);
      expect(await repos.documents.get('doc-1')).toMatchObject({
        status: 'failed',
        errorCode: 'network',
      });

      expect(await repos.documents.startAnalysis('doc-1', job())).toBe(true);
      expect(await repos.documents.get('doc-1')).toMatchObject({
        status: 'analyzing',
        errorCode: null,
      });
    });

    it('starts a new analysis of a ready document (ANL-8), not of a deleted or missing one', async () => {
      await repos.documents.create({ ...newDocument('ready'), status: 'ready' });
      await repos.documents.create(newDocument('deleted'));
      await repos.documents.remove('deleted');

      expect(await repos.documents.startAnalysis('ready', job())).toBe(true);
      expect(await repos.documents.startAnalysis('ready', job())).toBe(false);
      expect(await repos.documents.startAnalysis('deleted', job())).toBe(false);
      expect(await repos.documents.startAnalysis('missing', job())).toBe(false);
    });

    it('stores the analysis with its deadlines and actions and makes the document ready', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', job());
      clock.advance(30_000);

      expect(await repos.documents.saveAnalysis('doc-1', outcome('doc-1'))).toBe(true);

      expect(await repos.documents.get('doc-1')).toMatchObject({
        title: invoice.title,
        documentType: 'invoice',
        senderName: 'Stadtwerke Musterstadt GmbH',
        documentDate: '2026-10-03',
        status: 'ready',
        errorCode: null,
        pageCount: 2,
        analysis: invoice,
        analysisLocale: 'ru',
        analyzedAt: '2026-10-17T09:00:30.000Z',
      });
      expect((await repos.documents.search('stadtwerke')).map((d) => d.id)).toEqual(['doc-1']);
      expect(await repos.deadlines.list({ documentId: 'doc-1' })).toMatchObject([
        { id: 'dl-1', status: 'open', reminderOffsetsDays: null, dueTime: null },
      ]);
      expect(await repos.actions.listByDocument('doc-1')).toMatchObject([
        { id: 'ac-1', deadlineId: 'dl-1', done: false },
      ]);
    });

    describe('re-analysis (ANL-8)', () => {
      /** doc-1 analyzed once: a payment deadline with its action, and an undated action. */
      async function analyzedOnce() {
        await repos.documents.create(newDocument('doc-1', ''));
        await repos.documents.startAnalysis('doc-1', job());
        const first = outcome('doc-1');
        await repos.documents.saveAnalysis('doc-1', {
          ...first,
          actions: [
            ...first.actions,
            {
              id: 'ac-undated',
              documentId: 'doc-1',
              description: 'Сохранить счёт',
              priority: 'low' as const,
            },
          ],
        });
      }

      /** The same document analyzed again: the payment found again, and a new deadline. */
      const second = () => ({
        ...outcome('doc-1'),
        analysis: { ...invoice, title: 'Счёт Stadtwerke за сентябрь' },
        deadlines: [
          {
            id: 'dl-2',
            documentId: 'doc-1',
            kind: 'payment' as const,
            description: 'Оплатить счёт до конца месяца',
            dueDate: '2026-10-31',
            dateSource: 'explicit' as const,
            confidence: 'high' as const,
          },
          {
            id: 'dl-3',
            documentId: 'doc-1',
            kind: 'response' as const,
            description: 'Оспорить счёт',
            dueDate: '2026-11-03',
            dateSource: 'computed' as const,
            confidence: 'medium' as const,
          },
        ],
        actions: [
          {
            id: 'ac-2',
            documentId: 'doc-1',
            description: 'Оплатить 84,20 €',
            priority: 'high' as const,
            deadlineId: 'dl-2',
          },
        ],
      });

      async function analyzeAgain() {
        clock.advance(60_000);
        expect(await repos.documents.startAnalysis('doc-1', job('job-2'))).toBe(true);
        expect(await repos.documents.saveAnalysis('doc-1', { ...second(), jobId: 'job-2' })).toBe(
          true
        );
      }

      const liveDeadlines = async () =>
        (await repos.deadlines.list({ documentId: 'doc-1' })).map((d) => d.id);
      const liveActions = async () =>
        (await repos.actions.listByDocument('doc-1')).map((a) => a.id);

      it('replaces deadlines and actions the person did nothing to', async () => {
        await analyzedOnce();

        await analyzeAgain();

        expect(await liveDeadlines()).toEqual(['dl-2', 'dl-3']);
        expect(await liveActions()).toEqual(['ac-2']);
        expect(await repos.documents.get('doc-1')).toMatchObject({
          title: 'Счёт Stadtwerke за сентябрь',
          analyzedAt: '2026-10-17T09:01:00.000Z',
          status: 'ready',
        });
      });

      it('wipes what it replaces, like a deletion (STO-6)', async () => {
        await analyzedOnce();

        await analyzeAgain();

        const wiped = await db.getAllAsync<{ description: string; deleted_at: string | null }>(
          `SELECT description, deleted_at FROM deadlines WHERE id = 'dl-1'
           UNION ALL SELECT description, deleted_at FROM actions WHERE id IN ('ac-1', 'ac-undated')`
        );
        expect(wiped).toEqual(
          Array(3).fill({ description: '', deleted_at: '2026-10-17T09:01:00.000Z' })
        );
      });

      it('keeps a deadline done meanwhile with its action, and drops the new duplicate', async () => {
        await analyzedOnce();
        await repos.documents.startAnalysis('doc-1', job());
        // «Done» while the new analysis is on its way.
        await repos.actions.setDone('ac-1', true);
        await repos.documents.saveAnalysis('doc-1', second());

        expect(await liveDeadlines()).toEqual(['dl-1', 'dl-3']);
        expect(await liveActions()).toEqual(['ac-1']);
        expect(await repos.deadlines.get('dl-1')).toMatchObject({ status: 'done' });
      });

      it('keeps a deadline marked «Not relevant»', async () => {
        await analyzedOnce();
        await repos.deadlines.update('dl-1', { status: 'dismissed' });

        await analyzeAgain();

        expect(await liveDeadlines()).toEqual(['dl-1', 'dl-3']);
        expect(await repos.deadlines.get('dl-1')).toMatchObject({ status: 'dismissed' });
      });

      it('keeps a date the person set, and knows the old date when it comes back', async () => {
        await analyzedOnce();
        await repos.deadlines.changeDate('dl-1', '2026-11-14');

        await analyzeAgain();

        expect(await liveDeadlines()).toEqual(['dl-3', 'dl-1']);
        expect(await repos.deadlines.get('dl-1')).toMatchObject({
          dueDate: '2026-11-14',
          dateSource: 'user',
          originalDate: '2026-10-31',
          status: 'open',
        });
        expect(await liveActions()).toEqual(['ac-1']);
      });

      it('keeps a title the person gave the document', async () => {
        await analyzedOnce();
        await repos.documents.update('doc-1', { title: 'Свет, сентябрь' });

        await analyzeAgain();

        expect(await repos.documents.get('doc-1')).toMatchObject({ title: 'Свет, сентябрь' });
        expect((await repos.documents.search('свет')).map((d) => d.id)).toEqual(['doc-1']);
      });

      it('keeps a title given before the first analysis', async () => {
        await repos.documents.create(newDocument('doc-1', 'Письмо со дня рождения'));
        await repos.documents.startAnalysis('doc-1', job());

        await repos.documents.saveAnalysis('doc-1', outcome('doc-1'));

        expect(await repos.documents.get('doc-1')).toMatchObject({
          title: 'Письмо со дня рождения',
          analysis: invoice,
        });
      });

      it('leaves the previous analysis in place when the new one fails', async () => {
        await analyzedOnce();
        await repos.documents.startAnalysis('doc-1', job());

        await repos.documents.failAnalysis('doc-1', failure('network'));

        expect(await repos.documents.get('doc-1')).toMatchObject({
          status: 'failed',
          errorCode: 'network',
          analysis: invoice,
          title: invoice.title,
        });
        expect(await liveDeadlines()).toEqual(['dl-1']);
      });
    });

    it('stores the explanation language the job asked for, and queues the job for deletion', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', { jobId: 'job-1', locale: 'en' });

      await repos.documents.saveAnalysis('doc-1', outcome('doc-1'));

      expect(await repos.documents.get('doc-1')).toMatchObject({
        analysisLocale: 'en',
        analysisJobId: 'job-1',
      });
      expect(await queuedDeletions()).toEqual(['job-1']);
    });

    it('stores no result of another job than the current one', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', job('job-2'));

      expect(await repos.documents.saveAnalysis('doc-1', outcome('doc-1', 'job-1'))).toBe(false);
      expect(await repos.documents.failAnalysis('doc-1', failure('network', 'job-1'))).toBe(false);

      expect(await repos.documents.get('doc-1')).toMatchObject({ status: 'analyzing' });
      expect(await repos.deadlines.list({ documentId: 'doc-1' })).toEqual([]);
      expect(await queuedDeletions()).toEqual([]);
    });

    it('queues the job of a failed analysis for deletion only when asked', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', job());
      await repos.documents.failAnalysis('doc-1', failure('network'));
      expect(await queuedDeletions()).toEqual([]);

      await repos.documents.startAnalysis('doc-1', job('job-2'));
      await repos.documents.failAnalysis('doc-1', {
        jobId: 'job-2',
        code: 'analysis_failed',
        removeJob: true,
      });

      expect(await repos.documents.get('doc-1')).toMatchObject({
        status: 'failed',
        errorCode: 'analysis_failed',
      });
      expect(await queuedDeletions()).toEqual(['job-2']);
    });

    it('lists the documents being analyzed with their jobs', async () => {
      await repos.documents.create(newDocument('doc-1'));
      await repos.documents.create(newDocument('doc-2'));
      await repos.documents.create(newDocument('draft'));
      await repos.documents.startAnalysis('doc-1', job('job-1'));
      await repos.documents.startAnalysis('doc-2', job('job-2'));

      expect(await repos.documents.listAnalyzing()).toEqual([
        { id: 'doc-1', jobId: 'job-1' },
        { id: 'doc-2', jobId: 'job-2' },
      ]);
    });

    it('finds the document of a job once it ended, but not once deleted (ANL-12)', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.create(newDocument('doc-2', ''));
      await repos.documents.startAnalysis('doc-1', job('job-1'));
      await repos.documents.startAnalysis('doc-2', job('job-2'));
      await repos.documents.saveAnalysis('doc-1', outcome('doc-1', 'job-1'));

      expect(await repos.documents.findIdByAnalysisJob('job-1')).toBe('doc-1');
      expect(await repos.documents.findIdByAnalysisJob('job-2')).toBe('doc-2');
      expect(await repos.documents.findIdByAnalysisJob('job-3')).toBeNull();

      await repos.documents.remove('doc-1');
      expect(await repos.documents.findIdByAnalysisJob('job-1')).toBeNull();
    });

    describe('cancel (ANL-13)', () => {
      it('returns a draft to draft and queues its job for deletion', async () => {
        await repos.documents.create(newDocument('doc-1', ''));
        await repos.documents.startAnalysis('doc-1', job());

        expect(await repos.documents.cancelAnalysis('doc-1', 'job-1')).toBe(true);

        expect(await repos.documents.get('doc-1')).toMatchObject({
          status: 'draft',
          errorCode: null,
        });
        expect(await queuedDeletions()).toEqual(['job-1']);
        // The result of the cancelled job is never stored.
        expect(await repos.documents.saveAnalysis('doc-1', outcome('doc-1'))).toBe(false);
      });

      it('returns a re-analyzed document to ready with its previous result', async () => {
        await repos.documents.create(newDocument('doc-1', ''));
        await repos.documents.startAnalysis('doc-1', job());
        await repos.documents.saveAnalysis('doc-1', outcome('doc-1'));
        await repos.documents.startAnalysis('doc-1', job('job-2'));

        expect(await repos.documents.cancelAnalysis('doc-1', 'job-2')).toBe(true);

        expect(await repos.documents.get('doc-1')).toMatchObject({
          status: 'ready',
          analysis: invoice,
        });
        expect(await repos.deadlines.list({ documentId: 'doc-1' })).toHaveLength(1);
      });

      it('cancels nothing that is not analyzing under that job', async () => {
        await repos.documents.create(newDocument('doc-1', ''));
        await repos.documents.startAnalysis('doc-1', job());

        expect(await repos.documents.cancelAnalysis('doc-1', 'job-other')).toBe(false);
        await repos.documents.failAnalysis('doc-1', failure('network'));
        expect(await repos.documents.cancelAnalysis('doc-1', 'job-1')).toBe(false);

        expect(await queuedDeletions()).toEqual([]);
      });
    });

    it('stores nothing for a document deleted while it was analyzed', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', job());
      await repos.documents.remove('doc-1');

      expect(await repos.documents.saveAnalysis('doc-1', outcome('doc-1'))).toBe(false);
      expect(await repos.documents.failAnalysis('doc-1', failure('network'))).toBe(false);
      expect(await repos.deadlines.list({ documentId: 'doc-1' })).toEqual([]);
    });

    it('writes neither the document nor any deadline when one record can not be stored', async () => {
      await repos.documents.create(newDocument('doc-1', ''));
      await repos.documents.startAnalysis('doc-1', job());
      const broken = outcome('doc-1');
      // The action points to a deadline that doesn't exist: the foreign key rejects it.
      broken.actions[0] = { ...broken.actions[0], deadlineId: 'missing-deadline' };

      await expect(repos.documents.saveAnalysis('doc-1', broken)).rejects.toThrow();

      expect(await repos.documents.get('doc-1')).toMatchObject({ status: 'analyzing' });
      expect(await repos.deadlines.list({ documentId: 'doc-1' })).toEqual([]);
    });

    it('fails analyses without a job, left by an older app, as interrupted at startup (ANL-4)', async () => {
      await repos.documents.create(newDocument('with-job'));
      await repos.documents.startAnalysis('with-job', job());
      // Before task 4.8 an analysis had no job: the column stays empty in such a row.
      await repos.documents.create({ ...newDocument('without-job'), status: 'analyzing' });
      await repos.documents.create(newDocument('draft'));

      expect(await repos.documents.failInterruptedAnalyses()).toBe(1);

      expect(await repos.documents.get('without-job')).toMatchObject({
        status: 'failed',
        errorCode: 'interrupted',
      });
      // The server is asked about this one.
      expect(await repos.documents.get('with-job')).toMatchObject({ status: 'analyzing' });
      expect(await repos.documents.get('draft')).toMatchObject({ status: 'draft' });
    });
  });

  describe('remove (STO-6)', () => {
    beforeEach(async () => {
      await repos.documents.create(newDocument('doc-1', 'Договор аренды'));
      await repos.documents.update('doc-1', {
        senderName: 'ООО Ромашка',
        analysis: { ...ANALYSIS_FIXTURES.contract, summary: 'Секретное содержание' },
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

    it('queues the job of an analysis in progress, or of a broken upload, for deletion', async () => {
      await repos.documents.create(newDocument('analyzing'));
      await repos.documents.startAnalysis('analyzing', { jobId: 'job-a', locale: 'ru' });
      await repos.documents.create(newDocument('broken'));
      await repos.documents.startAnalysis('broken', { jobId: 'job-b', locale: 'ru' });
      await repos.documents.failAnalysis('broken', { jobId: 'job-b', code: 'network' });

      await repos.documents.remove('analyzing');
      await repos.documents.remove('broken');
      await repos.documents.remove('doc-1');

      expect(await repos.analysisJobDeletions.list()).toEqual(['job-a', 'job-b']);
      const tombstone = await db.getFirstAsync<Record<string, unknown>>(
        'SELECT analysis_job_id, analysis_job_locale FROM documents WHERE id = ?',
        ['analyzing']
      );
      expect({ ...tombstone }).toEqual({ analysis_job_id: null, analysis_job_locale: null });
    });

    it('returns null for a document that is already gone', async () => {
      await repos.documents.remove('doc-1');

      await expect(repos.documents.remove('doc-1')).resolves.toBeNull();
    });

    it('goes with everything else on «Delete all data», tombstones and settings too (STO-7)', async () => {
      await repos.documents.create(newDocument('doc-2'));
      await repos.documents.remove('doc-2');
      await repos.settings.update({ locale: 'ru', reminderTime: '08:30' });
      await repos.documents.startAnalysis('doc-1', { jobId: 'job-1', locale: 'ru' });
      await repos.documents.cancelAnalysis('doc-1', 'job-1');

      await repos.wipeAll();

      for (const table of [
        'analysis_job_deletions',
        'documents',
        'pages',
        'deadlines',
        'actions',
        'scheduled_notifications',
        'settings',
      ]) {
        expect(await db.getAllAsync(`SELECT * FROM ${table}`)).toEqual([]);
      }
      expect(await repos.settings.get()).toEqual(DEFAULT_SETTINGS);
      // The database still works as on a fresh install.
      await repos.documents.create(newDocument('doc-3'));
      expect(await repos.documents.list()).toHaveLength(1);
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
