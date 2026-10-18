// Test-only Jest environment: the app's usual one, plus `setTimeZone()` from `@/test/time-zone`.
// A test can't change the time zone itself: its `process.env` is a copy. This environment runs in
// the worker's real process, where setting TZ moves `Date` to that zone, DST rules included. The
// worker's zone is restored after the test file. Opt in per file:
// /** @jest-environment ./src/test/time-zone-environment.js */
const { TestEnvironment } = require('jest-expo/src/preset/nativeEnvironment');

class TimeZoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.initialTimeZone = process.env.TZ;
    this.global.__setTimeZone = (timeZone) => {
      process.env.TZ = timeZone;
    };
  }

  async teardown() {
    if (this.initialTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = this.initialTimeZone;
    await super.teardown();
  }
}

module.exports = TimeZoneEnvironment;
