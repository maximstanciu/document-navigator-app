import { File } from 'expo-file-system';

/** A file on the device to send in `multipart/form-data`. */
export type UploadFile = { uri: string; name: string; type: string };

/**
 * Since SDK 58 the global `fetch` on Android and iOS is `expo/fetch`, which rejects React Native's
 * `{ uri, name, type }` parts («Unsupported FormDataPart implementation»). It takes a `Blob`, and an
 * `expo-file-system` `File` is one: its type comes from the extension (`.jpg`, `.pdf`). `fetch`
 * reads each part into memory while it builds the body, so a 20 MB PDF (CAP-7) is held there once.
 */
export async function appendUploadFile(form: FormData, field: string, file: UploadFile) {
  form.append(field, new File(file.uri), file.name);
}
