// When the TestFlight build must be rebuilt, decided from what Apple has, never from the calendar.
//
// The invariant: the family always has a TestFlight build that has not expired. Apple expires a
// build 90 days after upload. The guard (.github/workflows/testflight-refresh.yml) runs every day,
// asks App Store Connect for the newest live build and rebuilds once it is REFRESH_AFTER_DAYS old.
// A run that fails for any reason (Expo released patches, EAS or Apple had a bad day, a network
// blip outlived the in-run retries) is simply tried again the next day, because the state it
// reads has not changed: TESTFLIGHT_EXPIRY_DAYS - REFRESH_AFTER_DAYS daily attempts before
// anything expires. Any native ship from ship.yml resets the clock the same way.
//
// Learned 2026-11-01: the first monthly refresh (a cron on the 1st that built once) died at
// expo-doctor because Expo had published SDK patch releases since the last push. Nothing retried
// it; the next attempt would have been a month later. tests/refresh.test.ts holds these numbers.
//
// Pure: no I/O, so the tests run it under Node. scripts/ship.mjs refresh does the asking.

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Apple's TestFlight limit: a build stops installing 90 days after upload. */
export const TESTFLIGHT_EXPIRY_DAYS = 90;
/** Rebuild once the newest live build is this old: about monthly, leaving 62 daily retries. */
export const REFRESH_AFTER_DAYS = 28;
/** GitHub disables scheduled workflows in a public repository after 60 days without a commit. The refresh's changelog commit is that activity. */
export const GITHUB_SCHEDULE_IDLE_DAYS = 60;
/** From here on every run says loudly that the refresh has been failing (a red run alone also emails). */
export const ALARM_AFTER_DAYS = 45;
/** A build still processing counts as live for a day (a ship in flight); after that Apple is stuck and it does not. */
export const PROCESSING_GRACE_DAYS = 1;

/**
 * Whether a build still keeps the family covered. Builds come from scripts/asc.mjs `builds()`:
 * { version, appVersion, processingState, uploaded (ISO), expired }.
 */
export function isLive(build, now) {
  if (!build?.uploaded || build.expired) return false;
  const age = (now - Date.parse(build.uploaded)) / DAY_MS;
  if (!(age >= -1) || age >= TESTFLIGHT_EXPIRY_DAYS) return false;
  if (build.processingState === 'VALID') return true;
  if (build.processingState === 'PROCESSING') return age < PROCESSING_GRACE_DAYS;
  return false; // FAILED, INVALID, anything Apple invents later
}

/**
 * The decision. `now` is a millisecond timestamp.
 * Returns { due, alarm, age (whole days, null without a live build), daysLeft, newest, reason }.
 */
export function refreshDecision(builds, now) {
  const live = (builds ?? []).filter((b) => isLive(b, now)).sort((a, b) => Date.parse(b.uploaded) - Date.parse(a.uploaded));
  const newest = live[0] ?? null;
  if (!newest) {
    return { due: true, alarm: true, age: null, daysLeft: 0, newest: null, reason: 'Apple has no live build: the family has nothing that installs' };
  }
  const age = Math.floor((now - Date.parse(newest.uploaded)) / DAY_MS);
  const daysLeft = TESTFLIGHT_EXPIRY_DAYS - age;
  const label = `${newest.appVersion ?? '?'} (build ${newest.version})`;
  if (age < REFRESH_AFTER_DAYS) {
    return { due: false, alarm: false, age, daysLeft, newest, reason: `${label} is ${age} days old; the refresh is due at ${REFRESH_AFTER_DAYS}` };
  }
  return {
    due: true,
    alarm: age >= ALARM_AFTER_DAYS,
    age,
    daysLeft,
    newest,
    reason: `${label} is ${age} days old, ${daysLeft} days before TestFlight expires it`,
  };
}
