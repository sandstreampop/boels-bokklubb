#!/usr/bin/env node
// Builds iOS on EAS and submits to TestFlight, non-interactively, from the environment secrets.
// Signing credentials already exist on EAS (created once by scripts/setup.mjs eas).
//
//   npm run build:ios                 native build, submit, wait for both (about 25 minutes)
//   npm run build:ios -- --no-wait    return as soon as the build is queued
//   npm run update                    JS-only change over the air to the production channel (about a minute)
//   npm run update -- --message "…"   custom message; default is the last commit subject
//   node scripts/ship.mjs submit      resubmit the latest finished build
//
// Use update for anything in app/, components/, lib/ and assets. Use build:ios when package.json
// gains a native module, app.json changes, or the Expo SDK moves: the runtime version is a
// fingerprint of the native project, so an update is only served to builds it matches.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eas } from './eas.mjs';

const need = ['EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID'].filter((n) => !process.env[n]);
if (need.length) {
  console.error(`Missing environment secrets: ${need.join(', ')}`);
  process.exit(1);
}

const keyPath = join(mkdtempSync(join(tmpdir(), 'asc-')), 'AuthKey.p8');
writeFileSync(keyPath, Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64'));

// Handed to eas-cli on top of process.env and the committed .env (see scripts/eas.mjs).
const env = {
  EXPO_ASC_API_KEY_PATH: keyPath,
  EXPO_ASC_KEY_ID: process.env.ASC_KEY_ID,
  EXPO_ASC_ISSUER_ID: process.env.ASC_ISSUER_ID,
  EXPO_APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  EXPO_APPLE_TEAM_TYPE: 'INDIVIDUAL',
  EAS_BUILD_NO_EXPO_GO_WARNING: 'true',
};

const [mode = 'build', ...rest] = process.argv.slice(2);
const lastCommit = () => {
  const r = spawnSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'update';
};
const easArgs =
  mode === 'submit'
    ? ['submit', '--platform', 'ios', '--profile', 'production', '--latest', '--non-interactive', ...rest]
    : mode === 'update'
      ? [
          'update',
          '--channel',
          'production',
          '--environment',
          'production',
          '--platform',
          'ios',
          '--non-interactive',
          ...(rest.includes('--message') ? [] : ['--message', lastCommit()]),
          ...rest,
        ]
      : ['build', '--platform', 'ios', '--profile', 'production', '--auto-submit', '--non-interactive', ...rest];

process.exit(eas(easArgs, env));
