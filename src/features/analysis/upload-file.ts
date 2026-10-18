/** A file on the device to send in `multipart/form-data`. */
export type UploadFile = { uri: string; name: string; type: string };

/**
 * React Native's `FormData` takes `{ uri, name, type }` and streams the file from disk itself, so a
 * 20 MB document is never read into JS memory. The DOM typings don't know that form, hence the cast.
 */
export async function appendUploadFile(form: FormData, field: string, file: UploadFile) {
  form.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
}
