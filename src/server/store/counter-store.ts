// Counters for limits and beta metrics (SPEC §8.3, §8.7) in Redis terms: Upstash Redis on EAS
// Hosting, an in-memory copy for tests and the dev server. Only the commands the server uses.

export type StoreCommand =
  | ['GET', key: string]
  | ['INCR', key: string]
  | ['INCRBY', key: string, increment: number]
  | ['EXPIRE', key: string, seconds: number]
  | ['SADD', key: string, member: string]
  | ['SMEMBERS', key: string];

/** What a command returns: GET a string or null, INCR a number, SMEMBERS a list. */
export type StoreValue = string | number | string[] | null;

export interface CounterStore {
  /**
   * Runs the commands in order in one round trip. Not atomic: other requests' commands can come in
   * between, as in an Upstash pipeline. Throws `StoreUnavailableError` when the store can't answer.
   */
  run(commands: StoreCommand[]): Promise<StoreValue[]>;
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

type Entry = { value: number | Set<string>; expiresAt: number | null };

/**
 * The store in this process's memory. On EAS Hosting every isolate would get its own, so limits
 * there need Upstash; this one is for tests and the dev server.
 */
export class MemoryCounterStore implements CounterStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  async run(commands: StoreCommand[]): Promise<StoreValue[]> {
    return commands.map((command) => this.apply(command));
  }

  private apply(command: StoreCommand): StoreValue {
    switch (command[0]) {
      case 'GET': {
        const entry = this.live(command[1]);
        return entry && typeof entry.value === 'number' ? String(entry.value) : null;
      }
      case 'INCR':
        return this.increment(command[1], 1);
      case 'INCRBY':
        return this.increment(command[1], command[2]);
      case 'EXPIRE': {
        const entry = this.live(command[1]);
        if (!entry) return 0;
        entry.expiresAt = this.now() + command[2] * 1000;
        return 1;
      }
      case 'SADD': {
        const entry = this.live(command[1]) ?? this.create(command[1], new Set<string>());
        const members = entry.value as Set<string>;
        const added = members.has(command[2]) ? 0 : 1;
        members.add(command[2]);
        return added;
      }
      case 'SMEMBERS': {
        const entry = this.live(command[1]);
        return entry && entry.value instanceof Set ? [...entry.value] : [];
      }
    }
  }

  private increment(key: string, by: number) {
    const entry = this.live(key) ?? this.create(key, 0);
    entry.value = (entry.value as number) + by;
    return entry.value;
  }

  private create(key: string, value: Entry['value']) {
    const entry: Entry = { value, expiresAt: null };
    this.entries.set(key, entry);
    return entry;
  }

  private live(key: string) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
