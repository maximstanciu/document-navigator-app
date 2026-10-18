import { PDFDocument, ParseSpeeds } from 'pdf-lib';

export type PdfInspection =
  { kind: 'ok'; pageCount: number } | { kind: 'encrypted' } | { kind: 'invalid' };

/**
 * Checks a PDF before the model sees it (D-4, CAP-8): counts its pages and spots encryption or
 * damage. Any encryption counts, including PDFs that open without a password (owner password
 * only): until the provider is chosen (task 0.3) we don't know whether it reads them.
 *
 * pdf-lib copies the streams while it parses, about one more file size in memory; the parsed
 * document is dropped when this returns, before the model is called (SPEC §7.1).
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, {
      // Parse an encrypted file to report it as encrypted rather than throw.
      ignoreEncryption: true,
      updateMetadata: false,
      // Don't yield between objects: it adds wall time and saves no CPU.
      parseSpeed: ParseSpeeds.Fastest,
    });
  } catch {
    return { kind: 'invalid' };
  }
  if (document.isEncrypted) return { kind: 'encrypted' };

  try {
    const pageCount = document.getPageCount();
    return pageCount > 0 ? { kind: 'ok', pageCount } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}
