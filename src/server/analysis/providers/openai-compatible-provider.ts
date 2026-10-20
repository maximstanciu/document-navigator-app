import { PDF_MIME_TYPE } from '@/shared/analysis/contract';
import { toLlmJsonSchema } from '@/shared/analysis/json-schema';

import {
  LlmProviderError,
  type LlmAnalyzeInput,
  type LlmAnalyzeOutput,
  type LlmFile,
  type LlmProvider,
} from '../llm-provider';
import type { PdfRenderer } from '../pdf-renderer';
import { retryPrompt, systemPrompt, userPrompt } from '../prompt';

export type OpenAiCompatibleOptions = {
  /** `LLM_BASE_URL`, up to and including `/v1`, e.g. http://llm:11434/v1 for Ollama. */
  baseUrl: string;
  /** `LLM_MODEL`, e.g. qwen3.6:35b. */
  model: string;
  /** `LLM_API_KEY`; a local model needs none. */
  apiKey?: string | null;
  /** `LLM_REASONING_EFFORT`, e.g. "none" to switch thinking off; `null` leaves the model's default. */
  reasoningEffort?: string | null;
  /** Open models read only images: PDF pages are rendered first (SPEC D-6). */
  pdfRenderer: PdfRenderer;
  fetch?: typeof fetch;
};

/**
 * An answer longer than this is a model stuck in a loop, not an analysis. A full analysis takes
 * a few thousand tokens; on a CPU each costs about a tenth of a second.
 */
const MAX_OUTPUT_TOKENS = 8192;
const SCHEMA = toLlmJsonSchema();

type Message =
  | { role: 'system' | 'assistant'; content: string }
  | { role: 'user'; content: string | ContentPart[] };
type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type Completion = { content: string; inputTokens: number; outputTokens: number };

/**
 * A model behind the OpenAI-compatible Chat Completions API: Ollama or vLLM on our own server, or
 * an open-weights API in the EU (SPEC D-6) — only the address changes. The answer is held to the
 * analysis JSON Schema (`response_format`), and an answer that doesn't fit is retried once with the
 * error (SPEC §7.4). Pages go as JPEG data URLs; a PDF is rendered to JPEG pages first.
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  private readonly url: string;
  private readonly model: string;
  private readonly apiKey: string | null;
  private readonly reasoningEffort: string | null;
  private readonly pdfRenderer: PdfRenderer;
  private readonly fetch: typeof fetch;

  constructor(options: OpenAiCompatibleOptions) {
    this.id = `openai-compatible-${options.model}`;
    this.url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    this.model = options.model;
    this.apiKey = options.apiKey || null;
    this.reasoningEffort = options.reasoningEffort || null;
    this.pdfRenderer = options.pdfRenderer;
    this.fetch = options.fetch ?? fetch;
  }

  async analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeOutput> {
    const pages = await this.encodePages(input.files, input.signal);
    const messages: Message[] = [
      { role: 'system', content: systemPrompt() },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt({ ...input, pageCount: pages.length }) },
          ...pages.map((page) => ({
            type: 'image_url' as const,
            image_url: { url: `data:image/jpeg;base64,${page}` },
          })),
        ],
      },
    ];
    pages.length = 0;

    const first = await this.complete(messages, input.signal);
    let result = parseJson(first.content);
    const problem = result.ok
      ? (input.checkShape?.(result.value) ?? null)
      : 'The answer is not valid JSON.';
    let usage = { inputTokens: first.inputTokens, outputTokens: first.outputTokens };

    if (problem !== null) {
      messages.push(
        { role: 'assistant', content: first.content },
        { role: 'user', content: retryPrompt(problem) }
      );
      const second = await this.complete(messages, input.signal);
      usage = {
        inputTokens: usage.inputTokens + second.inputTokens,
        outputTokens: usage.outputTokens + second.outputTokens,
      };
      result = parseJson(second.content);
    }
    if (!result.ok) {
      throw new LlmProviderError('analysis_failed', 'The model did not answer with JSON.');
    }
    // A model on our own hardware costs nothing per call; an API's prices come with D-6.
    return { result: result.value, usage, costUsd: 0 };
  }

  /**
   * The pages as base64 JPEG. Empties `files` as it goes, so the original bytes can be freed while
   * the model works (SPEC §7.1).
   */
  private async encodePages(files: LlmFile[], signal: AbortSignal | undefined): Promise<string[]> {
    const pages: string[] = [];
    while (files.length > 0) {
      const file = files.shift()!;
      if (file.mimeType === PDF_MIME_TYPE) {
        pages.push(...(await this.pdfRenderer.render(file.bytes, signal)));
      } else {
        pages.push(toBase64(file.bytes));
      }
    }
    return pages;
  }

  private async complete(messages: Message[], signal: AbortSignal | undefined) {
    const body = {
      model: this.model,
      messages,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'document_analysis', strict: true, schema: SCHEMA },
      },
      ...(this.reasoningEffort ? { reasoning_effort: this.reasoningEffort } : {}),
    };
    let response: Response;
    try {
      response = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new LlmProviderError('unavailable', 'The model did not answer.');
    }
    if (!response.ok) {
      throw new LlmProviderError('unavailable', `The model answered ${response.status}.`);
    }
    return readCompletion(await response.json().catch(() => null));
  }
}

function readCompletion(body: unknown): Completion {
  const { choices, usage } = (body ?? {}) as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const choice = Array.isArray(choices) ? choices[0] : undefined;
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new LlmProviderError('unavailable', 'The model answered without a message.');
  }
  if (choice?.finish_reason === 'length') {
    throw new LlmProviderError('analysis_failed', 'The model ran out of output tokens.');
  }
  return {
    content,
    inputTokens: tokens(usage?.prompt_tokens),
    outputTokens: tokens(usage?.completion_tokens),
  };
}

function tokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Base64 without Node's Buffer, which Workers don't have. */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}
