import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import NewCaseRoute from '@/app/cases/new';
import DocumentRoute from '@/app/documents/[id]';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { formatCalendarDate, formatTimestampDate } from '@/lib/i18n/format';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import { createTestProviders } from '@/test/render';
import { createFakeClock, installTestRepositories } from '@/test/sqlite';

import * as api from '../api';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'case-new' }));

const INVOICE = 'Счёт EDP за сентябрь';
const REMINDER = 'Напоминание об оплате';

let repositories: Repositories;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(async () => {
  clock = createFakeClock();
  ({ repositories } = await installTestRepositories(clock.now));
  await repositories.cases.create({ id: 'flat', name: 'Квартира' });
  await repositories.cases.create({ id: 'car', name: 'Машина' });
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

type Seed = {
  title: string;
  /** The invoice number as this document writes it. */
  number?: string;
  sender?: string;
  documentDate?: string | null;
  /** Its one deadline with one action: due this many days from today, the action done or not. */
  due?: { inDays: number; done?: boolean };
  caseId?: string;
};

/** An analyzed document, stored the way the app stores an analysis; the next one is newer. */
async function addAnalyzed(
  id: string,
  { title, number = 'FT 2026/123', sender = 'EDP Comercial', documentDate, due, caseId }: Seed
) {
  const analysis = {
    ...ANALYSIS_FIXTURES.invoice,
    title,
    documentDate: documentDate === undefined ? '2026-09-03' : documentDate,
    sender: { name: sender, kind: 'company' as const },
    keyFacts: [{ kind: 'reference' as const, label: 'Номер счёта', value: number }],
  };
  await repositories.documents.create({
    id,
    title: '',
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 1,
    fileSize: 1000,
  });
  await repositories.documents.startAnalysis(id, { jobId: `job-${id}`, locale: 'ru' });
  await repositories.documents.saveAnalysis(id, {
    jobId: `job-${id}`,
    analysis,
    pageCount: 1,
    deadlines: due
      ? [
          {
            id: `dl-${id}`,
            documentId: id,
            kind: 'payment',
            description: 'Оплатить 84,20 €',
            dueDate: addDays(localCalendarDate(new Date()), due.inDays),
            dateSource: 'explicit',
            confidence: 'high',
          },
        ]
      : [],
    actions: due
      ? [
          {
            id: `ac-${id}`,
            documentId: id,
            deadlineId: `dl-${id}`,
            description: 'Перевести деньги',
            priority: 'high',
          },
        ]
      : [],
  });
  if (due?.done) await repositories.actions.setDone(`ac-${id}`, true);
  if (caseId) await repositories.documents.moveToCase([id], caseId);
  clock.advance(60_000);
}

/** An invoice and, newer, the reminder about it: the same number, written differently. */
async function addPair(invoice: Partial<Seed> = {}, reminder: Partial<Seed> = {}) {
  await addAnalyzed('invoice', { title: INVOICE, ...invoice });
  await addAnalyzed('reminder', { title: REMINDER, number: 'FT-2026-123', ...reminder });
}

/** Opens the document's screen; resolves to the user who presses things on it. */
async function openDocument(id = 'reminder') {
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      'documents/[id]': DocumentRoute,
      'cases/new': NewCaseRoute,
    },
    { initialUrl: `/documents/${id}`, wrapper: createTestProviders() }
  );
  return userEvent.setup();
}

const block = () => screen.findByRole('heading', { name: 'Related documents' });
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const caseOf = async (id: string) => (await repositories.documents.get(id))?.caseId;

