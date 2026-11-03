import { act, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { fakeNotifications } from '@/test/fake-notifications';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { AnalysisJobsSync } from './analysis-jobs-sync';

jest.mock('@/lib/api/client-headers', () => ({ getClientHeaders: async () => ({}) }));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

let repositories: Repositories;
let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;
let onAppStateChange: ((status: AppStateStatus) => void) | undefined;

/** The analysis server, by method: the job is being analyzed, `PATCH` and `DELETE` answer `204`. */
const server: Record<'GET' | 'PATCH' | 'DELETE', () => Response> = {
  GET: () => Response.json({ status: 'processing' }),
  PATCH: () => new Response(null, { status: 204 }),
  DELETE: () => new Response(null, { status: 204 }),
};

const sent = (method: string) =>
  fetchSpy.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

const patchedTokens = () =>
  sent('PATCH').map(([url, init]) => [url, JSON.parse(String(init?.body)).pushToken]);

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  await repositories.documents.create({
    id: 'doc-1',
    title: '',
    source: 'scan',
    mimeType: 'image/jpeg',
    fileSize: 1000,
  });
  await repositories.documents.startAnalysis('doc-1', { jobId: 'job-1', locale: 'en' });
  server.GET = () => Response.json({ status: 'processing' });
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    return server[(init?.method ?? 'GET') as keyof typeof server]();
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppStateChange = listener;
    return { remove: () => (onAppStateChange = undefined) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  setRepositories(null);
});

describe('AnalysisJobsSync: the push about a finished job (ANL-12)', () => {
  it('asks about the jobs at once when a push comes while the app is open', async () => {
    await renderWithProviders(<AnalysisJobsSync />);
    await waitFor(() => expect(sent('GET')).toHaveLength(1));

    server.GET = () =>
      Response.json({ status: 'done', analysis: ANALYSIS_FIXTURES.invoice, pageCount: 1 });
    await act(async () => fakeNotifications.receiveAnalysisPush('job-1'));

    await waitFor(async () =>
      expect((await repositories.documents.get('doc-1'))?.status).toBe('ready')
    );
    expect(sent('GET')).toHaveLength(2);
  });

  it('gives the waiting jobs the token at start, and the new one when it changes', async () => {
    fakeNotifications.permission = 'granted';
    await renderWithProviders(<AnalysisJobsSync />);

    await waitFor(() =>
      expect(patchedTokens()).toEqual([
        ['/api/v1/analyses/job-1', 'ExponentPushToken[fake-device]'],
      ])
    );

    await act(async () => fakeNotifications.changePushToken('ExponentPushToken[new]'));

    await waitFor(() => expect(patchedTokens()).toHaveLength(2));
    expect(patchedTokens()[1]).toEqual(['/api/v1/analyses/job-1', 'ExponentPushToken[new]']);
  });

  it('gives the token once notifications are allowed in system settings (return to the foreground)', async () => {
    fakeNotifications.permission = 'denied';
    await renderWithProviders(<AnalysisJobsSync />);
    await waitFor(() => expect(sent('GET')).toHaveLength(1));
    expect(sent('PATCH')).toHaveLength(0);

    onAppStateChange?.('background');
    fakeNotifications.permission = 'granted';
    await act(async () => onAppStateChange?.('active'));

    await waitFor(() =>
      expect(patchedTokens()).toEqual([
        ['/api/v1/analyses/job-1', 'ExponentPushToken[fake-device]'],
      ])
    );
  });
});
