// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');
const testingLibrary = require('eslint-plugin-testing-library');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    files: ['**/*.test.{ts,tsx}'],
    ...testingLibrary.configs['flat/react'],
  },
  {
    ignores: ['dist/*', 'coverage/*', '.expo/*'],
  },
]);
