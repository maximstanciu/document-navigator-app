import { QueryClient } from '@tanstack/react-query';

import { checkAnalysisJobsNow } from './queries';

// The check itself (asking the server, storing, reading again) is covered by the opener's tests
// (ANL-12) and `checkAnalysisJobs()`'s; this is about how long a tap waits for it.
describe('checkAnalysisJobsNow', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stops waiting after the timeout when the check takes longer', async () => {
    const queryClient = new QueryClient();
    jest.spyOn(queryClient, 'fetchQuery').mockImplementation(() => new Promise(() => {}));
    const settled = jest.fn();
    void checkAnalysisJobsNow(queryClient, 5_000).then(settled);

    await jest.advanceTimersByTimeAsync(4_999);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalled();
  });

  it('resolves as soon as the check ends, even when it fails', async () => {
    const queryClient = new QueryClient();
    jest.spyOn(queryClient, 'fetchQuery').mockRejectedValue(new Error('disk I/O error'));

    await expect(checkAnalysisJobsNow(queryClient, 5_000)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
