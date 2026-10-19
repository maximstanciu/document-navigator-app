// Reanimated and the Worklets it runs on resolve to their web builds in Jest, where there is no
// native runtime; every other request goes through the jest-expo preset's resolver as before.
const reanimatedResolver = require('react-native-reanimated/jest/resolver');
const presetResolver = require(require('jest-expo/jest-preset').resolver);

/** @type {import('jest-resolve').SyncResolver} */
module.exports = (request, options) =>
  reanimatedResolver(request, {
    ...options,
    defaultResolver: (path, resolverOptions) =>
      presetResolver(path, { ...resolverOptions, defaultResolver: options.defaultResolver }),
  });
