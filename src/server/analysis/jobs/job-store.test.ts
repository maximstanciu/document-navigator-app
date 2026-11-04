/** @jest-environment node */
import { createAnalysisJob, type AnalysisJob, type JobResult } from './analysis-job';
import { MemoryAnalysisJobStore } from './job-store';

const TTL_MS = 24 * 60 * 60 * 1000;
const DONE: JobResult = {
  status: 'done',
  response: { analysis: {} as never, pageCount: 1, legalMemo: null },
};
const FAILED: JobResult = { status: 'failed', code: 'unavailable' };

let time = 0;
let expired: AnalysisJob[] = [];

function store() {
  return new MemoryAnalysisJobStore({
    now: () => time,
    resultTtlMs: TTL_MS,
    onExpired: (job) => expired.push(job),
  });
}

function job(device: string, jobId: string): AnalysisJob {
  return createAnalysisJob({
    device,
    jobId,
    job: `job-${jobId}`,
    usage: { requestId: 'r', device, ip: 'ip', platform: 'android', day: '2026-10-18' },
    kind: 'images',
    pageCount: 1,
    locale: 'ru',
    uiLocale: 'ru',
    pushToken: null,
    queuedAt: time,
    input: {
      files: [],
      locale: 'ru',
      today: '2026-10-18',
      timezone: 'Europe/Berlin',
      country: null,
    },
  });
}

describe('MemoryAnalysisJobStore', () => {
  beforeEach(() => {
    time = Date.parse('2026-10-18T12:00:00Z');
    expired = [];
  });

  it('starts jobs in the order they came and tells each how many are ahead', () => {
    const jobs = store();
    const [a, b, c] = ['a', 'b', 'c'].map((id) => job('d1', id));
    for (const each of [a, b, c]) jobs.add(each);

    expect([a, b, c].map((each) => jobs.ahead(each))).toEqual([0, 1, 2]);
    expect(jobs.start()).toBe(a);
    expect(a.status).toBe('processing');
    // The running job is still ahead of the others.
    expect([b, c].map((each) => jobs.ahead(each))).toEqual([1, 2]);

    expect(jobs.finish(a, DONE)).toBe(true);
    expect([b, c].map((each) => jobs.ahead(each))).toEqual([0, 1]);
    expect(jobs.start()).toBe(b);
    expect(jobs.start()).toBe(c);
    expect(jobs.start()).toBeUndefined();
  });

  it('keeps jobs apart by device', () => {
    const jobs = store();
    const mine = job('d1', 'same');
    const theirs = job('d2', 'same');
    jobs.add(mine);
    jobs.add(theirs);

    expect(jobs.get('d1', 'same')).toBe(mine);
    expect(jobs.get('d2', 'same')).toBe(theirs);
    expect(jobs.get('d3', 'same')).toBeUndefined();
    expect(() => jobs.add(job('d1', 'same'))).toThrow();
  });

  it('counts a device’s unfinished jobs: queued, running, done and not fetched (SPEC §8.3)', () => {
    const jobs = store();
    const [queued, running, done, fetched, failed] = ['q', 'r', 'd', 'f', 'x'].map((id) =>
      job('d1', id)
    );
    for (const each of [running, done, fetched, failed, queued]) jobs.add(each);
    jobs.add(job('d2', 'other'));
    // Started in the order they were added: running, done, fetched, failed.
    for (let i = 0; i < 4; i++) jobs.start();
    jobs.finish(done, DONE);
    jobs.finish(fetched, DONE);
    fetched.fetched = true;
    jobs.finish(failed, FAILED);

    expect(jobs.unfinished('d1')).toBe(3);
    expect(jobs.unfinished('d2')).toBe(1);
    // d1's last job and d2's.
    expect(jobs.queued()).toBe(2);
  });

  it('counts an upload holding a place as queued and unfinished until it lets go', () => {
    const jobs = store();
    const reservation = jobs.reserve('d1');
    jobs.reserve('d2');

    expect(jobs.queued()).toBe(2);
    expect(jobs.unfinished('d1')).toBe(1);

    reservation.release();
    reservation.release();

    expect(jobs.queued()).toBe(1);
    expect(jobs.unfinished('d1')).toBe(0);
    expect(jobs.unfinished('d2')).toBe(1);
  });

  it('removes a job wherever it is, with its files, and drops the result of a removed one', () => {
    const jobs = store();
    const queued = job('d1', 'q');
    const running = job('d1', 'r');
    jobs.add(running);
    jobs.add(queued);
    jobs.start();

    expect(jobs.remove('d1', 'q')).toBe(queued);
    expect(queued.input).toBeNull();
    expect(jobs.remove('d1', 'r')).toBe(running);
    expect(jobs.finish(running, DONE)).toBe(false);
    expect(running.result).toBeNull();
    expect(jobs.remove('d1', 'r')).toBeUndefined();
    expect(jobs.start()).toBeUndefined();
  });

  it('lets finished jobs expire after the retention, queued and running ones never', () => {
    const jobs = store();
    const [done, failed, running, queued] = ['d', 'f', 'r', 'q'].map((id) => job('d1', id));
    for (const each of [done, failed, running, queued]) jobs.add(each);
    jobs.start();
    jobs.start();
    jobs.start();
    jobs.finish(done, DONE);
    time += 1000;
    jobs.finish(failed, FAILED);

    time += TTL_MS - 1;
    expect(jobs.get('d1', 'd')).toBeUndefined();
    expect(jobs.get('d1', 'f')).toBe(failed);
    expect(expired).toEqual([done]);

    time += 10 * TTL_MS;
    expect(jobs.get('d1', 'f')).toBeUndefined();
    expect(jobs.get('d1', 'r')).toBe(running);
    expect(jobs.get('d1', 'q')).toBe(queued);
    expect(expired).toEqual([done, failed]);
  });

  describe('with a timer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('removes an expired job even if nobody asks the store', () => {
      const jobs = store();
      const [first, second] = ['1', '2'].map((id) => job('d1', id));
      jobs.add(first);
      jobs.add(second);
      jobs.start();
      jobs.finish(first, DONE);
      time += 60_000;
      jobs.start();
      jobs.finish(second, FAILED);

      time += TTL_MS - 60_000;
      jest.advanceTimersByTime(TTL_MS - 60_000);
      expect(expired).toEqual([first]);

      time += 60_000;
      jest.advanceTimersByTime(60_000);
      expect(expired).toEqual([first, second]);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('wakes up at least hourly, so a long retention never overflows the timer', () => {
      const jobs = new MemoryAnalysisJobStore({
        now: () => time,
        resultTtlMs: 1000 * TTL_MS,
        onExpired: (each) => expired.push(each),
      });
      const done = job('d1', 'd');
      jobs.add(done);
      jobs.start();
      jobs.finish(done, DONE);

      for (let hour = 0; hour < 24_000; hour++) {
        time += 60 * 60 * 1000;
        jest.advanceTimersByTime(60 * 60 * 1000);
      }

      expect(expired).toEqual([done]);
    });
  });
});
