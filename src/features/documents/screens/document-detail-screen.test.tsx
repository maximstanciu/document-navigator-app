import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import DocumentRoute from '@/app/documents/[id]';
import { analysisRecords } from '@/features/analysis/analysis-records';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisResult } from '@/shared/analysis/schema';
import { fakeFileSystem } from '@/test/fake-file-system';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import * as api from '../api';
import { copyToClipboard } from '../clipboard';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('../clipboard', () => ({ copyToClipboard: jest.fn(async () => {}) }));

const copy = jest.mocked(copyToClipboard);

/** The screen sets its header title, so it renders inside a router. */
function renderDocument(id = 'doc-1') {
  return renderRouter(
    { 'documents/[id]': DocumentRoute },
    { initialUrl: `/documents/${id}`, wrapper: createTestProviders() }
  );
}

let repositories: Repositories;

/** A document whose page files are on the device: `pages` JPEG pages, or one PDF. */
async function seedDocument({
  pdf = false,
  pages = pdf ? 1 : 2,
}: { pdf?: boolean; pages?: number } = {}) {
  const records = Array.from({ length: pages }, (_, index) => ({
    id: `p${index + 1}`,
    relativePath: `documents/doc-1/p${index + 1}.${pdf ? 'pdf' : 'jpg'}`,
    width: null,
    height: null,
  }));
  for (const page of records) {
    fakeFileSystem.addFile(`${fakeFileSystem.documentRoot}/${page.relativePath}`);
  }
  await repositories.documents.create(
    {
      id: 'doc-1',
      title: '',
      source: pdf ? 'file' : 'scan',
      mimeType: pdf ? 'application/pdf' : 'image/jpeg',
      pageCount: pdf ? null : pages,
      fileSize: 1_200_000,
    },
    records
  );
}

/** A document analyzed as `analysis`, stored the way `analyzeDocument()` stores it. */
async function seedAnalyzed(analysis: AnalysisResult) {
  await seedDocument();
  await repositories.documents.startAnalysis('doc-1');
  let next = 0;
  await repositories.documents.saveAnalysis('doc-1', {
    analysis,
    pageCount: 2,
    analysisLocale: 'ru',
    ...analysisRecords('doc-1', analysis, () => `rec-${++next}`),
  });
}

beforeEach(async () => {
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
  copy.mockClear();
});

