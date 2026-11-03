// The app config is app.json; this file only adjusts it to the build's environment
// (https://docs.expo.dev/workflow/configuration/#dynamic-configuration).
const fs = require('node:fs');
const path = require('node:path');

// A build pointed at a server over plain HTTP (EXPO_PUBLIC_API_URL=http://…: the self-hosted
// backend on the local network, deploy/README.md) must allow cleartext traffic on Android, which
// release builds block since Android 9. A build for an HTTPS server keeps it blocked.
function withCleartextForHttpApi(config) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  if (!apiUrl.startsWith('http://')) return config;
  return {
    ...config,
    plugins: config.plugins.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
        ? [
            plugin[0],
            { ...plugin[1], android: { ...plugin[1].android, usesCleartextTraffic: true } },
          ]
        : plugin
    ),
  };
}

// The push about a finished analysis (ANL-12) reaches Android through FCM, which needs the Firebase
// project's google-services.json: from the EAS file variable GOOGLE_SERVICES_JSON on EAS Build, or
// at the project root for a local build. Without it the build gets no push token and the result
// comes by polling; prebuild fails on a googleServicesFile that doesn't exist, so it is left out.
function withGoogleServicesFile(config) {
  const file = process.env.GOOGLE_SERVICES_JSON ?? path.join(__dirname, 'google-services.json');
  if (!fs.existsSync(file)) return config;
  return { ...config, android: { ...config.android, googleServicesFile: file } };
}

module.exports = ({ config }) => withGoogleServicesFile(withCleartextForHttpApi(config));
