#!/usr/bin/env node
// Runs eas-cli with the public app values from .env in its environment.
//
//   npm run eas -- build:list --platform ios
//
// Why: eas-cli evaluates app.config.ts with EXPO_NO_DOTENV=1 for every command, and the config
// refuses to evaluate without EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see the
// invariant in docs/PRD-changelog.md). For `update` and `build` eas-cli also loads the EAS
// environment variables, which scripts/setup.mjs env keeps equal to .env; this wrapper covers the
// read-only commands and any session that calls eas-cli by hand.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** The committed .env as an object. Values are public; the file is written by scripts/setup.mjs env. */
export function dotenv() {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, '.env'), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

/** Environment for any eas-cli call: the process env plus .env, never the other way round. */
export function easEnv(extra = {}) {
  return { ...dotenv(), ...process.env, ...extra };
}

/** Spawns `npx eas-cli@latest <args>` with that environment, inheriting stdio. Returns the exit status. */
export function eas(args, extra = {}) {
  const r = spawnSync('npx', ['eas-cli@latest', ...args], { cwd: ROOT, stdio: 'inherit', env: easEnv(extra) });
  return r.status ?? 1;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  process.exit(eas(process.argv.slice(2)));
}
