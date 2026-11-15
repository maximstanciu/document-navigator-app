import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisResult } from '@/shared/analysis/schema';
import { createFakeClock, createNodeDatabase, createTestDatabase } from '@/test/sqlite';

import type { SqlDatabase } from './database';
import { backfillDocumentRefs } from './document-refs';
import { migrate, MIGRATIONS } from './migrations';
import { createRepositories, purgeTombstones, type Repositories } from './repositories';

const DAY = 24 * 60 * 60 * 1000;

let db: SqlDatabase;
let repos: Repositories;
let clock: ReturnType<typeof createFakeClock>;
let jobs: number;

beforeEach(async () => {
  db = await createTestDatabase();
  clock = createFakeClock();
  repos = createRepositories(db, clock.now);
  jobs = 0;
});

/** An invoice of `sender` that carries `numbers` among its key facts. */
function analysisWith(
  numbers: readonly string[],
  sender: string | null = 'EDP Comercial'
): AnalysisResult {
  return {
    ...ANALYSIS_FIXTURES.invoice,
    sender: sender ? { name: sender, kind: 'company' } : null,
    keyFacts: [
      { kind: 'amount', label: 'Сумма к оплате', value: '84,20 €' },
      ...numbers.map((value) => ({ kind: 'reference' as const, label: 'Номер', value })),
      { kind: 'account', label: 'IBAN', value: 'PT50 0002 0123 1234 5678 9015 4' },
    ],
  };
}

/** Analyzes the document the way the app does: a job, then its result. */
async function analyze(id: string, analysis: AnalysisResult) {
  const jobId = `job-${++jobs}`;
  await repos.documents.startAnalysis(id, { jobId, locale: 'ru' });
  await repos.documents.saveAnalysis(id, {
    jobId,
    analysis,
    pageCount: 1,
    deadlines: [],
    actions: [],
  });
}

/** A new document analyzed as `analysis`; the next one is a second newer. */
async function addAnalyzed(id: string, analysis: AnalysisResult) {
  await repos.documents.create({
    id,
    title: '',
    source: 'scan',
    mimeType: 'image/jpeg',
    fileSize: 1000,
  });
  await analyze(id, analysis);
  clock.advance(1000);
}

const refsOf = (id: string) =>
  db.getAllAsync<{ value: string; sender_key: string | null }>(
    'SELECT value, sender_key FROM document_refs WHERE document_id = ? ORDER BY rowid',
    [id]
  );
const relatedIds = async (id: string) =>
  (await repos.documents.listRelated(id)).map((related) => related.id);
const count = async (table: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n;

describe('the numbers of a document (LINK-1)', () => {
  it('are stored with the analysis: reference key facts, normalized, with the sender', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123', 'Contrato 4500-778']));

    expect(await refsOf('invoice')).toEqual([
      { value: 'FT2026123', sender_key: 'EDPCOMERCIAL' },
      { value: 'CONTRATO4500778', sender_key: 'EDPCOMERCIAL' },
    ]);
  });

  it('are stored without a sender when the analysis names none', async () => {
    await addAnalyzed('letter', analysisWith(['FT 2026/123'], null));

    expect(await refsOf('letter')).toEqual([{ value: 'FT2026123', sender_key: null }]);
  });

  it('are replaced by a new analysis (ANL-8)', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));

    await analyze('invoice', analysisWith(['FT 2026/456'], 'EDP'));

    expect(await refsOf('invoice')).toEqual([{ value: 'FT2026456', sender_key: 'EDP' }]);
  });

  it('are not stored when the result is not: the document is no longer analyzing', async () => {
    await repos.documents.create({
      id: 'doc',
      title: '',
      source: 'scan',
      mimeType: 'image/jpeg',
      fileSize: 1000,
    });
    await repos.documents.startAnalysis('doc', { jobId: 'job-a', locale: 'ru' });
    await repos.documents.cancelAnalysis('doc', 'job-a');

    const saved = await repos.documents.saveAnalysis('doc', {
      jobId: 'job-a',
      analysis: analysisWith(['FT 2026/123']),
      pageCount: 1,
      deadlines: [],
      actions: [],
    });

    expect(saved).toBe(false);
    expect(await refsOf('doc')).toEqual([]);
  });

  it('follow an analysis written through update()', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));

    await repos.documents.update('invoice', { analysis: analysisWith(['FT 2026/456']) });
    expect(await refsOf('invoice')).toEqual([{ value: 'FT2026456', sender_key: 'EDPCOMERCIAL' }]);

    await repos.documents.update('invoice', { title: 'Счёт' });
    expect(await refsOf('invoice')).toHaveLength(1);
  });
});

