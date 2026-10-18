import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import DocumentRoute from '@/app/documents/[id]';
import { analysisRecords } from '@/features/analysis/analysis-records';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisResult } from '@/shared/analysis/schema';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import { createTestProviders, renderWithProviders } from '@/test/render';
import { createFakeClock, installTestRepositories } from '@/test/sqlite';

import * as api from '../api';
import { DocumentListScreen } from './document-list-screen';

let repositories: Repositories;
let clock: ReturnType<typeof createFakeClock>;

// «Needs attention» is relative to the real «now» the screen reads, so the analyses are made now too.
beforeEach(async () => {
  clock = createFakeClock(new Date().toISOString());
  ({ repositories } = await installTestRepositories(clock.now));
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

async function addDocument(id: string, title: string) {
  await repositories.documents.create({
    id,
    title,
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 2,
    fileSize: 1000,
  });
  clock.advance(60_000);
}

/** `analysis` with its deadlines moved to these many days from today, in order. */
function dueIn(analysis: AnalysisResult, ...days: number[]): AnalysisResult {
  const today = localCalendarDate(new Date());
  return {
    ...analysis,
    deadlines: analysis.deadlines.map((deadline, index) => ({
      ...deadline,
      date: addDays(today, days[index] ?? days[days.length - 1]),
    })),
  };
}

/** A document analyzed as `analysis`, stored the way `analyzeDocument()` stores it. */
async function addAnalyzed(id: string, analysis: AnalysisResult) {
  await repositories.documents.create({
    id,
    title: '',
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 1,
    fileSize: 1000,
  });
  await repositories.documents.startAnalysis(id);
  let next = 0;
  await repositories.documents.saveAnalysis(id, {
    analysis,
    pageCount: 1,
    analysisLocale: 'ru',
    ...analysisRecords(id, analysis, () => `${id}-${++next}`),
  });
  clock.advance(60_000);
}

const INVOICE = ANALYSIS_FIXTURES.invoice.title;
const FRAUD = ANALYSIS_FIXTURES.fraudulentInvoice.title;
const CONTRACT = ANALYSIS_FIXTURES.contract.title;

/** The rows of the list, without the cards of «Needs attention», which end differently. */
const listRows = () => screen.queryAllByRole('link', { name: / · (Analyzed|Not analyzed)$/ });

describe('DocumentListScreen', () => {
  describe('the list (HOME-2)', () => {
    it('lists documents newest first with type, sender, nearest deadline and status', async () => {
      await addDocument('draft', 'Счёт за газ');
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 40));

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('heading', { name: 'All documents' })).toBeOnTheScreen();
      const rows = listRows();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveAccessibleName(
        new RegExp(
          `^${INVOICE}, Invoice · Stadtwerke Musterstadt GmbH, By [^,]+, .* · 1 page · Analyzed$`
        )
      );
      expect(rows[1]).toHaveAccessibleName(/^Счёт за газ, .*2 pages · Not analyzed$/);
    });

    it('says when the nearest deadline has passed', async () => {
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, -3));

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('link', { name: /, By .+ · Overdue, / })).toBeOnTheScreen();
    });

    it('shows Russian text and plural forms in Russian', async () => {
      await i18n.changeLanguage('ru');
      for (const [id, pages] of [
        ['one', 1],
        ['few', 2],
        ['many', 5],
        ['twenty-one', 21],
      ] as const) {
        await repositories.documents.create({
          id,
          title: `Документ ${pages}`,
          source: 'scan',
          mimeType: 'image/jpeg',
          pageCount: pages,
          fileSize: 1,
        });
      }

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('heading', { name: 'Документы' })).toBeOnTheScreen();
      expect(screen.getByRole('heading', { name: 'Все документы' })).toBeOnTheScreen();
      for (const text of ['1 страница', '2 страницы', '5 страниц', '21 страница']) {
        expect(screen.getByText(new RegExp(`· ${text} · Не разобран$`))).toBeOnTheScreen();
      }
    });

    it('does not show deleted documents', async () => {
      await addDocument('kept', 'Договор');
      await addDocument('deleted', 'Удалённый');
      await repositories.documents.remove('deleted');

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByText('Договор')).toBeOnTheScreen();
      expect(screen.queryByText('Удалённый')).not.toBeOnTheScreen();
    });

    it('shows an error with a retry that reloads', async () => {
      const user = userEvent.setup();
      await addDocument('doc-1', 'Счёт за газ');
      jest.spyOn(api, 'listDocuments').mockRejectedValueOnce(new Error('Database is busy'));
      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
      await user.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Счёт за газ')).toBeOnTheScreen();
    });

    it('opens the document screen when a row is pressed', async () => {
      const user = userEvent.setup();
      await addDocument('doc-1', 'Счёт за газ');
      await renderRouter(
        { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
        { initialUrl: '/', wrapper: createTestProviders() }
      );

      await user.press(await screen.findByRole('link', { name: /Счёт за газ/ }));

      expect(screen).toHavePathname('/documents/doc-1');
      expect(await screen.findByRole('heading', { name: 'Счёт за газ' })).toBeOnTheScreen();
    });

    it('opens the choice of source from «Add» (CAP-1)', async () => {
      const user = userEvent.setup();
      await addDocument('doc-1', 'Счёт за газ');
      await renderRouter(
        {
          index: DocumentListScreen,
          'capture/_layout': CaptureLayout,
          'capture/index': CaptureRoute,
        },
        { initialUrl: '/', wrapper: createTestProviders() }
      );

      await user.press(await screen.findByRole('button', { name: 'Add a document' }));

      expect(screen).toHavePathname('/capture');
      expect(await screen.findByRole('button', { name: 'Scan' })).toBeOnTheScreen();
    });
  });

  describe('«Needs attention» (HOME-1)', () => {
    it('shows near and overdue deadlines first, then fraud signs and high risks', async () => {
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, -2));
      await addAnalyzed('fraud', dueIn(ANALYSIS_FIXTURES.fraudulentInvoice, 40));
      await addAnalyzed('contract', dueIn(ANALYSIS_FIXTURES.contract, 60, 120));
      await addAnalyzed('notice', dueIn(ANALYSIS_FIXTURES.officialNotice, 3, 30));
      await addDocument('draft', 'Счёт за газ');

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeOnTheScreen();
      const rows = listRows();
      const cards = screen.getAllByRole('link').filter((link) => !rows.includes(link));
      expect(cards).toHaveLength(4);
      expect(cards[0]).toHaveAccessibleName(new RegExp(`^${INVOICE}, Overdue · .+, Оплатить`));
      expect(cards[1]).toHaveAccessibleName(
        /^Запрос справки из школы для детского пособия, In 3 days · .+, High risk$/
      );
      expect(cards[2]).toHaveAccessibleName(`${FRAUD}, Signs of fraud, High risk`);
      expect(cards[3]).toHaveAccessibleName(`${CONTRACT}, High risk`);
      // «Got it» only where nothing is due soon.
      expect(screen.getAllByRole('button', { name: /^Got it/ })).toHaveLength(2);
      expect(listRows()).toHaveLength(5);
    });

    it('counts the other near deadlines of a document', async () => {
      await addAnalyzed('notice', dueIn(ANALYSIS_FIXTURES.officialNotice, 3, 5));

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByText('And 1 more deadline')).toBeOnTheScreen();
    });

    it('takes a warning out with «Got it» and keeps the document in the list', async () => {
      const user = userEvent.setup();
      await addAnalyzed('fraud', dueIn(ANALYSIS_FIXTURES.fraudulentInvoice, 40));
      await renderWithProviders(<DocumentListScreen />);

      await user.press(
        await screen.findByRole('button', {
          name: `Got it, remove “${FRAUD}” from Needs attention`,
        })
      );

      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeOnTheScreen()
      );
      expect(listRows()).toHaveLength(1);
      expect(await repositories.documents.get('fraud')).toMatchObject({
        attentionDismissedAt: expect.any(String),
      });
    });

    it('is not there when nothing needs attention', async () => {
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 40));

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('heading', { name: 'All documents' })).toBeOnTheScreen();
      expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeOnTheScreen();
    });

    it('opens the document from its card', async () => {
      const user = userEvent.setup();
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 1));
      await renderRouter(
        { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
        { initialUrl: '/', wrapper: createTestProviders() }
      );

      await user.press(
        await screen.findByRole('link', { name: new RegExp(`^${INVOICE}, Tomorrow`) })
      );

      expect(screen).toHavePathname('/documents/invoice');
    });
  });

  describe('search (HOME-3)', () => {
    beforeEach(async () => {
      await addDocument('fine', 'Штраф за парковку');
      await addDocument('gas', 'Счёт за газ');
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 2));
    });

    it('finds Cyrillic text in another case and hides «Needs attention» meanwhile', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DocumentListScreen />);

      await user.type(await screen.findByRole('searchbox', { name: 'Search documents' }), 'ШТРАФ');

      expect(await screen.findByRole('heading', { name: 'Search results' })).toBeOnTheScreen();
      expect(listRows()).toHaveLength(1);
      expect(listRows()[0]).toHaveAccessibleName(/^Штраф за парковку, /);
      expect(screen.queryByRole('heading', { name: 'Needs attention' })).not.toBeOnTheScreen();
    });

    it('finds a document by its sender and by a key fact', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DocumentListScreen />);
      const search = await screen.findByRole('searchbox', { name: 'Search documents' });

      await user.type(search, 'stadtwerke');
      expect(
        await screen.findByRole('link', { name: new RegExp(`^${INVOICE}, .*Analyzed$`) })
      ).toBeOnTheScreen();
      expect(listRows()).toHaveLength(1);

      await user.clear(search);
      await user.type(search, 'DE89 3704');
      expect(await screen.findByRole('heading', { name: 'Search results' })).toBeOnTheScreen();
      expect(listRows()).toHaveLength(1);
    });

    it('says when nothing is found and brings everything back when cleared', async () => {
      const user = userEvent.setup();
      await renderWithProviders(<DocumentListScreen />);

      await user.type(await screen.findByRole('searchbox'), 'договор аренды');
      expect(await screen.findByText('Nothing found')).toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Clear search' }));

      expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeOnTheScreen();
      expect(screen.getByRole('searchbox')).toHaveDisplayValue('');
      expect(listRows()).toHaveLength(3);
    });
  });

  describe('filter by type (HOME-4)', () => {
    it('offers the types the documents have and shows only the chosen one', async () => {
      const user = userEvent.setup();
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 40));
      await addAnalyzed('contract', dueIn(ANALYSIS_FIXTURES.contract, 60, 120));
      await addDocument('draft', 'Счёт за газ');
      await renderWithProviders(<DocumentListScreen />);

      // The group isn't an accessibility element itself, so that each chip stays focusable.
      const filter = await screen.findByLabelText('Document type');
      const chips = within(filter).getAllByRole('radio');
      expect(chips).toHaveLength(3);
      ['All', 'Invoice', 'Contract'].forEach((name, index) =>
        expect(chips[index]).toHaveAccessibleName(name)
      );
      expect(within(filter).getByRole('radio', { name: 'All' })).toBeChecked();

      await user.press(within(filter).getByRole('radio', { name: 'Contract' }));

      expect(within(filter).getByRole('radio', { name: 'Contract' })).toBeChecked();
      expect(listRows()).toHaveLength(1);
      expect(listRows()[0]).toHaveAccessibleName(new RegExp(`^${CONTRACT}, `));
      // The filter is for the list: what needs attention stays in view.
      expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeOnTheScreen();
    });

    it('has no filter while all documents are of one type', async () => {
      await addAnalyzed('invoice', dueIn(ANALYSIS_FIXTURES.invoice, 40));
      await addDocument('draft', 'Счёт за газ');

      await renderWithProviders(<DocumentListScreen />);

      expect(await screen.findByRole('heading', { name: 'All documents' })).toBeOnTheScreen();
      expect(screen.queryByLabelText('Document type')).not.toBeOnTheScreen();
    });
  });

  describe('before the first document (HOME-5)', () => {
    it('explains the app and opens the capture from one big button', async () => {
      const user = userEvent.setup();
      await renderRouter(
        {
          index: DocumentListScreen,
          'capture/_layout': CaptureLayout,
          'capture/index': CaptureRoute,
        },
        { initialUrl: '/', wrapper: createTestProviders() }
      );

      expect(
        await screen.findByRole('heading', { name: 'Your documents will be here' })
      ).toBeOnTheScreen();
      expect(screen.getByText(/Scan a letter, an invoice or a contract/)).toBeOnTheScreen();
      expect(screen.queryByRole('searchbox')).not.toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Scan a document' }));

      expect(screen).toHavePathname('/capture');
      expect(await screen.findByRole('button', { name: 'Scan' })).toBeOnTheScreen();
    });
  });
});
