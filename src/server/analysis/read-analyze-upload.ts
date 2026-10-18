import { z } from 'zod';

import {
  ANALYZE_FIELDS,
  IMAGE_MIME_TYPE,
  PDF_MIME_TYPE,
  type UploadMimeType,
} from '@/shared/analysis/contract';
import { isExplanationLocale, type ExplanationLocale } from '@/shared/explanation-locales';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { ApiFailure } from '../http/api-failure';
import { isFormFile, readMultipartForm, type FormFile } from '../http/multipart';
import type { LlmFile } from './llm-provider';

/** Room for the text fields and part headers on top of the files themselves. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export type AnalyzeUpload = {
  kind: 'pdf' | 'images';
  files: LlmFile[];
  locale: ExplanationLocale;
  today: string;
  timezone: string;
};

/**
 * Reads and checks the body of `POST /api/v1/analyze` (SPEC §7.2): one PDF or 1–30 JPEG pages
 * within `MAX_DOCUMENT_BYTES`, an explanation locale, the device's date and time zone. The number of
 * PDF pages is checked later, by `inspectPdf()`.
 *
 * Only the bytes leave this function: the parsed form and its files are dropped one by one as they
 * are read, so at most about one extra copy of the upload exists at a time (SPEC §7.1).
 */
export async function readAnalyzeUpload(request: Request): Promise<AnalyzeUpload> {
  const form = await readMultipartForm(request, MAX_DOCUMENT_BYTES + MULTIPART_OVERHEAD_BYTES);

  const locale = form.get(ANALYZE_FIELDS.locale);
  if (!isExplanationLocale(locale)) {
    throw invalid(`${ANALYZE_FIELDS.locale} is not a supported explanation locale.`);
  }
  const today = form.get(ANALYZE_FIELDS.today);
  if (!isCalendarDate(today)) {
    throw invalid(`${ANALYZE_FIELDS.today} must be a YYYY-MM-DD date.`);
  }
  const timezone = form.get(ANALYZE_FIELDS.timezone);
  if (!isTimeZone(timezone)) {
    throw invalid(`${ANALYZE_FIELDS.timezone} must be an IANA time zone.`);
  }

  const entries: (FormFile | null)[] = checkFiles(form.getAll(ANALYZE_FIELDS.files));
  form.delete(ANALYZE_FIELDS.files);
  const kind = entries[0]?.type === PDF_MIME_TYPE ? 'pdf' : 'images';
  const mimeType: UploadMimeType = kind === 'pdf' ? PDF_MIME_TYPE : IMAGE_MIME_TYPE;

  const files: LlmFile[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    entries[index] = null;
    const bytes = new Uint8Array(await entry.arrayBuffer());
    // The PDF header is checked by inspectPdf(), which answers `invalid_pdf` for a damaged file.
    if (kind === 'images' && !isJpeg(bytes)) {
      throw invalid(`File ${index + 1} is not a JPEG image.`);
    }
    files.push({ mimeType, bytes });
  }

  return { kind, files, locale, today, timezone };
}

/** Checks what can be checked without reading the files: their number, types and total size. */
function checkFiles(values: unknown[]): FormFile[] {
  if (values.length === 0) throw invalid(`No ${ANALYZE_FIELDS.files} in the request.`);
  if (!values.every(isFormFile))
    throw invalid(`Every ${ANALYZE_FIELDS.files} entry must be a file.`);

  const pdfs = values.filter((file) => file.type === PDF_MIME_TYPE).length;
  const images = values.filter((file) => file.type === IMAGE_MIME_TYPE).length;
  if (pdfs + images < values.length) {
    throw invalid(`Files must be ${PDF_MIME_TYPE} or ${IMAGE_MIME_TYPE}.`);
  }
  if (pdfs > 0 && values.length > 1) {
    throw invalid('Send either one PDF or images, not several PDFs or a mix.');
  }
  if (images > MAX_DOCUMENT_PAGES) {
    throw new ApiFailure('too_large', `More than ${MAX_DOCUMENT_PAGES} pages.`);
  }
  const totalBytes = values.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_DOCUMENT_BYTES) {
    throw new ApiFailure(
      'too_large',
      `Files are larger than ${MAX_DOCUMENT_BYTES} bytes in total.`
    );
  }
  return values;
}

function invalid(message: string) {
  return new ApiFailure('invalid_request', message);
}

const calendarDate = z.iso.date();

function isCalendarDate(value: unknown): value is string {
  return calendarDate.safeParse(value).success;
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isJpeg(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
