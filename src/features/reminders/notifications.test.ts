import { DEFAULT_ACTION_IDENTIFIER, type NotificationResponse } from 'expo-notifications';

// Every other test sees the fake OS (src/test/setup-native-modules.ts); this one tests the adapter.
jest.unmock('./notifications');

const { toOpenedReminder } =
  jest.requireActual<typeof import('./notifications')>('./notifications');

function response(
  data: Record<string, unknown>,
  actionIdentifier: string = DEFAULT_ACTION_IDENTIFIER
) {
  return {
    actionIdentifier,
    notification: {
      date: 0,
      request: { identifier: 'reminder-1', content: { body: 'Deadline tomorrow', data } },
    },
  } as unknown as NotificationResponse;
}

describe('toOpenedReminder', () => {
  it('reads the ids of a tapped reminder (REM-6)', () => {
    expect(toOpenedReminder(response({ documentId: 'doc-1', deadlineId: 'pay' }))).toEqual({
      notificationId: 'reminder-1',
      documentId: 'doc-1',
      deadlineId: 'pay',
    });
  });

  it('ignores actions other than the tap itself', () => {
    const dismissed = response(
      { documentId: 'doc-1', deadlineId: 'pay' },
      'com.apple.UNNotificationDismissActionIdentifier'
    );

    expect(toOpenedReminder(dismissed)).toBeNull();
  });

  it('ignores a notification without our ids', () => {
    expect(toOpenedReminder(response({}))).toBeNull();
    expect(toOpenedReminder(response({ documentId: 'doc-1', deadlineId: 7 }))).toBeNull();
  });
});
