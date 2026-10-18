// Native libraries that ship no Jest mock. Tests of features replace our adapter instead
// (`jest.mock('@/features/capture/scanner')`); this only lets modules that import the library load.
jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: { scanDocument: jest.fn() },
  ResponseType: { Base64: 'base64', ImageFilePath: 'imageFilePath' },
  ScanDocumentResponseStatus: { Success: 'success', Cancel: 'cancel' },
}));
