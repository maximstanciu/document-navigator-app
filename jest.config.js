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
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/test/**', '!src/app/**'],
};
