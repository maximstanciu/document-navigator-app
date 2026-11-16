import { createSerialQueue } from './serial-queue';

describe('createSerialQueue', () => {
  it('runs tasks one after another and keeps going after a failure', async () => {
    const enqueue = createSerialQueue();
    const order: string[] = [];
    const slow = enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('slow');
    });
    const failing = enqueue(async () => {
      order.push('failing');
      throw new Error('boom');
    });
    const fast = enqueue(async () => {
      order.push('fast');
    });

    await slow;
    await expect(failing).rejects.toThrow('boom');
    await fast;
    expect(order).toEqual(['slow', 'failing', 'fast']);
  });

  it('returns the result of each task', async () => {
    const enqueue = createSerialQueue();
    await expect(
      Promise.all([enqueue(async () => 1), enqueue(async () => 'two')])
    ).resolves.toEqual([1, 'two']);
  });

  it('keeps separate queues apart', async () => {
    const first = createSerialQueue();
    const second = createSerialQueue();
    let release = () => {};
    const blocked = first(() => new Promise<void>((resolve) => (release = resolve)));

    await expect(second(async () => 'ran')).resolves.toBe('ran');
    release();
    await blocked;
  });
});
