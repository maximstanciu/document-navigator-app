import { act, screen, userEvent } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import {
  addReminderOpenedListener,
  clearLastOpenedReminder,
  fakeNotifications,
} from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';

import { ReminderOpener } from './reminder-opener';

const reminder = { notificationId: 'reminder-1', documentId: 'doc-1', deadlineId: 'pay' };

/** The app's root: the stack, then the opener after it, as in `AppProviders`. */
function RootLayout() {
  return (
    <>
      <Stack />
      <ReminderOpener />
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

describe('ReminderOpener', () => {
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
    addReminderOpenedListener.mockImplementationOnce((listener) => {
      deliverLate = () => listener(reminder);
      return () => {};
    });

    await renderApp();
    expect(await screen.findByText('Document doc-1')).toBeOnTheScreen();
    await act(async () => deliverLate());
    expect(clearLastOpenedReminder).toHaveBeenCalledTimes(2);

    await userEvent.setup().press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Documents')).toBeOnTheScreen();
  });

  it('stays on the list when no reminder was tapped', async () => {
    await renderApp();

    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });
});
