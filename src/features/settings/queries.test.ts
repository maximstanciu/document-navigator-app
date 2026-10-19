import { renderHook, waitFor } from '@testing-library/react-native';

import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { fakeNotifications } from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { useUpdateSettings } from './queries';

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
});

afterEach(() => {
  setRepositories(null);
});

describe('useUpdateSettings', () => {
  it('rewrites the reminders when «Details in notifications» changes (SET-5, REM-7)', async () => {
    fakeNotifications.permission = 'granted';
    await repositories.documents.create({
      id: 'doc-1',
      title: 'Electricity bill',
      source: 'file',
      mimeType: 'application/pdf',
      fileSize: 10,
    });
    await repositories.deadlines.insertMany([
      {
        id: 'pay',
        documentId: 'doc-1',
        kind: 'payment',
        description: 'Pay the electricity bill',
        // Far enough ahead that all three default reminders are always in the future.
        dueDate: '2099-01-15',
        dateSource: 'explicit',
        confidence: 'high',
      },
    ]);
    const { result } = await renderHook(() => useUpdateSettings(), {
      wrapper: createTestProviders(),
    });

    await result.current.mutateAsync({ notificationDetails: true });

    await waitFor(() =>
      expect(fakeNotifications.pending().map((notification) => notification.body)).toEqual([
        'In 7 days: Pay the electricity bill',
        'Tomorrow: Pay the electricity bill',
        'Today: Pay the electricity bill',
      ])
    );
  });
});
