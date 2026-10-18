import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { capturedFileSize } from '@/lib/files/page-files';

import { FILE_PICKER_TYPES, type PickedFile } from './picked-files';

// Adapter over the system pickers (CAP-3): photos with expo-image-picker, files with
// expo-document-picker. Neither asks for a permission: Android's photo picker and iOS's PHPicker run
// outside the app. Both work on web too (CAP-10). What comes back is checked by checkPickedFiles().

export type PickResult =
  /** Files in the picker's cache, in the order they were selected. */
  | { status: 'picked'; files: PickedFile[] }
  | { status: 'cancelled' }
  /** The picker didn't open or couldn't hand over the files. */
  | { status: 'failed' }
  /** A picker is already open; the extra call is ignored. */
  | { status: 'busy' };

let picking = false;

async function pickOnce(pick: () => Promise<PickedFile[] | null>): Promise<PickResult> {
  // A quick second tap must not open another picker: on iOS the document picker rejects it.
  if (picking) return { status: 'busy' };
  picking = true;
  try {
    const files = await pick();
    return files?.length ? { status: 'picked', files } : { status: 'cancelled' };
  } catch {
    return { status: 'failed' };
  } finally {
    picking = false;
  }
}

/** One or more photos from the gallery: the pages of one document. */
export function pickPhotos({ maxPages }: { maxPages: number }): Promise<PickResult> {
  return pickOnce(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: maxPages,
      // Pages come in the order they were tapped (iOS 15+; Android keeps it by default).
      orderedSelection: true,
    });
    if (result.canceled) return null;
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      size: asset.fileSize ?? capturedFileSize(asset.uri),
    }));
  });
}

/** One PDF or image from the device's files (CAP-3). */
export function pickFile(): Promise<PickResult> {
  return pickOnce(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: FILE_PICKER_TYPES,
      multiple: false,
      // The review screen and the draft read the file from the cache (Android and iOS).
      copyToCacheDirectory: true,
      // Web only: don't read a file of up to 20 MB into a base64 string nobody uses.
      base64: false,
    });
    if (result.canceled) return null;
    return result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? capturedFileSize(asset.uri),
    }));
  });
}
