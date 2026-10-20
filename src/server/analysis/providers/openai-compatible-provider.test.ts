/** @jest-environment node */
import { llmOutputFixture } from '@/shared/analysis/fixtures';
import { toLlmJsonSchema } from '@/shared/analysis/json-schema';

import { LlmProviderError, type LlmAnalyzeInput, type LlmFile } from '../llm-provider';
import type { PdfRenderer } from '../pdf-renderer';
import {
  OpenAiCompatibleProvider,
  type OpenAiCompatibleOptions,
} from './openai-compatible-provider';

const ANSWER = llmOutputFixture('invoice');

function completion(content: unknown, extra: Record<string, unknown> = {}) {
  return Response.json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1200, completion_tokens: 300 },
    ...extra,
  });
}

/** A provider whose `fetch` answers with `responses` in turn; `requests` holds the parsed bodies. */
function providerAnswering(
  responses: (Response | Error)[],
  options: Partial<OpenAiCompatibleOptions> = {}
) {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const renderer: PdfRenderer = { render: jest.fn(async () => ['UERGcGFnZQ==']) };
  const provider = new OpenAiCompatibleProvider({
    baseUrl: 'http://llm:11434/v1/',
    model: 'qwen3.6:35b',
    pdfRenderer: renderer,
    fetch: fetchMock as unknown as typeof fetch,
    ...options,
  });
  const requests = () =>
    fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string) as RequestBody);
  return { provider, fetchMock, renderer, requests };
}

type RequestBody = {
  messages: {
    role: string;
    content: string | { type: string; text?: string; image_url?: { url: string } }[];
  }[];
  [field: string]: unknown;
};

function input(files: LlmFile[], extra: Partial<LlmAnalyzeInput> = {}): LlmAnalyzeInput {
  return { files, locale: 'en', today: '2026-10-20', timezone: 'Europe/Berlin', ...extra };
}

const jpegFile = (bytes: number[]): LlmFile => ({
  mimeType: 'image/jpeg',
  bytes: new Uint8Array(bytes),
});

describe('OpenAiCompatibleProvider', () => {
  it('sends the prompt and the pages, held to the analysis schema', async () => {
    const { provider, fetchMock, requests } = providerAnswering([
      completion(JSON.stringify(ANSWER)),
    ]);
    const files = [jpegFile([0xff, 0xd8, 0xff]), jpegFile([1, 2, 3, 4])];

    const output = await provider.analyze(input(files));

    expect(output).toEqual({
      result: ANSWER,
      usage: { inputTokens: 1200, outputTokens: 300 },
      costUsd: 0,
    });
    expect(provider.id).toBe('openai-compatible-qwen3.6:35b');
    expect(files).toEqual([]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm:11434/v1/chat/completions');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const [body] = requests();
    expect(body).toMatchObject({
      model: 'qwen3.6:35b',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'document_analysis', strict: true, schema: toLlmJsonSchema() },
      },
    });
    expect(body).not.toHaveProperty('reasoning_effort');
    const [system, user] = body.messages;
    expect(system).toMatchObject({
      role: 'system',
      content: expect.stringContaining('fraudSignals'),
    });
    expect(user.content).toEqual([
      {
        type: 'text',
        text: expect.stringMatching(
          /English[\s\S]*2026-10-20 \(time zone Europe\/Berlin\)[\s\S]*2 pages/
        ),
      },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AQIDBA==' } },
    ]);
  });

  it('sends the key and the reasoning effort when they are set', async () => {
    const { provider, fetchMock, requests } = providerAnswering(
      [completion(JSON.stringify(ANSWER))],
      { apiKey: 'secret', reasoningEffort: 'none' }
    );

    await provider.analyze(input([jpegFile([1])]));

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret',
    });
    expect(requests()[0]).toMatchObject({ reasoning_effort: 'none' });
  });

  it('renders a PDF into pages first', async () => {
    const { provider, renderer, requests } = providerAnswering([
      completion(JSON.stringify(ANSWER)),
    ]);
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const signal = new AbortController().signal;

    await provider.analyze(input([{ mimeType: 'application/pdf', bytes: pdf }], { signal }));

    expect(renderer.render).toHaveBeenCalledWith(pdf, signal);
    expect(requests()[0].messages[1].content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,UERGcGFnZQ==' },
    });
  });

  it('asks once more with the error when the answer has the wrong shape (SPEC §7.4)', async () => {
    const wrong = { ...ANSWER, summary: 42 };
    const { provider, requests } = providerAnswering([
      completion(JSON.stringify(wrong)),
      completion(JSON.stringify(ANSWER)),
    ]);
    const checkShape = jest.fn((result: unknown) =>
      (result as { summary: unknown }).summary === 42 ? '✖ summary: expected string' : null
    );

    const output = await provider.analyze(input([jpegFile([1])], { checkShape }));

    expect(output.result).toEqual(ANSWER);
    expect(output.usage).toEqual({ inputTokens: 2400, outputTokens: 600 });
    const retry = requests()[1].messages;
    expect(retry).toHaveLength(4);
    expect(retry[2]).toEqual({ role: 'assistant', content: JSON.stringify(wrong) });
    expect(retry[3]).toEqual({
      role: 'user',
      content: expect.stringContaining('✖ summary: expected string'),
    });
  });

  it('asks only once when the answer fits', async () => {
    const { provider, fetchMock } = providerAnswering([completion(JSON.stringify(ANSWER))]);

    await provider.analyze(input([jpegFile([1])], { checkShape: () => null }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries an answer that is not JSON, and gives up after the second', async () => {
    const recovered = providerAnswering([
      completion('{"title": '),
      completion(JSON.stringify(ANSWER)),
    ]);
    await expect(recovered.provider.analyze(input([jpegFile([1])]))).resolves.toMatchObject({
      result: ANSWER,
    });

    const broken = providerAnswering([completion('not json'), completion('still not json')]);
    await expect(broken.provider.analyze(input([jpegFile([1])]))).rejects.toMatchObject({
      code: 'analysis_failed',
    });
  });

  it.each([
    ['the network fails', new TypeError('fetch failed'), 'unavailable'],
    ['the model server fails', new Response('overloaded', { status: 503 }), 'unavailable'],
    ['the answer has no message', Response.json({ choices: [] }), 'unavailable'],
    [
      'the answer runs out of tokens',
      completion('{"tit', {
        choices: [{ message: { content: '{"tit' }, finish_reason: 'length' }],
      }),
      'analysis_failed',
    ],
  ])('fails when %s', async (_case, response, code) => {
    const { provider } = providerAnswering([response]);

    const failure = await provider.analyze(input([jpegFile([1])])).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LlmProviderError);
    expect(failure).toMatchObject({ code });
  });

  it('rethrows when the request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { provider } = providerAnswering([new DOMException('Aborted', 'AbortError')]);

    await expect(
      provider.analyze(input([jpegFile([1])], { signal: controller.signal }))
    ).rejects.toThrow('Aborted');
  });
});
