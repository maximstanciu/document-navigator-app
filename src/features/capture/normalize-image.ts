import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { capturedFileSize } from '@/lib/files/page-files';

// Adapter over expo-image-manipulator (CAP-4). Every image page (scan, photo or image file) is
// uploaded as a JPEG whose long side is at most PAGE_MAX_SIDE: enough for the model to read small
// print, and a page weighs about 300–600 KB instead of several megabytes.

export const PAGE_MAX_SIDE = 2048;
export const PAGE_JPEG_QUALITY = 0.8;

export type NormalizedImage = {
  /** A new JPEG in the cache directory. */
  uri: string;
  width: number;
  height: number;
  /** Bytes; `null` on web, where the size of a blob URL can't be read synchronously. */
  size: number | null;
};

/**
 * Re-encodes an image (JPEG, PNG or HEIC) as a JPEG that fits PAGE_MAX_SIDE, keeping the aspect
 * ratio. The system decoders apply the EXIF orientation, so the page comes out upright. Rejects when
 * the image can't be decoded.
 */
export async function normalizeImage(uri: string): Promise<NormalizedImage> {
  // Downsampled while decoding: a 50 MP photo is never held in memory at full size.
  const context = ImageManipulator.manipulate(uri, {
    maxWidth: PAGE_MAX_SIDE,
    maxHeight: PAGE_MAX_SIDE,
  });
  try {
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: PAGE_JPEG_QUALITY,
      });
      return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        size: capturedFileSize(result.uri),
      };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
