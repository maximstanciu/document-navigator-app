import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import CaseRoute from '@/app/cases/[id]';
import AddToCaseRoute from '@/app/cases/[id]/add';
import DocumentRoute from '@/app/documents/[id]';
import { analysisRecords } from '@/features/analysis/analysis-records';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisResult } from '@/shared/analysis/schema';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import { createTestProviders } from '@/test/render';
import { createFakeClock, installTestRepositories } from '@/test/sqlite';

import { DocumentListScreen } from './document-list-screen';

let repositories: Repositories;
let clock: ReturnType<typeof createFakeClock>;

// «Needs attention» is relative to the real «now» the screen reads, so the analyses are made now too.
beforeEach(async () => {
  clock = createFakeClock(new Date().toISOString());
  ({ repositories } = await installTestRepositories(clock.now));
  await repositories.cases.create({ id: 'flat', name: 'Квартира' });
  await repositories.cases.create({ id: 'car', name: 'Машина' });
});

afterEach(() => {
  setRepositories(null);
});

async function addDocument(id: string, title: string, caseId: string | null = null) {
  await repositories.documents.create({
    id,
    title,
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 1,
    fileSize: 1000,
    caseId,
  });
  clock.advance(60_000);
}

/** A document analyzed as `analysis` with its first deadline `days` from today. */
async function addAnalyzed(id: string, analysis: AnalysisResult, days: number, caseId: string) {
  const today = localCalendarDate(new Date());
  const dated = {
    ...analysis,
    deadlines: analysis.deadlines.map((deadline) => ({ ...deadline, date: addDays(today, days) })),
  };
  await addDocument(id, '', caseId);
  await repositories.documents.startAnalysis(id, { jobId: `${id}-job`, locale: 'ru' });
  let next = 0;
  await repositories.documents.saveAnalysis(id, {
    jobId: `${id}-job`,
    analysis: dated,
    pageCount: 1,
    ...analysisRecords(id, dated, () => `${id}-${++next}`),
  });
}

/** Inside a stack, so the header with «⋯» renders; the Documents tab is at «/». */
function renderCase(id = 'flat') {
  return renderRouter(
    {
      _layout: () => <Stack />,
      index: DocumentListScreen,
      'cases/[id]': CaseRoute,
      'cases/[id]/add': AddToCaseRoute,
      'documents/[id]': DocumentRoute,
      'capture/_layout': CaptureLayout,
      'capture/index': CaptureRoute,
    },
    { initialUrl: `/cases/${id}`, wrapper: createTestProviders() }
  );
}

