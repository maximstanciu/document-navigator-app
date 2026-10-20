import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { Button } from '@/components/ui/button';
import { syncReminders } from '@/features/reminders/sync-reminders';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import { fakeNotifications } from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import * as api from '../api';
import { DeadlinesScreen } from './deadlines-screen';

let repositories: Repositories;

// The groups are relative to the real «today» the screen reads.
const today = localCalendarDate(new Date());
const inDays = (days: number) => addDays(today, days);

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  for (const [id, title] of [
    ['bill', 'Electricity bill'],
    ['letter', 'Tax office letter'],
  ]) {
    await repositories.documents.create({
      id,
      title,
      source: 'file',
      mimeType: 'application/pdf',
      fileSize: 10,
    });
  }
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

async function addDeadline(id: string, documentId: string, dueDate: string, description: string) {
  await repositories.deadlines.insertMany([
    {
      id,
      documentId,
      kind: 'payment',
      description,
      dueDate,
      dateSource: 'explicit',
      confidence: 'high',
    },
  ]);
}

function DocumentRoute() {
  return (
    <>
      <Text>Document screen</Text>
      <Button label="Back" onPress={() => router.back()} />
    </>
  );
}

/** The tab stays mounted under the document, as under the app's root stack. */
function renderTab() {
  return renderRouter(
    { _layout: () => <Stack />, index: DeadlinesScreen, 'documents/[id]': DocumentRoute },
    { initialUrl: '/', wrapper: createTestProviders() }
  );
}

const user = () => userEvent.setup();

/** The section headings and the deadlines under each, in screen order. */
function timeline() {
  const groups: [string, string[]][] = [];
  for (const node of screen.getAllByRole(/heading|checkbox/)) {
    // A checkbox is named by its label, a heading is plain text.
    const name = node.props.accessibilityLabel ?? node.props['aria-label'] ?? node.props.children;
    if (node.props.role === 'heading') groups.push([String(name), []]);
    else groups.at(-1)?.[1].push(String(name));
  }
  return groups.slice(1); // The first heading is the screen's title.
}

