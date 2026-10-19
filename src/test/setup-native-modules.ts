// Native libraries that ship no Jest mock. Tests of features replace our adapter instead
// (`jest.mock('@/features/capture/scanner')`); this only lets modules that import the library load.
jest.mock('react-native-document-scanner-plugin', () => ({
  __esModule: true,
  default: { scanDocument: jest.fn() },
  ResponseType: { Base64: 'base64', ImageFilePath: 'imageFilePath' },
  ScanDocumentResponseStatus: { Success: 'success', Cancel: 'cancel' },
}));

// Reanimated and the Worklets it runs on have no UI runtime in Jest: every test uses the mocks they
// ship, as router tests do through expo-router/testing-library (src/test/jest-resolver.js lets the
// mocks load). Worklets then run on the JS thread, and work they hand back to React waits for a
// microtask.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
