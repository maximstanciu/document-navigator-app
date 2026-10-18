/** @jest-environment node */
import { PDFDocument } from 'pdf-lib';

import { minimalPdf } from '../testing/analyze-request';
import { inspectPdf } from './inspect-pdf';

async function pdfLibDocument(pages: number) {
  const document = await PDFDocument.create();
  for (let i = 0; i < pages; i++) document.addPage();
  // pdf-lib writes object streams and a cross-reference stream, like most modern PDFs.
  return document.save();
}

describe('inspectPdf', () => {
  beforeEach(() => {
    // pdf-lib reports skipped objects of damaged files on the console.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts the pages of a plain PDF', async () => {
    await expect(inspectPdf(minimalPdf({ pages: 3 }))).resolves.toEqual({
      kind: 'ok',
      pageCount: 3,
    });
  });

  it('counts the pages of a PDF with object streams', async () => {
    await expect(inspectPdf(await pdfLibDocument(31))).resolves.toEqual({
      kind: 'ok',
      pageCount: 31,
    });
  });

  it('counts the pages that exist, not the declared /Count', async () => {
    const text = new TextDecoder()
      .decode(minimalPdf({ pages: 2 }))
      .replace('/Count 2', '/Count 500');
    await expect(inspectPdf(new TextEncoder().encode(text))).resolves.toEqual({
      kind: 'ok',
      pageCount: 2,
    });
  });

  it('reports an encrypted PDF', async () => {
    await expect(inspectPdf(minimalPdf({ pages: 2, encrypted: true }))).resolves.toEqual({
      kind: 'encrypted',
    });
  });

  it.each([
    ['empty bytes', new Uint8Array(0)],
    ['a JPEG', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
    ['only a header', new TextEncoder().encode('%PDF-1.7\n')],
    ['a header and garbage', new TextEncoder().encode(`%PDF-1.7\n${'x7 Q] <<'.repeat(500)}`)],
  ])('reports %s as invalid', async (_label, bytes) => {
    await expect(inspectPdf(bytes)).resolves.toEqual({ kind: 'invalid' });
  });

  it('reports a truncated PDF as invalid', async () => {
    const bytes = await pdfLibDocument(5);
    await expect(inspectPdf(bytes.slice(0, bytes.length / 2))).resolves.toEqual({
      kind: 'invalid',
    });
  });
});
