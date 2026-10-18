import type { UploadFile } from './upload-file';

export type { UploadFile };

/**
 * On web the pages are blob or data URIs kept in memory (`src/lib/files/page-files.web.ts`), and the
 * browser's `FormData` wants the bytes: read the URI into a Blob first.
 */
export async function appendUploadFile(form: FormData, field: string, file: UploadFile) {
  const blob = await (await fetch(file.uri)).blob();
  form.append(field, new Blob([blob], { type: file.type }), file.name);
}