describe('listRelated (LINK-2, LINK-3)', () => {
  it('finds the documents that share a number, from both sides', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('other', analysisWith(['FT 2026/999']));
    await addAnalyzed('reminder', analysisWith(['ft-2026-123']));

    expect(await repos.documents.listRelated('reminder')).toEqual([
      {
        id: 'invoice',
        title: ANALYSIS_FIXTURES.invoice.title,
        documentDate: ANALYSIS_FIXTURES.invoice.documentDate,
        createdAt: '2026-10-17T09:00:00.000Z',
        caseId: null,
        sharedNumber: 'FT2026123',
      },
    ]);
    expect(await relatedIds('invoice')).toEqual(['reminder']);
    expect(await relatedIds('other')).toEqual([]);
  });

  it('gives nothing for a document without an analysis or without numbers', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('plain', analysisWith([]));
    await repos.documents.create({
      id: 'draft',
      title: '',
      source: 'scan',
      mimeType: 'image/jpeg',
      fileSize: 1000,
    });

    expect(await relatedIds('plain')).toEqual([]);
    expect(await relatedIds('draft')).toEqual([]);
    expect(await relatedIds('missing')).toEqual([]);
  });

  it('lists the newest first and three at most', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      await addAnalyzed(id, analysisWith(['FT 2026/123']));
    }

    expect(await relatedIds('a')).toEqual(['e', 'd', 'c']);
    expect(await relatedIds('e')).toEqual(['d', 'c', 'b']);
  });

  it('links a number that two senders write, not one that three do', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123', 'NIF 123 456 789'], 'EDP'));
    await addAnalyzed('collector', analysisWith(['FT 2026/123', 'NIF 123 456 789'], 'Intrum'));

    expect(await relatedIds('collector')).toEqual(['invoice']);

    // The tax number is now in the letters of three senders: it links nothing. The invoice number
    // still links the first two.
    await addAnalyzed('bank', analysisWith(['NIF 123 456 789'], 'CGD'));

    expect(await relatedIds('bank')).toEqual([]);
    expect(await relatedIds('collector')).toEqual(['invoice']);
    expect((await repos.documents.listRelated('collector'))[0].sharedNumber).toBe('FT2026123');
  });

  it('does not count documents without a sender among the senders', async () => {
    await addAnalyzed('one', analysisWith(['NIF 123 456 789'], 'EDP'));
    await addAnalyzed('two', analysisWith(['NIF 123 456 789'], 'CGD'));
    await addAnalyzed('nobody', analysisWith(['NIF 123 456 789'], null));

    expect(await relatedIds('one')).toEqual(['nobody', 'two']);
  });

  it('gives the shared number that comes first in this document', async () => {
    await addAnalyzed('invoice', analysisWith(['Contrato 4500-778', 'FT 2026/123']));
    await addAnalyzed('reminder', analysisWith(['FT 2026/123', 'Contrato 4500-778']));

    expect((await repos.documents.listRelated('reminder'))[0].sharedNumber).toBe('FT2026123');
    expect((await repos.documents.listRelated('invoice'))[0].sharedNumber).toBe('CONTRATO4500778');
  });

  it('keeps a document related through its previous analysis while it is analyzed again', async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('reminder', analysisWith(['FT 2026/123']));

    await repos.documents.startAnalysis('reminder', { jobId: 'again', locale: 'ru' });

    expect(await relatedIds('invoice')).toEqual(['reminder']);
    expect(await relatedIds('reminder')).toEqual(['invoice']);
  });

  it('tells the case of a related document', async () => {
    await repos.cases.create({ id: 'flat', name: 'Квартира' });
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('reminder', analysisWith(['FT 2026/123']));
    await repos.documents.moveToCase(['invoice'], 'flat');

    expect((await repos.documents.listRelated('reminder'))[0].caseId).toBe('flat');
  });
});

describe('dismissLink (LINK-4)', () => {
  beforeEach(async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('reminder', analysisWith(['FT 2026/123']));
    await addAnalyzed('collector', analysisWith(['FT 2026/123'], 'Intrum'));
  });

  it('hides the pair on both documents and leaves the other links', async () => {
    await repos.documents.dismissLink('reminder', 'invoice');

    expect(await relatedIds('reminder')).toEqual(['collector']);
    expect(await relatedIds('invoice')).toEqual(['collector']);
    expect(await relatedIds('collector')).toEqual(['reminder', 'invoice']);
    expect(await db.getAllAsync('SELECT * FROM document_link_dismissals')).toEqual([
      {
        document_id_a: 'invoice',
        document_id_b: 'reminder',
        created_at: clock.now().toISOString(),
      },
    ]);
  });

  it('is the same pair whichever document it is pressed on', async () => {
    await repos.documents.dismissLink('reminder', 'invoice');
    await repos.documents.dismissLink('invoice', 'reminder');

    expect(await count('document_link_dismissals')).toBe(1);
  });

  it('stays after a new analysis finds the same number again', async () => {
    await repos.documents.dismissLink('reminder', 'invoice');

    await analyze('reminder', analysisWith(['FT 2026/123']));

    expect(await relatedIds('reminder')).toEqual(['collector']);
    expect(await relatedIds('invoice')).toEqual(['collector']);
  });

  it('stores nothing for a document that is gone, or for a document and itself', async () => {
    await repos.documents.remove('invoice');

    await repos.documents.dismissLink('reminder', 'invoice');
    await repos.documents.dismissLink('reminder', 'missing');
    await repos.documents.dismissLink('reminder', 'reminder');

    expect(await count('document_link_dismissals')).toBe(0);
  });
});

