import { resetFakeCalendar } from './fake-calendar';
import { resetFakeNotifications } from './fake-notifications';

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

// Every test runs without notifications, as on web, so that screens with deadlines and the
// reminder sync after their changes behave the same everywhere. Reminder tests turn them on through
// `fakeNotifications` from `@/test/fake-notifications`.
jest.mock('@/features/reminders/notifications', () =>
  jest.requireActual('@/test/fake-notifications')
);
beforeEach(() => resetFakeNotifications());

// Likewise without a calendar, so that «Add to calendar» shows only where a test turns it on
// through `fakeCalendar` from `@/test/fake-calendar`.
jest.mock('@/features/deadlines/calendar', () => jest.requireActual('@/test/fake-calendar'));
beforeEach(() => resetFakeCalendar());
