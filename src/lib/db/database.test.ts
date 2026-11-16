import { createTestDatabase } from '@/test/sqlite';

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
