import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { PickedFile } from './picked-files';

// Adapter over files other apps share into the app (CAP-11): Android's «Share» menu through
// expo-sharing (its config plugin in app.json lists the formats). The OS hands over content:// URIs;
// expo-sharing copies them into its own cache folder, which clearSharedPayloads() empties. So the
// files move into the app's folder first and the share is cleared at once: it is taken only once.
// What comes back is checked by checkSharedFiles().

export type SharedFilesResult =
  /** Files in the app's cache, in the order the other app sent them. */
  | { status: 'shared'; files: PickedFile[] }
  /** Nothing is shared, or the share was taken already. */
  | { status: 'none' }
  /** A shared file couldn't be read. */
  | { status: 'failed' };

/** Holds the files of the latest share only; the review copies them into the document (CAP-5). */
const SHARED_FOLDER = 'shared-files';

/** `File.toURI()` on Android gives `file:/data/…`; the app's other URIs are `file:///data/…`. */
function fileUri(uri: string): string {
  return uri.replace(/^file:\/(?!\/)/, 'file:///');
}

function extensionOf(name: string | null): string {
  return /\.[a-z0-9]{1,8}$/i.exec(name ?? '')?.[0].toLowerCase() ?? '';
}

async function takeResolved(): Promise<SharedFilesResult> {
  const payloads = await Sharing.getResolvedSharedPayloadsAsync();
  const folder = new Directory(Paths.cache, SHARED_FOLDER);
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true, idempotent: true });

  const files: PickedFile[] = [];
  for (const [index, payload] of payloads.entries()) {
    const isFile = payload.contentType !== 'text' && payload.contentType !== 'website';
    if (!isFile || !payload.contentUri) {
      // Text or a link: checkSharedFiles() turns it down with the other formats.
      files.push({
        uri: payload.value ?? '',
        name: null,
        mimeType: payload.mimeType ?? null,
        size: null,
      });
      continue;
    }
    const source = new File(fileUri(payload.contentUri));
    // expo-sharing leaves no file when the other app's content:// URI can't be read.
    if (!source.exists) return { status: 'failed' };
    // Its own name, not the original: that one is shown, and may hold any characters.
    const target = new File(folder, `${index + 1}${extensionOf(payload.originalName)}`);
    await source.move(target);
    files.push({
      uri: target.uri,
      name: payload.originalName,
      mimeType: payload.contentMimeType ?? payload.mimeType ?? null,
      size: payload.contentSize ?? (target.size || null),
    });
  }
  return files.length > 0 ? { status: 'shared', files } : { status: 'failed' };
}

let taking: Promise<SharedFilesResult> | null = null;

/**
 * Takes the files shared into the app, once: a second call gets `none`, and a call while the
 * first one runs shares its result.
 */
export function takeSharedFiles(): Promise<SharedFilesResult> {
  if (taking) return taking;
  if (Sharing.getSharedPayloads().length === 0) return Promise.resolve({ status: 'none' });
  taking = takeResolved()
    .catch((): SharedFilesResult => ({ status: 'failed' }))
    .finally(() => {
      Sharing.clearSharedPayloads();
      taking = null;
    });
  return taking;
}