describe('deleting (LINK-5)', () => {
  beforeEach(async () => {
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));
    await addAnalyzed('reminder', analysisWith(['FT 2026/123']));
    await addAnalyzed('collector', analysisWith(['FT 2026/123'], 'Intrum'));
    await repos.documents.dismissLink('invoice', 'reminder');
    await repos.documents.dismissLink('collector', 'reminder');
  });

  it('removes a deleted document’s numbers and its pairs at once (STO-6)', async () => {
    await repos.documents.remove('invoice');

    expect(await refsOf('invoice')).toEqual([]);
    expect(await db.getAllAsync('SELECT document_id_a FROM document_link_dismissals')).toEqual([
      { document_id_a: 'collector' },
    ]);
    expect(await relatedIds('collector')).toEqual([]);
    expect(await relatedIds('reminder')).toEqual([]);
  });

  it('leaves nothing behind when the tombstone is purged', async () => {
    await repos.documents.remove('reminder');
    clock.advance(31 * DAY);

    await purgeTombstones(db, new Date(clock.now().getTime() - 30 * DAY));

    expect(await count('document_refs')).toBe(2);
    expect(await count('document_link_dismissals')).toBe(0);
  });

  it('removes every number and pair with «Delete all data» (STO-7)', async () => {
    await repos.wipeAll();

    expect(await count('document_refs')).toBe(0);
    expect(await count('document_link_dismissals')).toBe(0);
  });
});

describe('backfillDocumentRefs (LINK-1)', () => {
  /** A database as the app left it before migration 7, with one analyzed document. */
  async function openBeforeMigration7() {
    const old = createNodeDatabase();
    await old.execAsync('PRAGMA foreign_keys = ON');
    await migrate(
      old,
      MIGRATIONS.filter((migration) => migration.version < 7)
    );
    const insert = (id: string, analysis: string | null, deletedAt: string | null = null) =>
      old.runAsync(
        `INSERT INTO documents (id, title, status, source, mime_type, file_size, analysis,
           created_at, updated_at, deleted_at)
         VALUES (?, 'Счёт', 'ready', 'scan', 'image/jpeg', 1000, ?, ?, ?, ?)`,
        [id, analysis, '2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z', deletedAt]
      );
    await insert('invoice', JSON.stringify(analysisWith(['FT 2026/123'])));
    await insert('reminder', JSON.stringify(analysisWith(['ft-2026-123'], null)));
    await insert('draft', null);
    await insert('broken', '{"keyFacts": [');
    await insert('gone', null, '2026-10-02T09:00:00.000Z');
    await migrate(old);
    return old;
  }

  it('fills the numbers of analyses stored before the migration', async () => {
    const old = await openBeforeMigration7();
    expect(await old.getAllAsync('SELECT * FROM document_refs')).toEqual([]);

    await backfillDocumentRefs(old);

    expect(
      await old.getAllAsync('SELECT * FROM document_refs ORDER BY document_id, value')
    ).toEqual([
      { document_id: 'invoice', value: 'FT2026123', sender_key: 'EDPCOMERCIAL' },
      { document_id: 'reminder', value: 'FT2026123', sender_key: null },
    ]);
    expect(await createRepositories(old).documents.listRelated('reminder')).toMatchObject([
      { id: 'invoice', sharedNumber: 'FT2026123' },
    ]);
  });

  it('does the work once', async () => {
    const old = await openBeforeMigration7();
    await backfillDocumentRefs(old);
    // If it ran again, these rows would come back.
    await old.runAsync('DELETE FROM document_refs');

    await backfillDocumentRefs(old);

    expect(await old.getAllAsync('SELECT * FROM document_refs')).toEqual([]);
  });

  it('leaves the settings readable and the numbers of later analyses alone', async () => {
    await backfillDocumentRefs(db);
    await addAnalyzed('invoice', analysisWith(['FT 2026/123']));

    await backfillDocumentRefs(db);

    expect(await refsOf('invoice')).toHaveLength(1);
    expect((await repos.settings.get()).reminderTime).toBe('09:00');
  });

  it('runs again after «Delete all data», with nothing to fill', async () => {
    await backfillDocumentRefs(db);
    await repos.wipeAll();

    await expect(backfillDocumentRefs(db)).resolves.toBeUndefined();
    expect(await count('document_refs')).toBe(0);
  });
});