describe('CaseScreen (CASE-3…CASE-5)', () => {
  it('shows the documents of the case with what needs attention, and nothing from elsewhere', async () => {
    await addAnalyzed('invoice', ANALYSIS_FIXTURES.invoice, -2, 'flat');
    await addDocument('gas', 'Счёт за газ', 'flat');
    await addDocument('insurance', 'Страховка', 'car');
    await addDocument('loose', 'Письмо из банка');

    await renderCase();

    expect(await screen.findByRole('heading', { name: 'Квартира' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: '2 documents in this case' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeOnTheScreen();
    // Its card in «Needs attention» and its row; «Open document» names it after its own words.
    expect(
      screen.getAllByRole('link', { name: new RegExp(`^${ANALYSIS_FIXTURES.invoice.title}`) })
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: /^Счёт за газ/ })).toBeOnTheScreen();
    expect(screen.queryByText('Страховка')).not.toBeOnTheScreen();
    expect(screen.queryByText('Письмо из банка')).not.toBeOnTheScreen();
  });

  it('says when the case has no documents yet', async () => {
    await renderCase();

    expect(await screen.findByText('No documents in this case yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add document' })).toBeOnTheScreen();
    // Nothing elsewhere to choose from.
    expect(screen.queryByRole('button', { name: 'Choose from documents' })).not.toBeOnTheScreen();
  });

  it('says when the case is gone', async () => {
    await renderCase('missing');

    expect(await screen.findByText('Case not found')).toBeOnTheScreen();
  });

  it('opens the capture for a new document in the case (CASE-4)', async () => {
    const user = userEvent.setup();
    await renderCase();

    await user.press(await screen.findByRole('button', { name: 'Add document' }));

    expect(screen).toHavePathname('/capture');
    expect(screen).toHaveSearchParams({ caseId: 'flat' });
  });

  it('files the documents ticked from the others, moving one from another case (CASE-4)', async () => {
    const user = userEvent.setup();
    await addDocument('gas', 'Счёт за газ');
    await addDocument('insurance', 'Страховка', 'car');
    await addDocument('loose', 'Письмо из банка');
    await addDocument('rent', 'Договор аренды', 'flat');
    await renderCase();

    await user.press(await screen.findByRole('button', { name: 'Choose from documents' }));

    expect(await screen.findByText(/Tick the documents for “Квартира”/)).toBeOnTheScreen();
    const choices = screen.getAllByRole('checkbox');
    expect(choices.map((choice) => choice.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Письмо из банка, /),
      'Страховка, Now in “Машина”',
      expect.stringMatching(/^Счёт за газ, /),
    ]);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.press(screen.getByRole('checkbox', { name: /^Счёт за газ/ }));
    await user.press(screen.getByRole('checkbox', { name: /^Страховка/ }));
    expect(screen.getByRole('checkbox', { name: /^Страховка/ })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Add 2 documents' }));

    await waitFor(() => expect(screen).toHavePathname('/cases/flat'));
    expect(
      await screen.findByRole('heading', { name: '3 documents in this case' })
    ).toBeOnTheScreen();
    expect((await repositories.documents.get('insurance'))?.caseId).toBe('flat');
    expect((await repositories.documents.get('loose'))?.caseId).toBeNull();
  });

  describe('case actions (CASE-5)', () => {
    async function openActions() {
      const user = userEvent.setup();
      await user.press(await screen.findByRole('button', { name: 'Case actions' }));
      return user;
    }

    it('renames the case, and not to a blank name', async () => {
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Rename' }));
      const field = screen.getByLabelText('Case name');
      expect(field).toHaveDisplayValue('Квартира');
      await user.clear(field);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(field, ' Квартира на Ленина ');
      await user.press(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByLabelText('Case name')).not.toBeOnTheScreen());
      expect(screen.getAllByRole('heading', { name: 'Квартира на Ленина' }).length).toBeGreaterThan(
        0
      );
      expect(await repositories.cases.get('flat')).toMatchObject({ name: 'Квартира на Ленина' });
    });

    it('deletes the case once asked, keeps its documents and goes back', async () => {
      await addDocument('rent', 'Договор аренды', 'flat');
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Delete case' }));
      expect(screen.getByRole('heading', { name: 'Delete the case?' })).toBeOnTheScreen();
      expect(screen.getByText(/Its documents stay in the app/)).toBeOnTheScreen();
      await user.press(screen.getByRole('button', { name: 'Delete case' }));

      await waitFor(() => expect(screen).toHavePathname('/'));
      expect(await repositories.cases.get('flat')).toBeNull();
      expect(await repositories.documents.get('rent')).toMatchObject({ caseId: null });
      const list = await screen.findByRole('link', { name: /^Договор аренды/ });
      expect(within(list).queryByText('Квартира')).not.toBeOnTheScreen();
    });

    it('keeps the case when deleting is cancelled', async () => {
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Delete case' }));
      await user.press(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('heading', { name: 'Delete the case?' })).not.toBeOnTheScreen();
      expect(await repositories.cases.get('flat')).not.toBeNull();
    });
  });

  describe('archive (CASE-6)', () => {
    async function openActions() {
      const user = userEvent.setup();
      await user.press(await screen.findByRole('button', { name: 'Case actions' }));
      return user;
    }

    it('archives a case without open deadlines at once, and restores it', async () => {
      await addDocument('rent', 'Договор аренды', 'flat');
      await addDocument('loose', 'Письмо из банка');
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Archive' }));

      expect(
        await screen.findByRole('heading', { name: 'This case is archived' })
      ).toBeOnTheScreen();
      expect(screen.getByText(/search finds them/)).toBeOnTheScreen();
      // An archived case takes no documents.
      expect(screen.queryByRole('button', { name: 'Add document' })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Choose from documents' })).not.toBeOnTheScreen();
      expect(screen.getByRole('link', { name: /^Договор аренды/ })).toBeOnTheScreen();
      expect((await repositories.cases.get('flat'))?.archivedAt).not.toBeNull();

      await user.press(screen.getByRole('button', { name: 'Restore from archive' }));

      expect(await screen.findByRole('button', { name: 'Add document' })).toBeOnTheScreen();
      expect(
        screen.queryByRole('heading', { name: 'This case is archived' })
      ).not.toBeOnTheScreen();
      expect((await repositories.cases.get('flat'))?.archivedAt).toBeNull();
    });

    it('says first that open deadlines stay live, and archives once confirmed', async () => {
      await addAnalyzed('invoice', ANALYSIS_FIXTURES.invoice, 5, 'flat');
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Archive' }));

      expect(screen.getByRole('heading', { name: 'Archive the case?' })).toBeOnTheScreen();
      expect(
        screen.getByText(/open deadlines?\. (It stays|They stay) on the Deadlines tab/)
      ).toBeOnTheScreen();
      expect((await repositories.cases.get('flat'))?.archivedAt).toBeNull();
      await user.press(screen.getByRole('button', { name: 'Archive' }));

      expect(
        await screen.findByRole('heading', { name: 'This case is archived' })
      ).toBeOnTheScreen();
      expect((await repositories.cases.get('flat'))?.archivedAt).not.toBeNull();
      // Its deadline still needs attention.
      expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeOnTheScreen();
    });

    it('keeps the case out of the archive when cancelled', async () => {
      await addAnalyzed('invoice', ANALYSIS_FIXTURES.invoice, 5, 'flat');
      await renderCase();
      const user = await openActions();

      await user.press(screen.getByRole('button', { name: 'Archive' }));
      await user.press(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('heading', { name: 'Archive the case?' })).not.toBeOnTheScreen();
      expect((await repositories.cases.get('flat'))?.archivedAt).toBeNull();
    });

    it('does not invite adding documents to an empty archived case', async () => {
      await repositories.cases.setArchived('flat', true);
      await renderCase();

      expect(await screen.findByText('No documents in this case')).toBeOnTheScreen();
      expect(
        screen.getByText('To add documents, restore the case from the archive first.')
      ).toBeOnTheScreen();
      expect(screen.queryByText('No documents in this case yet')).not.toBeOnTheScreen();
      expect(screen.queryByText(/Add a new document/)).not.toBeOnTheScreen();
    });

    it('offers «Restore from archive» in the sheet of an archived case', async () => {
      await repositories.cases.setArchived('flat', true);
      await renderCase();
      const user = await openActions();

      expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeOnTheScreen();
      await user.press(screen.getAllByRole('button', { name: 'Restore from archive' }).at(-1)!);

      await waitFor(async () =>
        expect((await repositories.cases.get('flat'))?.archivedAt).toBeNull()
      );
    });

    it('does not offer documents of archived cases to choose from', async () => {
      await addDocument('insurance', 'Страховка', 'car');
      await repositories.cases.setArchived('car', true);
      await renderCase();

      expect(await screen.findByText('No documents in this case yet')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Choose from documents' })).not.toBeOnTheScreen();
    });
  });

  describe('archived documents (HOME-6)', () => {
    it('keeps an archived document in its case, marked', async () => {
      await addDocument('rent', 'Договор аренды', 'flat');
      await addDocument('gas', 'Счёт за газ', 'flat');
      await repositories.documents.setArchived('rent', true);

      await renderCase();

      expect(
        await screen.findByRole('heading', { name: '2 documents in this case' })
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('link', { name: /^Договор аренды, .*, Archived$/ })
      ).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: /^Счёт за газ, / })).not.toHaveAccessibleName(
        /Archived/
      );
    });

    it('does not offer archived documents to choose from', async () => {
      await addDocument('letter', 'Письмо из банка');
      await repositories.documents.setArchived('letter', true);
      await renderCase();

      expect(await screen.findByText('No documents in this case yet')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Choose from documents' })).not.toBeOnTheScreen();
    });
  });
});
