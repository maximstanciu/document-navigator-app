// Files shared into the app on Android (CAP-11, SPEC §9). A task that a share started keeps that
// SEND intent as its base: once the activity has finished (Back out of the app) or the process has
// died, opening the task from Recents starts it with the same SEND again, marked
// FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY. expo-sharing doesn't look at that flag and would hand the
// files over once more. MainActivity turns such a launch into a plain one, as from the launcher
// icon, before React Native and expo-sharing read the intent in `super.onCreate()`.
const { withMainActivity } = require('expo/config-plugins');

const MARKER = '// @generated share-history-guard (plugins/with-share-history-guard.js)';

const GUARD = `    ${MARKER}
    // A share replayed from Recents was taken already (CAP-11): start like the launcher icon.
    if ((intent.flags and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0 &&
        (intent.action == android.content.Intent.ACTION_SEND ||
            intent.action == android.content.Intent.ACTION_SEND_MULTIPLE)) {
      intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
          .addCategory(android.content.Intent.CATEGORY_LAUNCHER)
          .setPackage(packageName)
    }
`;

/**
 * MainActivity.kt with the guard right before `super.onCreate(`; unchanged when it is there already.
 * Throws when the template has no `super.onCreate(` line, so a changed template fails the prebuild
 * instead of silently losing the guard.
 */
function addShareHistoryGuard(contents) {
  if (contents.includes(MARKER)) return contents;
  const anchor = /^[ \t]*super\.onCreate\(/m;
  const match = anchor.exec(contents);
  if (!match) {
    throw new Error('with-share-history-guard: no `super.onCreate(` in MainActivity');
  }
  return contents.slice(0, match.index) + GUARD + contents.slice(match.index);
}

function withShareHistoryGuard(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-share-history-guard: MainActivity is expected in Kotlin');
    }
    mod.modResults.contents = addShareHistoryGuard(mod.modResults.contents);
    return mod;
  });
}

module.exports = withShareHistoryGuard;
module.exports.addShareHistoryGuard = addShareHistoryGuard;
