import type { OriginalFile } from './original-file';

export type { OriginalFile } from './original-file';

// Web is a development preview only (SPEC §9): page files are in-memory blob URLs, which the
// browser can show in a tab or save, standing in for the system viewer and the share sheet.

export async function openOriginalFile(file: OriginalFile): Promise<void> {
  window.open(file.uri, '_blank');
}

export async function shareOriginalFile(file: OriginalFile, _dialogTitle: string): Promise<void> {
  const link = document.createElement('a');
  link.href = file.uri;
  link.download = `${file.title}.${file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`;
  link.click();
}
