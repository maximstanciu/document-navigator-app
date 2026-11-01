// The app config is app.json; this file only adjusts it to the build's environment
// (https://docs.expo.dev/workflow/configuration/#dynamic-configuration).
//
// A build pointed at a server over plain HTTP (EXPO_PUBLIC_API_URL=http://…: the self-hosted
// backend on the local network, deploy/README.md) must allow cleartext traffic on Android, which
// release builds block since Android 9. A build for an HTTPS server keeps it blocked.
module.exports = ({ config }) => {
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
};