describe('RelatedDocuments (LINK-3)', () => {
  it('lists a document with the same number: its date, the number as written here, its nearest deadline', async () => {
    await addPair({ due: { inDays: 3 } });
    await openDocument();

    expect(await block()).toBeOnTheScreen();
    const date = formatCalendarDate('2026-09-03', 'en');
    const row = await screen.findByRole('link', {
      name: new RegExp(
        `^${INVOICE}, ${escape(date)}, Shared number: FT-2026-123, In 3 days · .+, Оплатить 84,20 €$`
      ),
    });
    expect(row).toBeOnTheScreen();
    expect(screen.getByText(`${date} · Shared number: FT-2026-123`)).toBeOnTheScreen();
    expect(screen.getByText('In 3 days')).toBeOnTheScreen();
    expect(screen.getByText('Оплатить 84,20 €')).toBeOnTheScreen();
  });

  it('says in words that the deadline of the related document has passed', async () => {
    await addPair({ due: { inDays: -2 } });
    await openDocument();

    expect(
      await screen.findByRole('link', { name: new RegExp(`^${INVOICE}, .+, Overdue · `) })
    ).toBeOnTheScreen();
    expect(screen.getByText('Overdue')).toBeOnTheScreen();
  });

  it('shows that everything in the earlier document is marked done', async () => {
    await addPair({ due: { inDays: -2, done: true } });
    await openDocument();

    expect(
      await screen.findByRole('link', {
        name: new RegExp(`^${INVOICE}, .+, Shared number: FT-2026-123, Everything is marked done$`),
      })
    ).toBeOnTheScreen();
    expect(screen.getByText('Everything is marked done')).toBeOnTheScreen();
  });

  it('says nothing about a document that asked for nothing, and dates it by when it was added', async () => {
    await addPair({ documentDate: null });
    const added = formatTimestampDate(
      (await repositories.documents.get('invoice'))?.createdAt ?? '',
      'en'
    );
    await openDocument();

    expect(
      await screen.findByRole('link', { name: new RegExp(`^${INVOICE}`) })
    ).toHaveAccessibleName(`${INVOICE}, ${added}, Shared number: FT-2026-123`);
  });

  it('shows no block for a document that shares no number', async () => {
    await addPair({ number: 'FT 2026/999' });
    await openDocument();

    expect(await screen.findByRole('heading', { name: REMINDER })).toBeOnTheScreen();
    expect(await screen.findByText('In short')).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: 'Related documents' })).not.toBeOnTheScreen();
  });

  it('opens the related document, which shows this one in turn', async () => {
    await addPair();
    const user = await openDocument();

    await user.press(await screen.findByRole('link', { name: new RegExp(`^${INVOICE}`) }));

    await waitFor(() => expect(screen).toHavePathname('/documents/invoice'));
    expect(
      await screen.findByRole('link', {
        name: new RegExp(`^${REMINDER}, .+, Shared number: FT 2026/123$`),
      })
    ).toBeOnTheScreen();
  });

  it('offers to load the block again when it fails', async () => {
    await addPair();
    jest.spyOn(api, 'listRelatedDocuments').mockRejectedValueOnce(new Error('disk'));
    const user = await openDocument();

    expect(await block()).toBeOnTheScreen();
    expect(screen.getByText("Couldn't load this part of the document.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: new RegExp(`^${INVOICE}`) })).toBeOnTheScreen();
  });
});

