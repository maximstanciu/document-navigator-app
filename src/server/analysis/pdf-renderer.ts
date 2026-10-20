import { LlmProviderError } from './llm-provider';

/** Turns a PDF into its pages as base64 JPEG, for a model that reads only images (SPEC D-6). */
export interface PdfRenderer {
  render(pdf: Uint8Array, signal?: AbortSignal): Promise<string[]>;
}

export type HttpPdfRendererOptions = {
  /** `PDF_RENDER_URL`: the pdf-render service of deploy/compose.yaml, e.g. http://pdf-render:8080 */
  url: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

/**
 * The pdf-render service (deploy/pdf-render): `POST /render` with the PDF, `{ pages: [base64] }`
 * back. It keeps nothing. Its answers aren't passed on: they could quote the file.
 */
export class HttpPdfRenderer implements PdfRenderer {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor({ url, timeoutMs = 120_000, fetch: fetchImpl = fetch }: HttpPdfRendererOptions) {
    this.url = url.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async render(pdf: Uint8Array, signal?: AbortSignal): Promise<string[]> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetch(`${this.url}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdf as BodyInit,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new LlmProviderError('unavailable', 'The PDF renderer did not answer.');
    }
    if (response.status === 422) {
      throw new LlmProviderError('invalid_pdf', 'The PDF renderer could not read the file.');
    }
    if (!response.ok) {
      throw new LlmProviderError('unavailable', `The PDF renderer answered ${response.status}.`);
    }
    const body = (await response.json().catch(() => null)) as { pages?: unknown } | null;
    const pages = body?.pages;
    if (!Array.isArray(pages) || pages.length === 0 || !pages.every(isString)) {
      throw new LlmProviderError('unavailable', 'The PDF renderer answered with no pages.');
    }
    return pages;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}
