import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaseRoute from '@/app/cases/[id]';
import NewCaseRoute from '@/app/cases/new';
import { DocumentListScreen } from '@/features/documents/screens/document-list-screen';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import * as api from '../api';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'case-new' }));

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  await repositories.documents.create({
    id: 'doc-1',
    title: 'Договор аренды',
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 1,
    fileSize: 1000,
  });
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

/** The Documents tab, with «New case» on it. */
async function openNewCase() {
  const user = userEvent.setup();
  await renderRouter(
    {
      _layout: () => <Stack />,
      index: DocumentListScreen,
      'cases/new': NewCaseRoute,
      'cases/[id]': CaseRoute,
    },
    { initialUrl: '/', wrapper: createTestProviders() }
  );
  await user.press(await screen.findByRole('button', { name: 'New case' }));
  expect(screen).toHavePathname('/cases/new');
  return user;
}

describe('NewCaseScreen (CASE-1)', () => {
  it('creates a case from the Documents tab and opens it in place of the modal', async () => {
    const user = await openNewCase();

    expect(await screen.findByText(/Keep documents about one matter together/)).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Case name'), '  Налоги 2026 ');
    await user.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen).toHavePathname('/cases/case-new'));
    expect(await screen.findByRole('heading', { name: 'Налоги 2026' })).toBeOnTheScreen();
    expect(screen.getByText('No documents in this case yet')).toBeOnTheScreen();
    expect(await repositories.cases.get('case-new')).toMatchObject({ name: 'Налоги 2026' });
  });

  it('creates nothing without a name', async () => {
    const user = await openNewCase();
    const field = await screen.findByLabelText('Case name');

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    await user.type(field, '   ');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('says so when the case can not be created, and keeps the name', async () => {
    jest.spyOn(api, 'createCase').mockRejectedValueOnce(new Error('Database is busy'));
    const user = await openNewCase();

    await user.type(await screen.findByLabelText('Case name'), 'Машина');
    await user.press(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText("Couldn't create the case. Try again.")).toBeOnTheScreen();
    expect(screen.getByLabelText('Case name')).toHaveDisplayValue('Машина');
    expect(screen).toHavePathname('/cases/new');
  });

  it('goes back without a case on «Cancel»', async () => {
    const user = await openNewCase();

    await user.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen).toHavePathname('/');
    expect(await repositories.cases.list()).toEqual([]);
  });
});
