#!/usr/bin/env node
// Every gate, in one place, before anything is released. Three things run it:
//
//   .githooks/pre-push          every push to main (CI ships what lands there); installed by `npm install`
//                               through the `prepare` script, which points git at .githooks
//   scripts/ship.mjs            the manual escape hatches (update, build, web) refuse to ship without it
//   .github/workflows/check.yml the same gates as separate steps, which ship.yml needs before shipping
//
//   node scripts/preflight.mjs          typecheck, lint, tests, the phone-layout check, the changelog gate
//   node scripts/preflight.mjs --full   also expo-doctor and, when web/ changed since the last ship, the web check
//
// There is no flag to skip a gate: a release that cannot pass them is not released. Fix the cause.

import { spawnSync } from 'node:child_process';

import { ROOT, changesSince } from './changelog.mjs';

const full = process.argv.includes('--full');

const gates = [
  ['typecheck', 'npx', ['tsc', '--noEmit']],
  ['lint', 'npx', ['expo', 'lint']],
  ['tests (the machines keep their invariants)', 'npx', ['vitest', 'run']],
  ['the phone layout is unchanged', 'node', ['--no-warnings', '--experimental-strip-types', 'scripts/layout-check.mjs']],
  ['a changelog line for every change Boel or a relative sees', 'node', ['scripts/changelog.mjs', 'check']],
];
if (full) {
  gates.push(['expo-doctor', 'npx', ['expo-doctor']]);
  if (changesSince().web.length) gates.push(['the web version builds and shows its screens', 'node', ['scripts/web.mjs', 'check']]);
}

const t0 = Date.now();
for (const [name, cmd, cmdArgs] of gates) {
  console.log(`\n▶ preflight: ${name}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n✗ preflight failed at "${name}". Nothing is released until it passes.`);
    process.exit(r.status ?? 1);
  }
}
console.log(`\n✓ preflight: ${gates.length} gates passed in ${Math.round((Date.now() - t0) / 1000)} s`);
