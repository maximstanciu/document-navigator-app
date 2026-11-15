/** Enough to smooth one slow analysis out, few enough to follow a change of the model. */
const SAMPLES = 10;

/**
 * What an analysis costs besides its pages (the prompt with the memo, writing the answer), in
 * pages: about as much as one more page, by the analyses measured on the server's CPU.
 */
const FIXED_PAGES = 1;

/**
 * How long analyses take on this server, for the estimate the app shows (ANL-3). Every analysis
 * that ended well tells the time of one page (`FIXED_PAGES` counted in); the estimate takes the
 * median of the last ones, so an analysis made twice (ANL-14) doesn't swing it. In memory only: a
 * restart starts again from `seedPageMs`, or without an estimate until the first analysis ends.
 */
export class JobDurations {
  private readonly pageMs: number[] = [];

  constructor(private readonly seedPageMs: number | null = null) {}

  /** A job of `pageCount` pages took `ms` from its start to its result. */
  record(pageCount: number, ms: number): void {
    if (!(ms > 0)) return;
    this.pageMs.push(ms / (pageCount + FIXED_PAGES));
    if (this.pageMs.length > SAMPLES) this.pageMs.shift();
  }

  /** The time a job of `pageCount` pages takes from its start, in ms; `null` with nothing to go by. */
  estimate(pageCount: number): number | null {
    const pageMs = this.pageMs.length > 0 ? median(this.pageMs) : this.seedPageMs;
    return pageMs === null ? null : pageMs * (pageCount + FIXED_PAGES);
  }
}

/**
 * `ANALYSIS_ETA_ONE_PAGE_SECONDS`: how long the analysis of a one-page document takes on this
 * server, for the estimates before the first analysis since the start ends. Unset — no estimate
 * until then.
 */
export function seedPageMs(onePageSeconds: number | null): number | null {
  return onePageSeconds === null ? null : (onePageSeconds * 1000) / (1 + FIXED_PAGES);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
