import { useQuery } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { AnalysisJobsSync } from '@/features/analysis/components/analysis-jobs-sync';
import { documentQueries } from '@/features/documents/queries';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  fakeNotifications,
} from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { NotificationOpener } from './notification-opener';

jest.mock('@/lib/api/client-headers', () => ({ getClientHeaders: async () => ({}) }));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

const reminder = {
  type: 'reminder' as const,
  notificationId: 'reminder-1',
  documentId: 'doc-1',
  deadlineId: 'pay',
  action: 'open' as const,
};

/** The push about a finished analysis: it names only the job (ANL-12). */
const analysisPush = (jobId = 'job-1') => ({
  type: 'analysis' as const,
  notificationId: `push-${jobId}`,
  jobId,
});

let repositories: Repositories;
let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

/** What the analysis server answers to `GET` on a job; `DELETE` answers `204`. */
let answerJobState: () => Promise<Response>;
const processing = async () => Response.json({ status: 'processing' });
const done = async () =>
  Response.json({ status: 'done', analysis: ANALYSIS_FIXTURES.invoice, pageCount: 1 });

const sentGets = () => fetchSpy.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET');

/** Every status the document screen has shown, in order: `loading` until its first read. */
let shownStatuses: string[];

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
  shownStatuses = [];
  answerJobState = processing;
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) =>
      (init?.method ?? 'GET') === 'GET' ? answerJobState() : new Response(null, { status: 204 })
    );
});

afterEach(() => {
  jest.restoreAllMocks();
  setRepositories(null);
});

/** The app's root, as in `AppProviders`: the job check, the stack, then the opener after it. */
function RootLayout() {
  return (
    <>
      <AnalysisJobsSync />
      <Stack />
      <NotificationOpener />
    </>
  );
}

function Home() {
  return <Text>Documents</Text>;
}

/** The document screen's read of the document, and where its analysis stands. */
function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending } = useQuery(documentQueries.detail(id));
  const status = isPending ? 'loading' : (data?.status ?? 'none');
  useEffect(() => {
    shownStatuses.push(status);
  }, [status]);
  return (
    <>
      <Text>Document {id}</Text>
      <Text>Status: {status}</Text>
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

  it('stores the result of the job whose push launched the app before opening its document', async () => {
    await seedAnalyzingDocument('doc-7');
    let answer = () => {};
    answerJobState = () => new Promise((resolve) => (answer = () => resolve(done())));
    fakeNotifications.lastOpened = analysisPush('job-1');

    await renderApp();
    await waitFor(() => expect(sentGets()).toHaveLength(1));
    // The list stays while the server is being asked.
    expect(screen.getByText('Documents')).toBeOnTheScreen();
    await act(async () => answer());

    expect(await screen.findByText('Status: ready')).toBeOnTheScreen();
    expect(shownStatuses).toEqual(['loading', 'ready']);
    // The tap joined the check the app starts with.
    expect(sentGets()).toHaveLength(1);
  });

  it('opens the document of a tapped push with its result, not «Analyzing…» (ANL-12)', async () => {
    await seedAnalyzingDocument('doc-7');
    await renderApp();
    // The check at start: the job was still being analyzed then.
    await waitFor(() => expect(sentGets()).toHaveLength(1));

    answerJobState = done;
    await act(async () => fakeNotifications.tap(analysisPush('job-1')));

    expect(await screen.findByText('Status: ready')).toBeOnTheScreen();
    expect(shownStatuses).toEqual(['loading', 'ready']);
    expect(sentGets()).toHaveLength(2);
  });

  it('reads the document again when its screen is still cached from an earlier visit', async () => {
    await seedAnalyzingDocument('doc-7');
    await renderApp();
    await act(async () => router.push({ pathname: '/documents/[id]', params: { id: 'doc-7' } }));
    expect(await screen.findByText('Status: analyzing')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeOnTheScreen();
    shownStatuses = [];

    answerJobState = done;
    await act(async () => fakeNotifications.tap(analysisPush('job-1')));

    expect(await screen.findByText('Status: ready')).toBeOnTheScreen();
    expect(shownStatuses).toEqual(['ready']);
  });

  it('opens the document anyway when the result cannot be fetched', async () => {
    await seedAnalyzingDocument('doc-7');
    answerJobState = () => Promise.reject(new TypeError('Network request failed'));
    fakeNotifications.lastOpened = analysisPush('job-1');

    await renderApp();

    expect(await screen.findByText('Status: analyzing')).toBeOnTheScreen();
    expect(screen).toHavePathname('/documents/doc-7');
  });

  it('stays on the list when the document of the job is gone (ANL-12)', async () => {
    await seedAnalyzingDocument('doc-7');
    await repositories.documents.remove('doc-7');
    fakeNotifications.lastOpened = analysisPush('job-1');
    const lookup = jest.spyOn(repositories.documents, 'findIdByAnalysisJob');

    await renderApp();
    await act(async () => fakeNotifications.tap(analysisPush('job-2')));
    // Both lookups have answered, and found nothing to open.
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
    await act(() => Promise.all(lookup.mock.results.map((result) => result.value)));

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(fakeNotifications.lastOpened).toBeNull();
  });
});
