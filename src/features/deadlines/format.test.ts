import { i18n } from '@/lib/i18n/i18n';

import { formatDueIn } from './format';

const t = i18n.t.bind(i18n);

describe('formatDueIn', () => {
  it.each([
    ['2026-10-17', 'Overdue'],
    ['2026-10-18', 'Today'],
    ['2026-10-19', 'Tomorrow'],
    ['2026-10-20', 'In 2 days'],
    ['2026-11-01', 'In 14 days'],
  ])('a deadline on %s from 2026-10-18 reads «%s»', (dueDate, expected) => {
    expect(formatDueIn(dueDate, '2026-10-18', t)).toBe(expected);
  });

  it('uses the Russian plural forms', async () => {
    await i18n.changeLanguage('ru');

    expect(
      ['2026-10-20', '2026-10-23', '2026-11-08'].map((date) => formatDueIn(date, '2026-10-18', t))
    ).toEqual(['Через 2 дня', 'Через 5 дней', 'Через 21 день']);
  });
});
