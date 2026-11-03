import { act, screen, userEvent } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  fakeNotifications,
} from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { NotificationOpener } from './notification-opener';

const reminder = {
  type: 'reminder' as const,
  notificationId: 'reminder-1',
  documentId: 'doc-1',
  deadlineId: 'pay',
};

/** The push about a finished analysis: it names only the job (ANL-12). */
const analysisPush = (jobId = 'job-1') => ({
  type: 'analysis' as const,
  notificationId: `push-${jobId}`,
  jobId,
});

let repositories: Repositories;

/** A document analyzed under `job-1`, waiting on the server. */
async function seedAnalyzingDocument(id = 'doc-7') {
  await repositories.documents.create({
    id,
    title: '',
    source: 'scan',
    mimeType: 'image/jpeg',
    fileSize: 1000,
  });
  await repositories.documents.startAnalysis(id, { jobId: 'job-1', locale: 'en' });
}

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
});

afterEach(() => setRepositories(null));

/** The app's root: the stack, then the opener after it, as in `AppProviders`. */
function RootLayout() {
  return (
    <>
      <Stack />
      <NotificationOpener />
    </>
  );
}

function Home() {
  return <Text>Documents</Text>;
}

function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Text>Document {id}</Text>
      <Button label="Back" onPress={() => router.back()} />
    </>
  );
}

function renderApp() {
  return renderRouter(
    { _layout: RootLayout, index: Home, 'documents/[id]': DocumentRoute },
    { initialUrl: '/', wrapper: createTestProviders() }
  );
}

describe('NotificationOpener', () => {
  it('opens the document of the reminder that launched the app, over the list (REM-6)', async () => {
    fakeNotifications.lastOpened = reminder;

    await renderApp();

    expect(await screen.findByText('Document doc-1')).toBeOnTheScreen();
    expect(screen).toHavePathname('/documents/doc-1');
    expect(fakeNotifications.lastOpened).toBeNull();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('opens the document when a reminder is tapped while the app runs (REM-6)', async () => {
    await renderApp();
    expect(screen.getByText('Documents')).toBeOnTheScreen();

    await act(async () => fakeNotifications.tap({ ...reminder, documentId: 'doc-2' }));

    expect(await screen.findByText('Document doc-2')).toBeOnTheScreen();
    expect(fakeNotifications.lastOpened).toBeNull();
  });

  it('does not open the same tap again after a restart', async () => {
    fakeNotifications.lastOpened = reminder;
    const { unmount } = await renderApp();
    expect(await screen.findByText('Document doc-1')).toBeOnTheScreen();
    await unmount();

    await renderApp();

    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('opens a tap reported both as the last tap and to the listener once', async () => {
    fakeNotifications.lastOpened = reminder;
    // At a cold start the OS may also deliver the launching tap to the listener, later.
    let deliverLate = () => {};
    addNotificationOpenedListener.mockImplementationOnce((listener) => {
      deliverLate = () => listener(reminder);
      return () => {};
    });

    await renderApp();
    expect(await screen.findByText('Document doc-1')).toBeOnTheScreen();
    await act(async () => deliverLate());
    expect(clearLastOpenedNotification).toHaveBeenCalledTimes(2);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeOnTheScreen();
  });

  it('stays on the list when no reminder was tapped', async () => {
    await renderApp();

    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('opens the document of the job whose push launched the app, over the list (ANL-12)', async () => {
    await seedAnalyzingDocument('doc-7');
    fakeNotifications.lastOpened = analysisPush('job-1');

    await renderApp();

    expect(await screen.findByText('Document doc-7')).toBeOnTheScreen();
    expect(fakeNotifications.lastOpened).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeOnTheScreen();
  });

  it('opens the document when the push about its analysis is tapped while the app runs', async () => {
    await seedAnalyzingDocument('doc-7');
    await renderApp();

    await act(async () => fakeNotifications.tap(analysisPush('job-1')));

    expect(await screen.findByText('Document doc-7')).toBeOnTheScreen();
  });

  it('stays on the list when the document of the job is gone (ANL-12)', async () => {
    await seedAnalyzingDocument('doc-7');
    await repositories.documents.remove('doc-7');
    fakeNotifications.lastOpened = analysisPush('job-1');
    const lookup = jest.spyOn(repositories.documents, 'findIdByAnalysisJob');

    await renderApp();
    await act(async () => fakeNotifications.tap(analysisPush('job-2')));
    // Both lookups have answered, and found nothing to open.
    await act(() => Promise.all(lookup.mock.results.map((result) => result.value)));

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(fakeNotifications.lastOpened).toBeNull();
  });
});
