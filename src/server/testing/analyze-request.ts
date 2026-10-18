import { ANALYZE_FIELDS, IMAGE_MIME_TYPE, PDF_MIME_TYPE } from '@/shared/analysis/contract';
import { API_HEADERS } from '@/shared/api-headers';

// Test helpers for the analyze route: requests the way the app sends them, and small synthetic
// files. Server tests can't import `@/test` (ESLint keeps src/server to itself and src/shared).

export const TEST_URL = 'https://docnavigator.test/api/v1/analyze';

export const CLIENT_HEADERS: Record<string, string> = {
  [API_HEADERS.deviceId]: '6f1c2a9e-3b7d-4c8e-9f0a-1b2c3d4e5f60',
  [API_HEADERS.appVersion]: '1.0.0',
  [API_HEADERS.platform]: 'android',
};

export const REQUEST_FIELDS: Record<string, string> = {
  [ANALYZE_FIELDS.locale]: 'ru',
  [ANALYZE_FIELDS.today]: '2026-10-18',
  [ANALYZE_FIELDS.timezone]: 'Europe/Berlin',
};

export type TestFile = { bytes: Uint8Array; type: string; name?: string };

export function jpeg(size = 1024): TestFile {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return { bytes, type: IMAGE_MIME_TYPE, name: 'page.jpg' };
}

export function pdf(bytes: Uint8Array): TestFile {
  return { bytes, type: PDF_MIME_TYPE, name: 'document.pdf' };
}

/** A `POST /api/v1/analyze` request with the given files; fields and headers can be overridden. */
export function analyzeRequest({
  files = [jpeg()],
  fields = {},
  headers = {},
}: {
  files?: (TestFile | string)[];
  fields?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
} = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ ...REQUEST_FIELDS, ...fields })) {
    if (value !== undefined) form.append(name, value);
  }
  for (const file of files) {
    form.append(
      ANALYZE_FIELDS.files,
      typeof file === 'string'
        ? file
        : new File([file.bytes as BlobPart], file.name ?? 'file', { type: file.type })
    );
  }
  return new Request(TEST_URL, {
    method: 'POST',
    body: form,
    headers: withoutUndefined({ ...CLIENT_HEADERS, ...headers }),
  });
}

function withoutUndefined(record: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

/**
 * A minimal PDF written by hand: `pages` empty pages, optionally with an `/Encrypt` dictionary in
 * the trailer (pdf-lib can't write encrypted files).
 */
export function minimalPdf({ pages = 1, encrypted = false } = {}): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] /Count ${pages} >>`,
    ...Array.from(
      { length: pages },
      () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'
    ),
  ];
  let trailerExtra = '';
  if (encrypted) {
    objects.push('<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4 /O <00> /U <00> >>');
    trailerExtra = ` /Encrypt ${objects.length} 0 R /ID [<01> <01>]`;
  }

  let text = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = text.length;
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\n`;
  text += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}
