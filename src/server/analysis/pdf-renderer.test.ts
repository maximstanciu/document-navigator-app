/** @jest-environment node */
import { LlmProviderError } from './llm-provider';
import { HttpPdfRenderer } from './pdf-renderer';

function rendererAnswering(response: Response | Error) {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const renderer = new HttpPdfRenderer({
    url: 'http://pdf-render:8080/',
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { renderer, fetchMock };
}

describe('HttpPdfRenderer', () => {
  it('posts the PDF and returns its pages', async () => {
    const { renderer, fetchMock } = rendererAnswering(Response.json({ pages: ['AAA', 'BBB'] }));
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    await expect(renderer.render(pdf)).resolves.toEqual(['AAA', 'BBB']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pdf-render:8080/render');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ['a file it cannot read', new Response('{}', { status: 422 }), 'invalid_pdf'],
    ['a failure', new Response('oops', { status: 500 }), 'unavailable'],
    ['the network fails', new TypeError('fetch failed'), 'unavailable'],
    ['no pages', Response.json({ pages: [] }), 'unavailable'],
    ['a body that is not JSON', new Response('<html>'), 'unavailable'],
  ])('fails on %s', async (_case, response, code) => {
    const { renderer } = rendererAnswering(response);

    const failure = await renderer.render(new Uint8Array(4)).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(LlmProviderError);
    expect(failure).toMatchObject({ code });
  });

  it('rethrows when the request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { renderer } = rendererAnswering(new DOMException('Aborted', 'AbortError'));

    await expect(renderer.render(new Uint8Array(4), controller.signal)).rejects.toThrow('Aborted');
  });
});
