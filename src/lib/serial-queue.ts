/**
 * Runs tasks one at a time, in the order they were queued: a task starts once the one before it has
 * settled, whether it resolved or failed. Each call returns the task's own result.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(() => task());
    tail = result.catch(() => undefined);
    return result;
  };
}
