import { File } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { openOriginalFile, shareOriginalFile } from './original-file';

jest.mock('expo-file-system', () => ({
  File: Object.assign(
    jest.fn((uri: string) => ({ uri })),
    { canPreview: jest.fn(), preview: jest.fn(async () => {}) }
  ),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

const canPreview = jest.mocked(File.canPreview);
const preview = jest.mocked(File.preview);
const available = jest.mocked(isAvailableAsync);
const sharing = jest.mocked(shareAsync);

const pdf = {
  uri: 'file:///data/app/files/documents/doc-1/p1.pdf',
  mimeType: 'application/pdf',
  title: 'Договор аренды',
} as const;

afterEach(() => jest.clearAllMocks());

describe('openOriginalFile (DET-7)', () => {
  it('shows the file in the system viewer, with its type and title', async () => {
    canPreview.mockResolvedValue(true);

    await openOriginalFile(pdf);

    expect(canPreview).toHaveBeenCalledWith({ uri: pdf.uri }, { mimeType: 'application/pdf' });
    expect(preview).toHaveBeenCalledWith(
      { uri: pdf.uri },
      { mimeType: 'application/pdf', title: 'Договор аренды' }
    );
    expect(sharing).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet when no app on the device views the file', async () => {
    canPreview.mockResolvedValue(false);

    await openOriginalFile(pdf);

    expect(preview).not.toHaveBeenCalled();
    expect(sharing).toHaveBeenCalledWith(
      pdf.uri,
      expect.objectContaining({ dialogTitle: 'Договор аренды' })
    );
  });
});

describe('shareOriginalFile (DET-7)', () => {
  it('shares the file where it is, under the given sheet title', async () => {
    await shareOriginalFile(pdf, 'Share');

    expect(sharing).toHaveBeenCalledWith(
      pdf.uri,
      expect.objectContaining({ dialogTitle: 'Share' })
    );
  });

  it('fails when the device cannot share, so the screen can say so', async () => {
    available.mockResolvedValueOnce(false);

    await expect(shareOriginalFile(pdf, 'Share')).rejects.toThrow('not available');
    expect(sharing).not.toHaveBeenCalled();
  });
});
