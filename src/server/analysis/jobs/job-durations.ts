/**
 * Analyses remembered: enough for short letters and long PDFs to each have their own, few enough
 * to follow a change of the model.
 */
const SAMPLES = 50;

/**
 * An estimate takes the median of the latest this many analyses of the job's volume, or while
 * that volume has fewer than `OWN_VOLUME_ENOUGH`, of this many closest to it. Odd, so the median is
 * one of them, and two slow ones don't swing it.
 */
const MEDIAN_OF = 5;

/** Analyses of its own volume enough for a job to be estimated by them alone. */
const OWN_VOLUME_ENOUGH = 3;

/**
 * What an analysis costs besides its pages (the prompt with the memo, writing the answer), in
 * pages: about as much as one more page, by the analyses measured on the server's CPU.
 */
const FIXED_PAGES = 1;

/** One analysis that ended well: its pages and its time per page, with the fixed part. */
type Sample = { pageCount: number; unitMs: number };

/**
 * How long analyses take on this server, for the estimate the app shows (ANL-3), by the median of
 * the analyses of the same volume: the pages the model reads, in classes up to a power of two
 * (1, 2, 3–4, 5–8 … 33–64 pages). A page doesn't cost the same in every document: on a CPU the
 * model reads and writes slower the longer the prompt, so a 50-page PDF takes about 1.6 times
 * longer a page than a letter (deploy/README.md, «Модель»), and the times of letters would
 * underestimate it. Each analysis counts as its time per page with the fixed part, so the pages
 * within a class, and a volume with too few analyses of its own, are scaled from the closest ones.
 * The median, so an analysis made twice (ANL-14) or one slow analysis doesn't swing it. In memory
 * only: a restart starts again from `seedPageMs`, or without an estimate until the first analysis
 * ends.
 */
export class JobDurations {
  /** The oldest first. */
  private readonly samples: Sample[] = [];

  constructor(private readonly seedPageMs: number | null = null) {}

  /** A job of `pageCount` pages took `ms` from its start to its result. */
  record(pageCount: number, ms: number): void {
    if (!(ms > 0)) return;
    this.samples.push({ pageCount, unitMs: ms / (pageCount + FIXED_PAGES) });
    if (this.samples.length > SAMPLES) this.samples.shift();
  }

  /** The time a job of `pageCount` pages takes from its start, in ms; `null` with nothing to go by. */
  estimate(pageCount: number): number | null {
    const units = pageCount + FIXED_PAGES;
    if (this.samples.length === 0) return this.seedPageMs === null ? null : this.seedPageMs * units;
    const latest = [...this.samples].reverse();
    const own = latest.filter((sample) => volumeClass(sample.pageCount) === volumeClass(pageCount));
    const basis = own.length >= OWN_VOLUME_ENOUGH ? own : latest.sort(byDistanceTo(pageCount));
    return median(basis.slice(0, MEDIAN_OF).map((sample) => sample.unitMs)) * units;
  }
}

/** 0 for 1 page, 1 for 2, 2 for 3–4, 3 for 5–8 … */
function volumeClass(pageCount: number): number {
  return Math.ceil(Math.log2(Math.max(1, pageCount)));
}

/**
 * Volumes compared by ratio, the fixed part counted in: 1 page against 2 is as far as 25 against
 * 50. The sort is stable, so of the same distance the latest analyses stay first.
 */
function byDistanceTo(pageCount: number) {
  const distance = (sample: Sample) =>
    Math.abs(Math.log((sample.pageCount + FIXED_PAGES) / (pageCount + FIXED_PAGES)));
  return (a: Sample, b: Sample) => distance(a) - distance(b);
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