describe('the case of related documents (LINK-4)', () => {
  it('moves this document to the case of the related one', async () => {
    await addPair({ caseId: 'flat' });
    const user = await openDocument();

    await user.press(await screen.findByRole('button', { name: 'Move to “Квартира”' }));

    expect(await screen.findByRole('button', { name: 'Case: Квартира. Change' })).toBeOnTheScreen();
    expect(await caseOf('reminder')).toBe('flat');
    // In one case now: the row stays, without buttons.
    expect(screen.getByRole('link', { name: new RegExp(`^${INVOICE}`) })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Move to/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Not related/ })).not.toBeOnTheScreen();
  });

  it('moves this document there from another case too', async () => {
    await addPair({ caseId: 'car' }, { caseId: 'flat' });
    const user = await openDocument();

    await user.press(await screen.findByRole('button', { name: 'Move to “Машина”' }));

    expect(await screen.findByRole('button', { name: 'Case: Машина. Change' })).toBeOnTheScreen();
    expect(await caseOf('reminder')).toBe('car');
    expect(await caseOf('invoice')).toBe('car');
  });

  it('adds the related document to the case of this one, and names both for a screen reader', async () => {
    await addPair({}, { caseId: 'flat' });
    const user = await openDocument();

    const add = await screen.findByRole('button', {
      name: `Add “${INVOICE}” to the case “Квартира”`,
    });
    expect(add).toHaveTextContent('Add to “Квартира”');
    await user.press(add);

    await waitFor(async () => expect(await caseOf('invoice')).toBe('flat'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Not related/ })).not.toBeOnTheScreen()
    );
    expect(await caseOf('reminder')).toBe('flat');
  });

  it('starts a new case with both documents and comes back to this one', async () => {
    await addPair();
    const user = await openDocument();

    await user.press(await screen.findByRole('button', { name: `New case with “${INVOICE}”` }));
    expect(screen).toHavePathname('/cases/new');
    await user.type(await screen.findByLabelText('Case name'), 'Свет');
    await user.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen).toHavePathname('/documents/reminder'));
    expect(await screen.findByRole('button', { name: 'Case: Свет. Change' })).toBeOnTheScreen();
    expect(await caseOf('reminder')).toBe('case-new');
    expect(await caseOf('invoice')).toBe('case-new');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Not related/ })).not.toBeOnTheScreen()
    );
  });

  it('says so when the case was deleted meanwhile, and stops offering it', async () => {
    await addPair({ caseId: 'flat' });
    const user = await openDocument();
    const move = await screen.findByRole('button', { name: 'Move to “Квартира”' });
    await repositories.cases.remove('flat');

    await user.press(move);

    expect(await screen.findByText("Couldn't move the document. Try again.")).toBeOnTheScreen();
    expect(await caseOf('reminder')).toBeNull();
    // Neither document has a case now.
    expect(
      await screen.findByRole('button', { name: `New case with “${INVOICE}”` })
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Move to “Квартира”' })).not.toBeOnTheScreen();
  });

  it('shows no buttons for documents already in one case', async () => {
    await addPair({ caseId: 'flat' }, { caseId: 'flat' });
    await openDocument();

    expect(await screen.findByRole('link', { name: new RegExp(`^${INVOICE}`) })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Not related/ })).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('button', { name: /^(Move|Add) to|^New case/ })
    ).not.toBeOnTheScreen();
  });
});

describe('«Not related» (LINK-4)', () => {
  it('takes the row away and remembers the pair', async () => {
    await addPair();
    const user = await openDocument();

    await user.press(await screen.findByRole('button', { name: `Not related to “${INVOICE}”` }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Related documents' })).not.toBeOnTheScreen()
    );
    expect(await repositories.documents.listRelated('reminder')).toEqual([]);
    expect(await repositories.documents.listRelated('invoice')).toEqual([]);
  });

  it('keeps the other related documents, and the pair is gone from the other document too', async () => {
    await addAnalyzed('contract', { title: 'Договор с EDP' });
    await addPair();
    await repositories.documents.dismissLink('reminder', 'invoice');
    await openDocument('invoice');

    expect(await screen.findByRole('link', { name: /^Договор с EDP/ })).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: new RegExp(`^${REMINDER}`) })).not.toBeOnTheScreen();
  });

  it('says so when it could not be saved, and keeps the row', async () => {
    await addPair();
    jest.spyOn(api, 'dismissRelatedDocument').mockRejectedValueOnce(new Error('disk'));
    const user = await openDocument();

    await user.press(await screen.findByRole('button', { name: `Not related to “${INVOICE}”` }));

    expect(await screen.findByText("Couldn't save that. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: new RegExp(`^${INVOICE}`) })).toBeOnTheScreen();
  });
});
