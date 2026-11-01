// The TestFlight build never expires: the refresh is decided from Apple's state every day, so a
// failed run is retried until it succeeds, long before Apple's 90 days run out. See scripts/refresh.mjs.
import { describe, expect, it } from 'vitest';

import {
  ALARM_AFTER_DAYS,
  DAY_MS,
  GITHUB_SCHEDULE_IDLE_DAYS,
  REFRESH_AFTER_DAYS,
  TESTFLIGHT_EXPIRY_DAYS,
  isLive,
  refreshDecision,
} from '../scripts/refresh.mjs';
import { EXPO_DOCTOR, GATE_ENV } from '../scripts/doctor.mjs';

const NOW = Date.parse('2026-11-01T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();
const build = (age: number, over: Record<string, unknown> = {}) => ({
  version: '10',
  appVersion: '1.3.0',
  processingState: 'VALID',
  uploaded: daysAgo(age),
  expired: false,
  ...over,
});

describe('the numbers keep the invariant', () => {
  it('leaves at least a month of daily retries before Apple expires the build', () => {
    expect(TESTFLIGHT_EXPIRY_DAYS - REFRESH_AFTER_DAYS).toBeGreaterThanOrEqual(30);
  });
  it('commits often enough that GitHub never disables the schedule', () => {
    expect(REFRESH_AFTER_DAYS).toBeLessThan(GITHUB_SCHEDULE_IDLE_DAYS - 14);
  });
  it('raises the alarm after the refresh is due and well before expiry', () => {
    expect(ALARM_AFTER_DAYS).toBeGreaterThan(REFRESH_AFTER_DAYS);
    expect(TESTFLIGHT_EXPIRY_DAYS - ALARM_AFTER_DAYS).toBeGreaterThanOrEqual(30);
  });
});

describe('refreshDecision', () => {
  it('waits while the newest build is younger than the threshold', () => {
    const d = refreshDecision([build(REFRESH_AFTER_DAYS - 1)], NOW);
    expect(d.due).toBe(false);
  });

  it('is due from the threshold on, and stays due every day after a failed run', () => {
    for (let age = REFRESH_AFTER_DAYS; age < TESTFLIGHT_EXPIRY_DAYS; age++) {
      expect(refreshDecision([build(age)], NOW).due).toBe(true);
    }
  });

  it('counts the newest live build, so any native ship resets the clock', () => {
    const d = refreshDecision([build(80, { version: '9' }), build(3, { version: '10' })], NOW);
    expect(d.due).toBe(false);
    expect(d.newest?.version).toBe('10');
  });

  it('is due with no builds at all, and alarms', () => {
    expect(refreshDecision([], NOW)).toMatchObject({ due: true, alarm: true });
    expect(refreshDecision(undefined as never, NOW)).toMatchObject({ due: true, alarm: true });
  });

  it('ignores builds Apple rejected or expired: they cover nobody', () => {
    for (const over of [{ processingState: 'FAILED' }, { processingState: 'INVALID' }, { expired: true }, { uploaded: null }]) {
      expect(refreshDecision([build(2, over), build(40)], NOW).due).toBe(true);
    }
  });

  it('treats a build still processing as a ship in flight for a day, then not', () => {
    expect(refreshDecision([build(0.2, { processingState: 'PROCESSING' }), build(40)], NOW).due).toBe(false);
    expect(refreshDecision([build(2, { processingState: 'PROCESSING' }), build(40)], NOW).due).toBe(true);
  });

  it('never counts a build past 90 days, even if Apple has not flagged it yet', () => {
    expect(isLive(build(TESTFLIGHT_EXPIRY_DAYS), NOW)).toBe(false);
    expect(refreshDecision([build(TESTFLIGHT_EXPIRY_DAYS + 5)], NOW)).toMatchObject({ due: true, alarm: true });
  });

  it('alarms once the refresh has been failing for weeks', () => {
    expect(refreshDecision([build(ALARM_AFTER_DAYS - 1)], NOW).alarm).toBe(false);
    expect(refreshDecision([build(ALARM_AFTER_DAYS)], NOW).alarm).toBe(true);
  });
});

describe('the gates check the tree, never the world', () => {
  it("leaves expo-doctor's SDK patch-release match out of the gate (it killed the first refresh)", () => {
    expect(GATE_ENV.EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK).toBe('1');
    expect(GATE_ENV.EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS).toBe('1');
  });
  it('runs a pinned expo-doctor, so a new release cannot add a check overnight', () => {
    expect(EXPO_DOCTOR).toMatch(/^expo-doctor@\d+\.\d+\.\d+$/);
  });
});
