import { MemoryCounterStore } from './counter-store';

describe('MemoryCounterStore', () => {
  let time = 0;
  const store = () => new MemoryCounterStore(() => time);

  beforeEach(() => {
    time = 1_000_000;
  });

  it('counts like Redis: GET is a string or null, INCR and INCRBY return the new value', async () => {
    const counters = store();
    await expect(
      counters.run([
        ['GET', 'a'],
        ['INCR', 'a'],
        ['INCRBY', 'a', 41],
        ['GET', 'a'],
      ])
    ).resolves.toEqual([null, 1, 42, '42']);
  });

  it('forgets a key once it expires', async () => {
    const counters = store();
    await counters.run([
      ['INCR', 'a'],
      ['EXPIRE', 'a', 10],
    ]);

    time += 9_999;
    await expect(counters.run([['GET', 'a']])).resolves.toEqual(['1']);
    time += 1;
    await expect(
      counters.run([
        ['GET', 'a'],
        ['INCR', 'a'],
      ])
    ).resolves.toEqual([null, 1]);
  });

  it('answers EXPIRE on a missing key with 0', async () => {
    await expect(store().run([['EXPIRE', 'missing', 10]])).resolves.toEqual([0]);
  });

  it('keeps sets of members', async () => {
    const counters = store();
    await expect(
      counters.run([
        ['SADD', 's', 'x'],
        ['SADD', 's', 'y'],
        ['SADD', 's', 'x'],
        ['SMEMBERS', 's'],
        ['SMEMBERS', 'none'],
      ])
    ).resolves.toEqual([1, 1, 0, ['x', 'y'], []]);
  });
});
