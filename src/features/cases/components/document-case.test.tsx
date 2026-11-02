import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaseRoute from '@/app/cases/[id]';
import NewCaseRoute from '@/app/cases/new';
import DocumentRoute from '@/app/documents/[id]';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import * as api from '../api';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'case-new' }));

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  await repositories.cases.create({ id: 'flat', name: 'Квартира' });
  await repositories.cases.create({ id: 'car', name: 'Машина' });
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

function renderDocument() {
  return renderRouter(
    {
      _layout: () => <Stack />,
      index: () => null,
      'documents/[id]': DocumentRoute,
      'cases/[id]': CaseRoute,
      'cases/new': NewCaseRoute,
    },
    { initialUrl: '/documents/doc-1', wrapper: createTestProviders() }
  );
}

async function openPicker(name: string | RegExp) {
  const user = userEvent.setup();
  await user.press(await screen.findByRole('button', { name }));
  expect(screen.getByRole('heading', { name: 'Case for this document' })).toBeOnTheScreen();
  return user;
}

describe('DocumentCase (CASE-2)', () => {
  it('files a document in a case and shows it under the title', async () => {
    await renderDocument();
    const user = await openPicker('Add to a case');

    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      'No case',
      'Машина',
      'Квартира',
    ]);
    expect(screen.getByRole('radio', { name: 'No case' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Квартира' }));

    expect(await screen.findByRole('button', { name: 'Case: Квартира. Change' })).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: 'Case for this document' })).not.toBeOnTheScreen();
    expect((await repositories.documents.get('doc-1'))?.caseId).toBe('flat');
  });

  it('moves it to another case and takes it out of any', async () => {
    await repositories.documents.moveToCase(['doc-1'], 'flat');
    await renderDocument();

    let user = await openPicker('Case: Квартира. Change');
    await user.press(screen.getByRole('radio', { name: 'Машина' }));
    user = await openPicker('Case: Машина. Change');
    await user.press(screen.getByRole('radio', { name: 'No case' }));

    expect(await screen.findByRole('button', { name: 'Add to a case' })).toBeOnTheScreen();
    expect((await repositories.documents.get('doc-1'))?.caseId).toBeNull();
  });

  it('opens the case the document is in', async () => {
    await repositories.documents.moveToCase(['doc-1'], 'car');
    await renderDocument();

    const user = await openPicker('Case: Машина. Change');
    await user.press(screen.getByRole('button', { name: 'Open “Машина”' }));

    expect(screen).toHavePathname('/cases/car');
    expect(await screen.findByRole('heading', { name: 'Машина' })).toBeOnTheScreen();
  });

  it('says so when the move fails and keeps the sheet open', async () => {
    jest.spyOn(api, 'moveToCase').mockRejectedValueOnce(new Error('The case is gone'));
    await renderDocument();
    const user = await openPicker('Add to a case');

    await user.press(screen.getByRole('radio', { name: 'Квартира' }));

    expect(await screen.findByText("Couldn't move the document. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'Case for this document' })).toBeOnTheScreen();
  });

  it('starts a new case with the document and comes back to it (CASE-1)', async () => {
    await renderDocument();
    const user = await openPicker('Add to a case');

    await user.press(screen.getByRole('button', { name: 'New case' }));
    expect(screen).toHavePathname('/cases/new');
    await user.type(await screen.findByLabelText('Case name'), 'Ремонт');
    await user.press(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen).toHavePathname('/documents/doc-1'));
    expect(await screen.findByRole('button', { name: 'Case: Ремонт. Change' })).toBeOnTheScreen();
    expect(await repositories.cases.get('case-new')).toMatchObject({ name: 'Ремонт' });
    expect((await repositories.documents.get('doc-1'))?.caseId).toBe('case-new');
  });
});