describe('DocumentDetailScreen', () => {
  describe('before the analysis', () => {
    it('shows a draft with the offer to analyze it and its pages, without a disclaimer', async () => {
      await seedDocument();

      await renderDocument();

      expect(await screen.findByRole('heading', { name: 'Untitled document' })).toBeOnTheScreen();
      expect(screen.getByText(/^Added /)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Analyze the document' })).toBeOnTheScreen();
      expect(await screen.findByLabelText('Page 1')).toBeOnTheScreen();
      expect(screen.getByLabelText('Page 2')).toBeOnTheScreen();
      expect(screen.queryByText(/This is not legal advice/)).not.toBeOnTheScreen();
    });

    it('shows a PDF as a file card, without thumbnails (D-4)', async () => {
      await seedDocument({ pdf: true });

      await renderDocument();

      expect(await screen.findByText('PDF')).toBeOnTheScreen();
      expect(screen.getByText('1.1 MB')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Page 1')).not.toBeOnTheScreen();
    });
  });

  describe('with an analysis (DET-1…DET-10)', () => {
    it('answers what it is, what to do, by when and what is at stake', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.invoice);

      await renderDocument();

      expect(
        await screen.findByRole('heading', { name: 'Счёт за электричество, сентябрь 2026' })
      ).toBeOnTheScreen();
      expect(
        screen.getByText('Invoice · Stadtwerke Musterstadt GmbH · Oct 3, 2026')
      ).toBeOnTheScreen();
      expect(screen.getByRole('heading', { name: 'In short' })).toBeOnTheScreen();
      expect(screen.getByText(ANALYSIS_FIXTURES.invoice.summary)).toBeOnTheScreen();
      expect(await screen.findByRole('heading', { name: 'What to do' })).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', {
          name: 'Оплатить 84,20 € переводом, указав номер клиента в назначении платежа',
        })
      ).not.toBeChecked();
      expect(
        screen.getByRole('button', { name: 'Medium risk: Плата за просрочку' })
      ).toBeOnTheScreen();
      expect(
        screen.getByLabelText('IBAN для оплаты: DE89 3704 0044 0532 0130 00')
      ).toBeOnTheScreen();
      expect(screen.getByText(/This is not legal advice/)).toBeOnTheScreen();
    });

    it('shows a deadline once: with its action, not again under «Deadlines» (DET-3)', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.invoice);

      await renderDocument();

      expect(await screen.findAllByText('By Oct 31, 2026')).toHaveLength(1);
      expect(screen.queryByRole('heading', { name: 'Deadlines' })).not.toBeOnTheScreen();
    });

    it('groups several actions under their deadline and lists the rest under «Deadlines»', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.officialNotice);

      await renderDocument();

      expect(await screen.findByText('By Nov 6, 2026')).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', {
          name: 'Взять в школе справку об обучении (Schulbescheinigung)',
        })
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', {
          name: 'Отправить справку в Familienkasse, указав номер дела',
        })
      ).toBeOnTheScreen();
      expect(screen.getByRole('heading', { name: 'Deadlines' })).toBeOnTheScreen();
      expect(
        screen.getByRole('checkbox', {
          name: 'Последний день, чтобы обжаловать решение (Einspruch)',
        })
      ).toBeOnTheScreen();
    });

    it('marks a computed date and asks to check it against the original (ANL-6)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.officialNotice);
      await renderDocument();

      expect(
        await screen.findByText('Calculated: Месяц с даты письма 09.10.2026')
      ).toBeOnTheScreen();
      expect(screen.getByText('Check this date against the original.')).toBeOnTheScreen();

      const [quote] = screen.getAllByRole('button', { name: /^Quote from the original/ });
      expect(quote).not.toBeExpanded();
      await user.press(quote);

      expect(quote).toBeExpanded();
      const [deadline] = ANALYSIS_FIXTURES.officialNotice.deadlines;
      expect(screen.getByText(deadline.sourceQuote)).toBeOnTheScreen();
    });

    it('closes the deadline once all its actions are done (DET-3, REM-9)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.officialNotice);
      await renderDocument();

      await user.press(
        await screen.findByRole('checkbox', {
          name: 'Взять в школе справку об обучении (Schulbescheinigung)',
        })
      );
      await user.press(
        screen.getByRole('checkbox', {
          name: 'Отправить справку в Familienkasse, указав номер дела',
        })
      );

      expect(
        await screen.findByRole('checkbox', {
          name: 'Отправить справку в Familienkasse, указав номер дела',
          checked: true,
        })
      ).toBeOnTheScreen();
      const [deadline] = await repositories.deadlines.list({ documentId: 'doc-1' });
      expect(deadline).toMatchObject({ dueDate: '2026-11-06', status: 'done' });
    });

    it('marks a deadline without actions done (REM-9)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.officialNotice);
      await renderDocument();

      await user.press(
        await screen.findByRole('checkbox', {
          name: 'Последний день, чтобы обжаловать решение (Einspruch)',
        })
      );

      expect(
        await screen.findByRole('checkbox', {
          name: 'Последний день, чтобы обжаловать решение (Einspruch)',
          checked: true,
        })
      ).toBeOnTheScreen();
    });

    it('collapses a deadline marked «Not relevant» to the end and brings it back (DET-4)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.officialNotice);
      await renderDocument();

      await user.press(
        await screen.findByRole('button', {
          name: 'Mark the deadline of Nov 9, 2026 as not relevant',
        })
      );

      const restore = await screen.findByRole('button', {
        name: 'Restore the deadline of Nov 9, 2026',
      });
      expect(screen.getByText('By Nov 9, 2026 · Not relevant')).toBeOnTheScreen();
      expect(
        screen.queryByRole('checkbox', {
          name: 'Последний день, чтобы обжаловать решение (Einspruch)',
        })
      ).not.toBeOnTheScreen();
      expect(
        (await repositories.deadlines.list({ documentId: 'doc-1', statuses: ['dismissed'] })).map(
          (deadline) => deadline.dueDate
        )
      ).toEqual(['2026-11-09']);

      await user.press(restore);

      expect(
        await screen.findByRole('checkbox', {
          name: 'Последний день, чтобы обжаловать решение (Einspruch)',
        })
      ).toBeOnTheScreen();
    });

    it('says when an open deadline has passed', async () => {
      const notice = ANALYSIS_FIXTURES.officialNotice;
      await seedAnalyzed({
        ...notice,
        deadlines: notice.deadlines.map((deadline) => ({ ...deadline, date: '2020-01-15' })),
      });

      await renderDocument();

      expect(await screen.findAllByText('Overdue')).toHaveLength(2);
    });

    it('warns about fraud signs right under the title, in words (DET-10)', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.fraudulentInvoice);

      await renderDocument();

      expect(await screen.findByRole('heading', { name: 'Signs of fraud' })).toBeOnTheScreen();
      for (const signal of ANALYSIS_FIXTURES.fraudulentInvoice.fraudSignals) {
        expect(screen.getByText(signal.explanation)).toBeOnTheScreen();
      }
      expect(
        screen.getByText(/Check the sender through their official contacts/)
      ).toBeOnTheScreen();
    });

    it('names the risk level in words and opens the explanation and quote (DET-5)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.contract);
      await renderDocument();

      const risks = await screen.findAllByRole('button', { name: /risk: / });
      expect(risks).toHaveLength(3);
      expect(risks[0]).toHaveAccessibleName('High risk: Плата за досрочное расторжение');
      expect(risks[1]).toHaveAccessibleName('Medium risk: Автопродление на год');
      expect(risks[2]).toHaveAccessibleName('Medium risk: Клуб может поднять цену');

      await user.press(risks[0]);

      expect(risks[0]).toBeExpanded();
      const high = ANALYSIS_FIXTURES.contract.risks.find((risk) => risk.severity === 'high')!;
      expect(screen.getByText(high.explanation)).toBeOnTheScreen();
    });

    it('names the risk level in Russian too', async () => {
      await i18n.changeLanguage('ru');
      await seedAnalyzed(ANALYSIS_FIXTURES.contract);

      await renderDocument();

      expect(
        await screen.findByRole('button', { name: 'Высокий риск: Плата за досрочное расторжение' })
      ).toBeOnTheScreen();
      expect(await screen.findByRole('heading', { name: 'Что нужно сделать' })).toBeOnTheScreen();
    });

    it('copies a key fact on a long press and says so (DET-6)', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.invoice);
      await renderDocument();

      await user.longPress(
        await screen.findByLabelText('IBAN для оплаты: DE89 3704 0044 0532 0130 00')
      );

      expect(copy).toHaveBeenCalledWith('DE89 3704 0044 0532 0130 00');
      expect(await screen.findByText('Copied')).toBeOnTheScreen();
    });

    it('explains an unreadable document and offers to add it again (ANL-7)', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.unreadable);

      await renderDocument();

      expect(
        await screen.findByRole('heading', { name: "The document couldn't be read" })
      ).toBeOnTheScreen();
      expect(screen.getByText('What got in the way: blurry, too dark.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Add again' })).toBeOnTheScreen();
      expect(screen.queryByRole('heading', { name: 'What to do' })).not.toBeOnTheScreen();
      expect(screen.getByText('Нечитаемый документ')).toBeOnTheScreen();
    });

    it('tries the deadlines again after they failed to load', async () => {
      const user = userEvent.setup();
      await seedAnalyzed(ANALYSIS_FIXTURES.invoice);
      jest.spyOn(api, 'listDocumentDeadlines').mockRejectedValueOnce(new Error('Database is busy'));
      await renderDocument();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't load this part of the document."
      );
      await user.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('heading', { name: 'What to do' })).toBeOnTheScreen();
    });
  });

  describe('original (DET-7, STO-8)', () => {
    it('marks a page whose file is gone and keeps the rest', async () => {
      await seedDocument({ pages: 2 });
      fakeFileSystem.reset();
      fakeFileSystem.addFile(`${fakeFileSystem.documentRoot}/documents/doc-1/p1.jpg`);

      await renderDocument();

      expect(await screen.findByLabelText('Page 1')).toBeOnTheScreen();
      expect(screen.getByLabelText('Page 2 is not available')).toBeOnTheScreen();
    });

    it('says the original is not available when no file is left, and the analysis still shows', async () => {
      await seedAnalyzed(ANALYSIS_FIXTURES.invoice);
      fakeFileSystem.reset();

      await renderDocument();

      expect(await screen.findByText(/The original isn't available/)).toBeOnTheScreen();
      expect(await screen.findByRole('heading', { name: 'What to do' })).toBeOnTheScreen();
    });
  });

  it('says so when the document was deleted', async () => {
    await seedDocument();
    await repositories.documents.remove('doc-1');

    await renderDocument();

    expect(await screen.findByText('Document not found')).toBeOnTheScreen();
  });

  it('shows an error with a retry that reloads', async () => {
    const user = userEvent.setup();
    await seedDocument();
    jest.spyOn(api, 'getDocument').mockRejectedValueOnce(new Error('Database is busy'));
    await renderDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Untitled document' })).toBeOnTheScreen();
  });
});
