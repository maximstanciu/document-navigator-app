// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');
const testingLibrary = require('eslint-plugin-testing-library');

// Architecture boundaries from AGENTS.md (plan task 1.7).
const SERVER_ONLY_FROM_API_ROUTES = {
  group: ['@/server', '@/server/*'],
  message: 'src/server is imported only from API routes (src/app/api/**/*+api.ts).',
};
const NO_REACT_NATIVE_OR_EXPO = {
  group: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    'react-native',
    'react-native/*',
    '@react-native/*',
    'expo',
    'expo/*',
    'expo-*',
    '@expo/*',
  ],
  message:
    'Runs outside the app (shared with the server / on Workers): no React, React Native or Expo.',
};

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    files: ['**/*.test.{ts,tsx}'],
    ...testingLibrary.configs['flat/react'],
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      // React Native Testing Library v14: fireEvent returns a promise like userEvent; await both.
      'testing-library/no-await-sync-events': 'off',
      'testing-library/await-async-events': ['error', { eventModule: ['fireEvent', 'userEvent'] }],
    },
  },
  {
    // App code may not reach into server code.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/app/api/**', 'src/server/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [SERVER_ONLY_FROM_API_ROUTES] }],
    },
  },
  {
    // Shared code is plain TypeScript used by both the app and the server.
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NO_REACT_NATIVE_OR_EXPO,
            {
              group: ['@/*', '!@/shared', '!@/shared/*'],
              message: 'src/shared imports only from src/shared.',
            },
          ],
        },
      ],
    },
  },
  {
    // Server code runs on EAS Hosting (Cloudflare Workers): no app code, no native modules.
    files: ['src/server/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              ...NO_REACT_NATIVE_OR_EXPO,
              group: [...NO_REACT_NATIVE_OR_EXPO.group, '!expo-server'],
            },
            {
              group: ['@/*', '!@/shared', '!@/shared/*', '!@/server', '!@/server/*'],
              message: 'src/server imports only from src/server and src/shared.',
            },
          ],
        },
      ],
    },
  },
  {
    // Features may depend on each other, never in a cycle.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
    },
  },
  {
    // Colors come from the theme (plan task 1.8); hex literals live only in src/constants/theme.ts.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/constants/theme.ts', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message: 'Use theme colors (useTheme, ThemedText, ThemedView), not hex literals.',
        },
      ],
    },
  },
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*'],
  },
]);
