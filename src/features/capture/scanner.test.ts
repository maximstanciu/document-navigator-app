import DocumentScanner, { ScanDocumentResponseStatus } from 'react-native-document-scanner-plugin';

import { scanDocument, UNAVAILABLE_CANCEL_MS } from './scanner';

const pluginScan = jest.mocked(DocumentScanner.scanDocument);
const { Success, Cancel } = ScanDocumentResponseStatus;

/** The plugin answers `response` after `ms` of wall-clock time. */
function pluginAnswers(response: Awaited<ReturnType<typeof pluginScan>>, ms = 5000) {
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValueOnce(1_000_000).mockReturnValueOnce(1_000_000 + ms);
  pluginScan.mockResolvedValueOnce(response);
}

afterEach(() => {
  jest.restoreAllMocks();
  pluginScan.mockReset();
});

describe('scanDocument (CAP-2)', () => {
  it('returns the page files in order and passes the page limit to the scanner', async () => {
    pluginAnswers({
      status: Success,
      scannedImages: ['file:///p1.jpg', 'file:///p2.jpg'],
    });

    expect(await scanDocument({ maxPages: 30 })).toEqual({
      status: 'scanned',
      pages: ['file:///p1.jpg', 'file:///p2.jpg'],
    });
    expect(pluginScan).toHaveBeenCalledWith({ maxNumDocuments: 30, responseType: 'imageFilePath' });
  });

  it('reports a cancel by the person', async () => {
    pluginAnswers({ status: Cancel, scannedImages: [] }, 4000);

    expect(await scanDocument({ maxPages: 30 })).toEqual({ status: 'cancelled' });
  });

  it('treats a cancel faster than a person could close the scanner as unavailable (CAP-9)', async () => {
    pluginAnswers({ status: Cancel, scannedImages: [] }, UNAVAILABLE_CANCEL_MS - 1);

    expect(await scanDocument({ maxPages: 30 })).toEqual({ status: 'unavailable' });
  });

  it('treats a scanner that fails to start as unavailable', async () => {
    pluginScan.mockRejectedValueOnce(new Error('No activity found'));

    expect(await scanDocument({ maxPages: 30 })).toEqual({ status: 'unavailable' });
  });

  it('rejects more pages than allowed, since the limit is not enforced everywhere (CAP-7)', async () => {
    pluginAnswers({ status: Success, scannedImages: ['a', 'b', 'c'] });

    expect(await scanDocument({ maxPages: 2 })).toEqual({ status: 'too_many_pages', pageCount: 3 });
  });

  it('ignores a second call while the scanner is open, then allows a new scan', async () => {
    let finish: (value: Awaited<ReturnType<typeof pluginScan>>) => void = () => {};
    pluginScan.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const first = scanDocument({ maxPages: 30 });
    expect(await scanDocument({ maxPages: 30 })).toEqual({ status: 'busy' });
    finish({ status: Success, scannedImages: ['file:///p1.jpg'] });
    expect(await first).toEqual({ status: 'scanned', pages: ['file:///p1.jpg'] });

    pluginAnswers({ status: Cancel, scannedImages: [] });
    expect(await scanDocument({ maxPages: 30 })).toEqual({ status: 'cancelled' });
    expect(pluginScan).toHaveBeenCalledTimes(2);
  });
});
