import { createTestDatabase } from '@/test/sqlite';

import { createSerialQueue } from './database';

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
});

describe('SqlDatabase transactions', () => {
  it('keeps queries issued during a transaction out of it', async () => {
    const db = await createTestDatabase();
    let releaseTransaction = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    const transaction = db.transaction(async (tx) => {
      await tx.runAsync("INSERT INTO settings (key, value) VALUES ('locale', '\"ru\"')");
      await gate;
      throw new Error('roll back');
    });
    const outside = db.runAsync(
      "INSERT INTO settings (key, value) VALUES ('reminder_time', '\"10:00\"')"
    );
    releaseTransaction();

    await expect(transaction).rejects.toThrow('roll back');
    await outside;
    expect(await db.getAllAsync('SELECT key FROM settings')).toEqual([{ key: 'reminder_time' }]);
  });
});
