import { act, renderHook } from '@testing-library/react-native';

import { useNow } from './use-now';

const START = new Date('2026-11-15T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers({ now: START });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useNow', () => {
  it('takes the time once, without a tick', async () => {
    const { result } = await renderHook(() => useNow());

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current).toEqual(START);
  });

  it('takes it again every tick, for a countdown', async () => {
    const { result, unmount } = await renderHook(() => useNow(15_000));

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });
    expect(result.current).toEqual(new Date(START.getTime() + 15_000));

    const clearInterval = jest.spyOn(globalThis, 'clearInterval');
    await unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });
});
