const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // Metro handles CSS imports (web styles); Jest can't parse them. Must come before `@/`.
    '\\.css$': '<rootDir>/src/test/style-mock.js',
    // The preset's derived `^@/(.*)$` would otherwise win over this more specific alias.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    // Keep the preset's mappers, including the `@/` aliases it derives from tsconfig paths.
    ...expoPreset.moduleNameMapper,
  },
  // The formatjs Intl polyfills ship as ES modules; let babel transform them like the preset's list.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.startsWith('/node_modules/(?!(')
      ? pattern.replace('/node_modules/(?!(', '/node_modules/(?!(@formatjs|')
      : pattern
  ),
  // Every test runs with the app's i18n setup (polyfills included) in English, and with mocks for
  // native libraries that have none of their own.
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup-i18n.ts',
    '<rootDir>/src/test/setup-native-modules.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/test/**', '!src/app/**'],
};