describe('DeadlinesScreen', () => {
  it('lists open deadlines of all documents in Overdue, This week and Later (REM-1)', async () => {
    await addDeadline('late', 'letter', inDays(30), 'Answer the tax office');
    await addDeadline('overdue', 'bill', inDays(-2), 'Pay the old bill');
    await addDeadline('soon', 'bill', inDays(1), 'Pay the bill');
    await addDeadline('week', 'letter', inDays(6), 'Send the documents');
    await addDeadline('done', 'bill', inDays(3), 'Already paid');
    await repositories.deadlines.update('done', { status: 'done' });

    await renderTab();

    expect(await screen.findByRole('heading', { name: 'Deadlines' })).toBeOnTheScreen();
    expect(timeline()).toEqual([
      ['Overdue', ['Pay the old bill']],
      ['This week', ['Pay the bill', 'Send the documents']],
      ['Later', ['Answer the tax office']],
    ]);
    expect(screen.getByText(/^Tomorrow/)).toBeOnTheScreen();
    expect(screen.getByText('In 6 days')).toBeOnTheScreen();
    expect(
      screen.getAllByRole('link', { name: 'Open the document “Electricity bill”' })
    ).toHaveLength(2);
    expect(screen.queryByText('Already paid')).not.toBeOnTheScreen();
  });

  it('shows the actions of a deadline instead of the deadline’s own «Done» (DET-3)', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Payment due');
    await repositories.actions.insertMany([
      {
        id: 'transfer',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Transfer the money',
        priority: 'high',
      },
      {
        id: 'keep',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Keep the receipt',
        priority: 'low',
      },
    ]);
    await repositories.actions.setDone('keep', true);

    await renderTab();

    expect(await screen.findByRole('checkbox', { name: 'Transfer the money' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Keep the receipt' })).toBeChecked();
    expect(screen.getByText('Payment due')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Payment due' })).not.toBeOnTheScreen();
  });

  it('does not repeat a description its only action already says', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    await repositories.actions.insertMany([
      {
        id: 'pay-it',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Pay the bill',
        priority: 'high',
      },
    ]);

    await renderTab();

    expect(await screen.findByRole('checkbox', { name: 'Pay the bill' })).toBeOnTheScreen();
    expect(screen.getAllByText('Pay the bill')).toHaveLength(1);
  });

  it('takes a deadline marked done off the tab, with undo (US-9)', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    await renderTab();

    await user().press(await screen.findByRole('checkbox', { name: 'Pay the bill' }));

    expect(await screen.findByText('Done: “Pay the bill”')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Pay the bill' })).not.toBeOnTheScreen();
    expect(await repositories.deadlines.get('pay')).toMatchObject({ status: 'done' });

    await user().press(screen.getByRole('button', { name: 'Undo: “Pay the bill”' }));

    expect(await screen.findByRole('checkbox', { name: 'Pay the bill' })).toBeOnTheScreen();
    expect(screen.queryByText('Done: “Pay the bill”')).not.toBeOnTheScreen();
    expect(await repositories.deadlines.get('pay')).toMatchObject({ status: 'open' });
  });

  it('closes a deadline with its last action, and undo reopens it (REM-9)', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Payment due');
    await repositories.actions.insertMany([
      {
        id: 'transfer',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Transfer the money',
        priority: 'high',
      },
      {
        id: 'keep',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Keep the receipt',
        priority: 'low',
      },
    ]);
    await renderTab();

    await user().press(await screen.findByRole('checkbox', { name: 'Transfer the money' }));
    expect(await screen.findByRole('checkbox', { name: 'Transfer the money' })).toBeChecked();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeOnTheScreen();

    // The offer names what was ticked, not the deadline's own text.
    await user().press(screen.getByRole('checkbox', { name: 'Keep the receipt' }));
    expect(await screen.findByText('Done: “Keep the receipt”')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Keep the receipt' })).not.toBeOnTheScreen();

    await user().press(screen.getByRole('button', { name: 'Undo: “Keep the receipt”' }));

    expect(await screen.findByRole('checkbox', { name: 'Keep the receipt' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Transfer the money' })).toBeChecked();
    expect(await repositories.deadlines.get('pay')).toMatchObject({ status: 'open' });
  });

  it('takes a deadline marked not relevant off the tab, with undo (US-12)', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    await renderTab();

    await user().press(
      await screen.findByRole('button', { name: 'Mark “Pay the bill” as not relevant' })
    );

    expect(await screen.findByText('Not relevant: “Pay the bill”')).toBeOnTheScreen();
    expect(await repositories.deadlines.get('pay')).toMatchObject({ status: 'dismissed' });

    await user().press(screen.getByRole('button', { name: 'Undo: “Pay the bill”' }));

    expect(await screen.findByRole('checkbox', { name: 'Pay the bill' })).toBeOnTheScreen();
    expect(await repositories.deadlines.get('pay')).toMatchObject({ status: 'open' });
  });

  it('cancels the reminders of a deadline marked done or not relevant (REM-9)', async () => {
    fakeNotifications.permission = 'granted';
    await addDeadline('pay', 'bill', inDays(20), 'Pay the bill');
    await addDeadline('answer', 'letter', inDays(30), 'Answer the tax office');
    await syncReminders();
    const remindedDeadlines = () =>
      new Set(fakeNotifications.pending().map((notification) => notification.data.deadlineId));
    expect(remindedDeadlines()).toEqual(new Set(['pay', 'answer']));
    await renderTab();

    await user().press(await screen.findByRole('checkbox', { name: 'Pay the bill' }));
    await waitFor(() => expect(remindedDeadlines()).toEqual(new Set(['answer'])));

    await user().press(
      screen.getByRole('button', { name: 'Mark “Answer the tax office” as not relevant' })
    );
    await waitFor(() => expect(remindedDeadlines()).toEqual(new Set()));
  });

  it('drops the offer to undo once the person leaves the tab', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    await addDeadline('answer', 'letter', inDays(30), 'Answer the tax office');
    await renderTab();
    await user().press(await screen.findByRole('checkbox', { name: 'Pay the bill' }));
    expect(await screen.findByText('Done: “Pay the bill”')).toBeOnTheScreen();

    await user().press(screen.getByRole('link', { name: 'Open the document “Tax office letter”' }));
    expect(await screen.findByText('Document screen')).toBeOnTheScreen();
    expect(screen).toHavePathname('/documents/letter');
    await user().press(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: 'Deadlines' })).toBeOnTheScreen();
    expect(screen.queryByText('Done: “Pay the bill”')).not.toBeOnTheScreen();
  });

  it('says so when a change fails', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    jest.spyOn(api, 'setDeadlineDone').mockRejectedValueOnce(new Error('Database is busy'));
    await renderTab();

    await user().press(await screen.findByRole('checkbox', { name: 'Pay the bill' }));

    expect(await screen.findByText("Couldn't save the change. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Pay the bill' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Undo/ })).not.toBeOnTheScreen();
  });

  it('invites to wait for deadlines when there are none', async () => {
    await renderTab();

    expect(await screen.findByText('No open deadlines')).toBeOnTheScreen();
  });

  it('shows an error with a retry that reloads', async () => {
    await addDeadline('pay', 'bill', inDays(3), 'Pay the bill');
    jest.spyOn(api, 'listOpenDeadlines').mockRejectedValueOnce(new Error('Database is busy'));
    await renderTab();

    await user().press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'Pay the bill' })).toBeOnTheScreen();
  });

  it('speaks Russian with the Russian plural forms', async () => {
    await i18n.changeLanguage('ru');
    await addDeadline('week', 'bill', inDays(5), 'Оплатить счёт');
    await addDeadline('late', 'letter', inDays(21), 'Ответить');

    await renderTab();

    expect(await screen.findByRole('heading', { name: 'Сроки' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'На этой неделе' })).toBeOnTheScreen();
    expect(screen.getByText('Через 5 дней')).toBeOnTheScreen();
    expect(screen.getByText('Через 21 день')).toBeOnTheScreen();
  });
});
