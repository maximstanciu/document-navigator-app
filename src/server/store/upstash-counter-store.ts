import {
  StoreUnavailableError,
  type CounterStore,
  type StoreCommand,
  type StoreValue,
} from './counter-store';

export type UpstashOptions = {
  /** `UPSTASH_REDIS_REST_URL`, e.g. https://eu1-example-12345.upstash.io */
  url: string;
  /** `UPSTASH_REDIS_REST_TOKEN`, a sensitive EAS variable. */
  token: string;
  /** A slow store must not hold up an analysis: past this the call counts as failed. */
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type PipelineEntry = { result?: unknown; error?: string };

/**
 * Upstash Redis over its REST API: one `POST /pipeline` per `run()`, plain `fetch`, no SDK
 * (https://upstash.com/docs/redis/features/restapi). Error texts from Upstash aren't passed on:
 * the caller logs only that the store was unavailable.
 */
export class UpstashCounterStore implements CounterStore {
  private readonly url: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor({ url, token, timeoutMs = 3000, fetch: fetchImpl = fetch }: UpstashOptions) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async run(commands: StoreCommand[]): Promise<StoreValue[]> {
    if (commands.length === 0) return [];
    let response: Response;
    try {
      response = await this.fetch(`${this.url}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands.map((command) => command.map(String))),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new StoreUnavailableError('Upstash did not answer.');
    }
    if (!response.ok) {
      throw new StoreUnavailableError(`Upstash answered ${response.status}.`);
    }

    const entries = (await response.json().catch(() => null)) as PipelineEntry[] | null;
    if (!Array.isArray(entries) || entries.length !== commands.length) {
      throw new StoreUnavailableError('Upstash answered with an unexpected body.');
    }
    return entries.map((entry, index) => {
      if (entry.error !== undefined) {
        throw new StoreUnavailableError(`Upstash refused command ${index + 1}.`);
      }
      return toValue(entry.result);
    });
  }
}

function toValue(result: unknown): StoreValue {
  if (result === null || typeof result === 'string' || typeof result === 'number') return result;
  if (Array.isArray(result)) return result.map(String);
  return null;
}
