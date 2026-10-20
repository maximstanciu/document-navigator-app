import { groupTimeline } from './timeline';

const today = '2026-10-19';
const due = (id: string, dueDate: string) => ({ id, dueDate });

describe('groupTimeline (REM-1)', () => {
  it('puts overdue deadlines, the next 7 days and the rest in their groups, keeping the order', () => {
    const groups = groupTimeline(
      [
        due('long-ago', '2026-09-30'),
        due('yesterday', '2026-10-18'),
        due('today', '2026-10-19'),
        due('tomorrow', '2026-10-20'),
        due('in-6-days', '2026-10-25'),
        due('in-7-days', '2026-10-26'),
        due('next-year', '2027-01-04'),
      ],
      today
    );

    expect(groups.map((group) => [group.key, group.deadlines.map((d) => d.id)])).toEqual([
      ['overdue', ['long-ago', 'yesterday']],
      ['thisWeek', ['today', 'tomorrow', 'in-6-days']],
      ['later', ['in-7-days', 'next-year']],
    ]);
  });

  it('leaves out groups without deadlines', () => {
    expect(groupTimeline([due('later', '2026-12-01')], today).map((group) => group.key)).toEqual([
      'later',
    ]);
    expect(groupTimeline([], today)).toEqual([]);
  });

  it('counts calendar days across the end of the month and a leap day', () => {
    const groups = groupTimeline(
      [due('mar-6', '2028-03-06'), due('mar-7', '2028-03-07')],
      '2028-02-29'
    );

    expect(groups.map((group) => [group.key, group.deadlines.map((d) => d.id)])).toEqual([
      ['thisWeek', ['mar-6']],
      ['later', ['mar-7']],
    ]);
  });
});
