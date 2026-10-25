#!/usr/bin/env node
// Builds iOS on EAS and submits to TestFlight, non-interactively, from the environment secrets.
// Signing credentials already exist on EAS (created once by scripts/setup.mjs eas).
//
//   npm run build:ios                 build, submit, wait for both
//   npm run build:ios -- --no-wait    return as soon as the build is queued
//   node scripts/ship.mjs submit      resubmit the latest finished build

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const need = ['EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID'].filter((n) => !process.env[n]);
if (need.length) {
  console.error(`Missing environment secrets: ${need.join(', ')}`);
  process.exit(1);
}

const keyPath = join(mkdtempSync(join(tmpdir(), 'asc-')), 'AuthKey.p8');
writeFileSync(keyPath, Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64'));

const env = {
  ...process.env,
  EXPO_ASC_API_KEY_PATH: keyPath,
  EXPO_ASC_KEY_ID: process.env.ASC_KEY_ID,
  EXPO_ASC_ISSUER_ID: process.env.ASC_ISSUER_ID,
  EXPO_APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  EXPO_APPLE_TEAM_TYPE: 'INDIVIDUAL',
  EAS_BUILD_NO_EXPO_GO_WARNING: 'true',
};

const [mode = 'build', ...rest] = process.argv.slice(2);
const eas =
  mode === 'submit'
    ? ['submit', '--platform', 'ios', '--profile', 'production', '--latest', '--non-interactive', ...rest]
    : ['build', '--platform', 'ios', '--profile', 'production', '--auto-submit', '--non-interactive', ...rest];

const r = spawnSync('npx', ['eas-cli@latest', ...eas], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
