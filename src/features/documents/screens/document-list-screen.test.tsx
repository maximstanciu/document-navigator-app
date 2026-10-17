import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import DocumentRoute from '@/app/documents/[id]';
import { ApiError } from '@/lib/api/client';
import { createTestProviders, renderWithProviders } from '@/test/render';

import * as api from '../api';
import { documentFixtures } from '../fixtures';
import { DocumentListScreen } from './document-list-screen';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DocumentListScreen', () => {
  it('lists documents once loaded', async () => {
    await renderWithProviders(<DocumentListScreen />);

    for (const document of documentFixtures) {
      expect(await screen.findByText(document.title)).toBeOnTheScreen();
    }
  });

  it('shows an empty state when there are no documents', async () => {
    jest.spyOn(api, 'fetchDocuments').mockResolvedValue([]);
    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByText('No documents yet')).toBeOnTheScreen();
  });

  it('shows an error with a retry that refetches', async () => {
    const user = userEvent.setup();
    const fetchDocuments = jest
      .spyOn(api, 'fetchDocuments')
      .mockRejectedValueOnce(new ApiError('Server unavailable', 503, undefined));
    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    fetchDocuments.mockRestore();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(documentFixtures[0].title)).toBeOnTheScreen();
  });

  it('opens the document detail screen when a row is pressed', async () => {
    const user = userEvent.setup();
    await renderRouter(
      { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
      { initialUrl: '/', wrapper: createTestProviders() }
    );

    await user.press(await screen.findByRole('link', { name: /Getting started/ }));

    expect(screen).toHavePathname('/documents/getting-started');
    expect(await screen.findByText(/rendered from local fixtures/)).toBeOnTheScreen();
  });
});
