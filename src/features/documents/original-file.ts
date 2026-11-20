import { File } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import type { DocumentDetail } from './types';

// Adapter for the files of the original (DET-7): the rest of the app sees these functions, and
// tests mock this module. The web stub is original-file.web.ts.

/** A page file of a document, or its PDF. */
export type OriginalFile = {
  uri: string;
  mimeType: DocumentDetail['mimeType'];
  /** The document's title, which the viewer shows where the platform has room for one. */
  title: string;
};

/**
 * Shows the file in the system viewer: on Android the app that opens this type (or «Open with»),
 * on iOS Quick Look. Both zoom, and Quick Look can save it too. With no viewer on the device, the
 * share sheet instead. Resolves once the viewer is up, not when it closes.
 */
export async function openOriginalFile(file: OriginalFile): Promise<void> {
  const target = new File(file.uri);
  if (await File.canPreview(target, { mimeType: file.mimeType })) {
    await File.preview(target, { mimeType: file.mimeType, title: file.title });
  } else {
    await shareOriginalFile(file, file.title);
  }
}

/**
 * The share sheet with the file, to save it (Files, Drive) or send it. The file is shared where it
 * is, never copied, so deleting the document leaves nothing behind (STO-6). Android needs the type
 * for the intent; iOS takes it from the extension, and expo-sharing would link the file under a
 * second name in the cache when the type's own extension differs (`.jpg` against `jpeg`).
 */
export async function shareOriginalFile(file: OriginalFile, dialogTitle: string): Promise<void> {
  if (!(await isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await shareAsync(file.uri, {
    dialogTitle,
    ...(process.env.EXPO_OS === 'android' && { mimeType: file.mimeType }),
  });
}
