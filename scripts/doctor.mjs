#!/usr/bin/env node
// expo-doctor, the way every gate runs it (scripts/preflight.mjs, check.yml, scripts/ship.mjs).
//
//   node scripts/doctor.mjs              the gate: everything about the tree, never Expo's release calendar
//   node scripts/doctor.mjs --versions   also "packages match the latest patch releases of the SDK" (ship.mjs, taking patches)
//
// Why the gate leaves the version match out (learned 2026-11-01): that check asks Expo's servers
// for the newest SDK patch releases, so it turns red whenever Expo publishes one, with no change in
// this repository. It killed the first TestFlight refresh and would have refused the next push.
// The tree is what the gate validates; the patch releases are taken automatically by every
// TestFlight refresh (scripts/ship.mjs takeExpoPatches), kept only when every gate passes with them.
// The rest of expo-doctor stays a gate: a missing native peer dependency crashes a TestFlight build.
//
// Pinned for the same reason: a new expo-doctor can add a check. Raise it with the SDK.

import { spawnSync } from 'node:child_process';

export const EXPO_DOCTOR = 'expo-doctor@1.21.5';
/** A network error reaching Expo is the world, not the tree. */
const BASE_ENV = { EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS: '1' };
export const GATE_ENV = { ...BASE_ENV, EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: '1' };

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Runs expo-doctor; returns the exit status. `versions` adds the SDK patch-release match. */
export function doctor({ versions = false } = {}) {
  const env = { ...process.env, ...(versions ? BASE_ENV : GATE_ENV) };
  if (versions) delete env.EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK;
  return spawnSync('npx', ['--yes', EXPO_DOCTOR], { cwd: ROOT, stdio: 'inherit', env }).status ?? 1;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  process.exit(doctor({ versions: process.argv.includes('--versions') }));
}
