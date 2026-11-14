/** @jest-environment node */
const appJson = require('../app.json');

const { addShareHistoryGuard } = require('./with-share-history-guard');

// The part of MainActivity.kt from the SDK 58 template that the guard depends on.
const MAIN_ACTIVITY = `package com.stanciu.docnavigator

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY)
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }
}
`;

describe('with-share-history-guard (CAP-11)', () => {
  it('turns a share replayed from Recents into a plain launch before super.onCreate', () => {
    const patched = addShareHistoryGuard(MAIN_ACTIVITY);
    // Before `super.onCreate()`, where React Native and expo-sharing read the intent.
    expect(patched.indexOf('FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY')).toBeLessThan(
      patched.indexOf('super.onCreate(null)')
    );
    expect(patched).toContain('intent.action == android.content.Intent.ACTION_SEND ||');
    expect(patched).toContain('intent.action == android.content.Intent.ACTION_SEND_MULTIPLE');
    expect(patched).toContain('android.content.Intent(android.content.Intent.ACTION_MAIN)');
    // Everything else stays as it was.
    expect(patched.replace(/ {4}\/\/ @generated share-history-guard[\s\S]*? {4}\}\n/, '')).toBe(
      MAIN_ACTIVITY
    );
  });

  it('adds the guard once when prebuild runs again', () => {
    const once = addShareHistoryGuard(MAIN_ACTIVITY);
    expect(addShareHistoryGuard(once)).toBe(once);
  });

  it('fails the prebuild when the template has no super.onCreate', () => {
    expect(() => addShareHistoryGuard('class MainActivity : ReactActivity() {}')).toThrow(
      'no `super.onCreate(`'
    );
  });

  it('runs together with expo-sharing in app.json', () => {
    const names = appJson.expo.plugins.map((plugin) =>
      Array.isArray(plugin) ? plugin[0] : plugin
    );
    expect(names).toContain('expo-sharing');
    expect(names).toContain('./plugins/with-share-history-guard');
  });
});
