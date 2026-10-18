import { File } from 'expo-file-system';

import { appendUploadFile } from './upload-file';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));

describe('appendUploadFile (native)', () => {
  // `expo/fetch`, the global `fetch` since SDK 58, rejects React Native's `{ uri, name, type }`
  // parts; on the device every analysis then failed before the request left (smoke test, 4.1).
  it('appends the page as an expo-file-system File under its neutral name', async () => {
    const form = new FormData();
    // Jest's FormData is Node's, which wants a real Blob: only the call matters here.
    const append = jest.spyOn(form, 'append').mockImplementation(() => {});
    const uri = 'file:///data/app/files/documents/doc-1/3fda90b7.jpg';

    await appendUploadFile(form, 'files', { uri, name: 'page-1.jpg', type: 'image/jpeg' });

    expect(append).toHaveBeenCalledTimes(1);
    const [field, value, fileName] = append.mock.calls[0];
    expect(field).toBe('files');
    expect(value).toBeInstanceOf(File);
    expect((value as unknown as File).uri).toBe(uri);
    expect(fileName).toBe('page-1.jpg');
  });
});
