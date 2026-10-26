#!/usr/bin/env node
// Ships the app: an over-the-air update or a native TestFlight build, with the changelog as the
// source of the message, the version and TestFlight's "What to Test". CI runs this on every push
// to main (.github/workflows/ship.yml); `npm run update` and `npm run build:ios` are the manual
// escape hatch and do exactly the same thing. See docs/PRD-changelog.md.
//
//   node scripts/ship.mjs auto              CI: decide update or build from the diff since the last ship, or do nothing
//   npm run update                          over-the-air update to the production channel (about a minute)
//   npm run build:ios                       native build, submit, wait, write "What to Test" (about 40 minutes)
//   npm run build:ios -- --no-wait          return once the build is queued; "What to Test" is then not written
//   node scripts/ship.mjs build --refresh   the monthly rebuild: adds "Monthly refresh, nothing new" when Unreleased is empty
//   node scripts/ship.mjs prove             only the bundle proof (check.yml runs this on every push)
//   node scripts/ship.mjs submit            resubmit the latest finished build
//   node scripts/ship.mjs web               the web version alone: deploy the feed function, build the page, changelog
//   node scripts/ship.mjs finish <build-id> a build that was queued but not waited for: wait, then write "What to Test"
//
// A Ship run that failed after "build … queued" must not be rerun from the Actions tab: the build
// exists and its changelog commit is on main. `auto` refuses when origin/main already carries a
// newer ship commit than the checkout; `finish` does the rest for that build.
//
// Every ship mode refuses to run when `## Unreleased` in docs/CHANGELOG.md is empty: writing the
// line is part of shipping. On success the Unreleased lines move into a dated section and that
// change is committed as `Changelog: …` and pushed, so the next run knows where the last ship was.
//
// Update, build or web? Anything in app/, components/, lib/ or assets is an update. package.json,
// package-lock.json, app.config.ts, eas.json or a migration means a native build (the runtime
// version is a fingerprint of the native project, so an update is only served to builds it
// matches), and so does `[native]` in the commit subject. Anything under web/ or
// supabase/functions/feed/ is the web version (docs/PRD-build-8.md): the function is deployed
// through the Management API, the page is built into web/dist and `web=true` is written to
// GITHUB_OUTPUT so ship.yml's deploy-pages job puts it on GitHub Pages. A push that changes both
// does both; a web-only push files its lines as `### Web (date)`.

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setWhatsNew, waitForProcessedBuild } from './asc.mjs';
import { ROOT, asPlainText, changesSince, hasWhatToTest, latestBuild, release, unreleased } from './changelog.mjs';
import { dotenv, eas, easEnv } from './eas.mjs';
import { deployFunction, migrate } from './supabase.mjs';

const args = process.argv.slice(2);
const [mode = 'build'] = args;
const flag = (name) => args.includes(`--${name}`);
const APP_CONFIG = join(ROOT, 'app.config.ts');
const REFRESH_LINE = '- Monthly refresh, nothing new.';

const log = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ---- secrets -------------------------------------------------------------------------------------

function needSecrets(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) fail(`Missing environment secrets: ${missing.join(', ')}`);
}

/** Apple credentials handed to eas-cli on top of process.env and the committed .env (see scripts/eas.mjs). */
function appleEnv() {
  needSecrets('EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID');
  const keyPath = join(mkdtempSync(join(tmpdir(), 'asc-')), 'AuthKey.p8');
  writeFileSync(keyPath, Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64'));
  return {
    EXPO_ASC_API_KEY_PATH: keyPath,
    EXPO_ASC_KEY_ID: process.env.ASC_KEY_ID,
    EXPO_ASC_ISSUER_ID: process.env.ASC_ISSUER_ID,
    EXPO_APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
    EXPO_APPLE_TEAM_TYPE: 'INDIVIDUAL',
    EAS_BUILD_NO_EXPO_GO_WARNING: 'true',
  };
}

// ---- helpers -------------------------------------------------------------------------------------

/** eas-cli with --json: the JSON from stdout, everything else shown to the terminal. `build:view` has no --non-interactive. */
function easJson(cliArgs, extra = {}, flags = ['--json', '--non-interactive']) {
  const r = spawnSync('npx', ['eas-cli@latest', ...cliArgs, ...flags], {
    cwd: ROOT,
    encoding: 'utf8',
    env: easEnv(extra),
    stdio: ['inherit', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) fail(`eas ${cliArgs[0]} failed (exit ${r.status}); see the output above`);
  const text = r.stdout.trim();
  try {
    return JSON.parse(text.slice(text.search(/[[{]/)));
  } catch {
    fail(`eas ${cliArgs[0]} printed no JSON:\n${text.slice(-800)}`);
  }
}

function git(...gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/** The version in app.config.ts, and a minor bump of it (1.0.0 → 1.1.0; major stays until Viktor says). */
function appVersion() {
  const m = /"version":\s*"(\d+)\.(\d+)\.(\d+)"/.exec(readFileSync(APP_CONFIG, 'utf8'));
  if (!m) throw new Error('app.config.ts has no "version": "x.y.z"');
  return { current: `${m[1]}.${m[2]}.${m[3]}`, next: `${m[1]}.${Number(m[2]) + 1}.0` };
}

function bumpVersion(to) {
  const src = readFileSync(APP_CONFIG, 'utf8');
  writeFileSync(APP_CONFIG, src.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${to}$2`));
}

/** Commits the changelog (and the version bump). `[skip ci]`: the ship itself is not something to ship. */
function commit(message, files) {
  const identity = spawnSync('git', ['config', 'user.email'], { cwd: ROOT, encoding: 'utf8' });
  if (identity.status !== 0 || !identity.stdout.trim()) {
    git('config', 'user.email', 'ship@boelsbokklubb.app');
    git('config', 'user.name', 'Boels bokklubb ship');
  }
  git('add', ...files);
  git('commit', '-m', `${message} [skip ci]`);
  ok(`committed "${message}"`);
}

/** Pushes HEAD to its branch, rebasing on top of anything pushed meanwhile. */
function push() {
  if (flag('no-push')) return;
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  for (let attempt = 1; attempt <= 4; attempt++) {
    const push = spawnSync('git', ['push', 'origin', `HEAD:${branch}`], { cwd: ROOT, encoding: 'utf8' });
    if (push.status === 0) {
      ok(`pushed to ${branch}`);
      return;
    }
    const why = (push.stderr || push.stdout).trim();
    if (/rejected|fetch first|non-fast-forward/i.test(why)) {
      // Someone pushed meanwhile; our commit only touches the changelog (and app.config.ts), so rebase and retry.
      git('pull', '--rebase', 'origin', branch);
      continue;
    }
    if (attempt === 4) throw new Error(`git push failed: ${why}`);
    spawnSync('sleep', [String(2 ** attempt)]);
  }
}

/** The Unreleased lines, or a plain refusal: the changelog line is part of shipping. */
function linesToShip() {
  const body = unreleased();
  if (!body) {
    fail(
      'docs/CHANGELOG.md has nothing under "## Unreleased". Write what changed for Boel, one line per ' +
        'change in Viktor\'s words, commit, and ship again.',
    );
  }
  return body;
}

// ---- the bundle proof ----------------------------------------------------------------------------

/**
 * Proves that a bundle built the way EAS builds it carries the Supabase hostname. `eas update` and
 * `eas build` ignore the committed .env and use the EAS environment variables, so this runs
 * `expo export` under `eas env:exec production` with sentinel values in the process environment:
 * if EAS had no values, the sentinel would reach the bundle and the real hostname would not.
 * Leaves the export in dist/ so the update can publish exactly those bytes (--skip-bundler).
 */
function proveBundle() {
  needSecrets('EXPO_TOKEN');
  const local = dotenv();
  const url = local.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const host = /^https:\/\/([a-z0-9-]+\.supabase\.co)$/.exec(url)?.[1];
  if (!host) fail('.env has no EXPO_PUBLIC_SUPABASE_URL; run `node scripts/setup.mjs env` first');
  log('Proving the bundle: expo export under the production EAS environment');
  const sentinel = {
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_SUPABASE_URL: 'https://sentinel-not-from-eas.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sentinel-not-from-eas-'.repeat(3),
    CI: '1',
  };
  const r = spawnSync(
    'npx',
    ['eas-cli@latest', 'env:exec', 'production', 'npx expo export --platform ios --output-dir dist', '--non-interactive'],
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...sentinel } },
  );
  if (r.status !== 0) fail('expo export failed under eas env:exec; the EAS production environment is probably missing the Supabase values (node scripts/setup.mjs env)');
  const bundles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(hbc|js)$/.test(name)) bundles.push(p);
    }
  };
  if (!existsSync(join(ROOT, 'dist'))) fail('expo export produced no dist/ folder');
  walk(join(ROOT, 'dist'));
  const hit = bundles.find((p) => readFileSync(p).includes(host));
  const leaked = bundles.find((p) => readFileSync(p).includes('sentinel-not-from-eas'));
  if (!hit || leaked) {
    fail(
      `The exported bundle does not carry ${host}${leaked ? ' (it carries the sentinel instead)' : ''}. ` +
        'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are missing or wrong in the EAS production ' +
        'environment. Fix: node scripts/setup.mjs env. Nothing was published.',
    );
  }
  ok(`bundle carries ${host} (${bundles.length} bundle file(s) checked)`);
}

// ---- the gates -----------------------------------------------------------------------------------

/**
 * Every gate (scripts/preflight.mjs --full) before a manual ship. `auto` runs in ship.yml, which
 * needs check.yml (the same gates) to pass first; the escape hatches have no such job, so they
 * run it here. A release that cannot pass the gates is not released.
 */
function preflight() {
  log('Preflight: every gate before anything is released');
  const r = spawnSync('node', [join(ROOT, 'scripts', 'preflight.mjs'), '--full'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail('preflight failed; nothing was shipped');
}

// ---- modes ---------------------------------------------------------------------------------------

function update() {
  needSecrets('EXPO_TOKEN');
  if (mode !== 'auto') preflight();
  const body = linesToShip();
  const { current: version } = appVersion();
  proveBundle();
  const message = `${version}: ${asPlainText(body).split('\n').join(' ')}`.slice(0, 1000);
  log(`Publishing update to production (${version})`);
  const updates = easJson(
    ['update', '--channel', 'production', '--environment', 'production', '--platform', 'ios', '--skip-bundler', '--message', message],
    { EAS_BUILD_NO_EXPO_GO_WARNING: 'true' },
  );
  const ios = (Array.isArray(updates) ? updates : []).find((u) => u.platform === 'ios') ?? updates[0];
  if (!ios?.id) fail(`eas update returned no update id: ${JSON.stringify(updates).slice(0, 400)}`);
  ok(`update ${ios.id} on branch ${ios.branch}, runtime ${ios.runtimeVersion}`);
  const { title } = release({ kind: 'update', id: ios.id });
  ok(`changelog: ${title}`);
  commit(`Changelog: update ${ios.id.slice(0, 8)}`, ['docs/CHANGELOG.md']);
  push();
}

async function build() {
  if (mode !== 'auto') preflight();
  const apple = appleEnv();
  if (flag('refresh') && !unreleased()) {
    const path = join(ROOT, 'docs', 'CHANGELOG.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('## Unreleased\n', `## Unreleased\n\n${REFRESH_LINE}\n`));
  }
  const body = linesToShip();
  if (!hasWhatToTest(body) && !flag('refresh')) {
    fail('A build section begins with one line "What to test: …" naming the thing to try. Add it under Unreleased and ship again.');
  }
  const { current, next: version } = appVersion();

  log('EAS: next build number');
  const got = easJson(['build:version:get', '--platform', 'ios', '--profile', 'production']);
  const buildNumber = Number(got.buildNumber) + 1;
  if (!Number.isInteger(buildNumber) || buildNumber < 2) fail(`eas build:version:get returned ${JSON.stringify(got)}`);
  ok(`build ${buildNumber}, version ${current} → ${version}`);

  bumpVersion(version);
  const { title } = release({ kind: 'build', version, build: buildNumber });
  ok(`changelog: ${title}`);
  // Commit first so the build is of exactly this tree; push once EAS has confirmed the number.
  const message = `Changelog: ${version} (build ${buildNumber})`;
  commit(message, ['app.config.ts', 'docs/CHANGELOG.md']);

  log(`EAS: building ${version} (${buildNumber}) for iOS and submitting to TestFlight`);
  const started = easJson(['build', '--platform', 'ios', '--profile', 'production', '--auto-submit', '--no-wait'], apple);
  const b = (Array.isArray(started) ? started : [started])[0];
  if (!b?.id) fail(`eas build returned no build: ${JSON.stringify(started).slice(0, 400)}`);
  if (String(b.appBuildVersion) !== String(buildNumber) || b.appVersion !== version) {
    fail(
      `EAS created build ${b.appBuildVersion} of ${b.appVersion}, the changelog says build ${buildNumber} of ${version}. ` +
        `Fix docs/CHANGELOG.md by hand (commit ${git('rev-parse', '--short', 'HEAD')} is local, not pushed) and push.`,
    );
  }
  ok(`build ${b.id} queued`);
  push();
  if (flag('no-wait')) {
    console.log('\nNot waiting. "What to Test" will not be written; node scripts/asc.mjs whats-new can do it later.');
    return;
  }

  log('EAS: waiting for the build (20 to 30 minutes)');
  await waitForBuild(b.id, apple);
  log('App Store Connect: waiting for Apple to process it');
  const processed = await waitForProcessedBuild({ buildNumber, appVersion: version });
  const whatsNew = asPlainText(body);
  const r = await setWhatsNew(processed.id, whatsNew);
  ok(`"What to Test" ${r.created ? 'written' : 'updated'} for ${version} (${buildNumber}): ${whatsNew.split('\n')[0]}`);
}

async function waitForBuild(id, apple) {
  const deadline = Date.now() + 60 * 60_000;
  let last = null;
  while (Date.now() < deadline) {
    const b = easJson(['build:view', id], apple, ['--json']);
    if (b.status !== last) console.log(`  EAS build ${id.slice(0, 8)}: ${b.status}`);
    last = b.status;
    if (b.status === 'FINISHED') return b;
    if (['ERRORED', 'CANCELED', 'PENDING_CANCEL'].includes(b.status)) {
      fail(`EAS build ${id} ${b.status.toLowerCase()}. The changelog section was already pushed; fix it by hand or ship again.`);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  fail(`EAS build ${id} did not finish within an hour`);
}

// ---- the web version -----------------------------------------------------------------------------

/**
 * Deploys the feed function and builds the page into web/dist, then tells ship.yml to put it on
 * GitHub Pages. The function goes first: the page that is about to go live talks to it. The
 * changelog section is the caller's: a web-only ship files `### Web`, a ship that also updates
 * or builds the app keeps the lines in that section.
 */
async function shipWeb() {
  needSecrets('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
  log('Supabase: deploying the feed function');
  await deployFunction('feed');
  ok('feed deployed');
  log('Building the web page into web/dist');
  const r = spawnSync('node', ['--no-warnings', join(ROOT, 'scripts', 'web.mjs'), 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail('the web page did not build; the function is deployed, the page was not published');
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, 'web=true\n', { flag: 'a' });
  ok('web/dist ready for GitHub Pages');
}

/** A web-only ship: the function, the page, and the Unreleased lines filed as `### Web (date)`. */
async function web() {
  if (mode !== 'auto') preflight();
  const body = linesToShip();
  await shipWeb();
  const { title } = release({ kind: 'web' });
  ok(`changelog: ${title}`);
  commit(`Changelog: web ${asPlainText(body).split('\n')[0].slice(0, 60)}`, ['docs/CHANGELOG.md']);
  push();
}

/** The part of a native ship after "build queued": wait for EAS, wait for Apple, write "What to Test" from the changelog. */
async function finish(id) {
  if (!id) fail('usage: node scripts/ship.mjs finish <eas build id>');
  const apple = appleEnv();
  log(`EAS: waiting for build ${id.slice(0, 8)} (20 to 30 minutes)`);
  const b = await waitForBuild(id, apple);
  const section = latestBuild();
  if (String(b.appBuildVersion) !== String(section.build) || b.appVersion !== section.version) {
    fail(`EAS build ${id.slice(0, 8)} is ${b.appVersion} (${b.appBuildVersion}); the changelog's latest build section is ${section.version} (build ${section.build})`);
  }
  log('App Store Connect: waiting for Apple to process it');
  const processed = await waitForProcessedBuild({ buildNumber: section.build, appVersion: section.version });
  const whatsNew = asPlainText(section.body);
  const r = await setWhatsNew(processed.id, whatsNew);
  ok(`"What to Test" ${r.created ? 'written' : 'updated'} for ${section.version} (${section.build}): ${whatsNew.split('\n')[0]}`);
}

/** CI entry: update, build, web, or nothing, from the diff since the last ship. */
async function auto() {
  const c = changesSince();
  if (c.headIsShip) {
    console.log(`HEAD is the ship commit "${c.subject}"; nothing to ship.`);
    return;
  }
  // A rerun of a failed run checks out the same commit; if the ship got as far as its changelog
  // commit, main already carries it and shipping again would queue a second build.
  const newerShip = spawnSync('git', ['log', '--format=%s', '--grep=^Changelog: ', 'HEAD..origin/main'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  if (newerShip) {
    fail(`main already carries "${newerShip.split('\n')[0]}" after this commit: it was shipped. If that run failed while waiting for the build, node scripts/ship.mjs finish <build-id> does the rest; nothing to ship from here.`);
  }
  const body = unreleased();
  if (!body) {
    if (c.app.length) fail(`App files changed since ${c.commit.slice(0, 8)} but Unreleased is empty; check.yml should have refused this push.`);
    console.log(`Nothing under Unreleased and no app files changed since ${c.commit.slice(0, 8)}; nothing to ship.`);
    return;
  }
  const native = c.native.length > 0 || c.forcedNative;
  const webOnly = c.web.length > 0 && !native && c.ios.length === 0;
  const what = native ? 'native build' : webOnly ? 'web version only' : 'over-the-air update';
  log(`Since the last ship (${c.commit.slice(0, 8)}): ${c.files.length} file(s) changed; ${what}${c.web.length && !webOnly ? ' and the web version' : ''}`);
  if (c.native.length) console.log(`  native because: ${c.native.join(', ')}`);
  if (c.web.length) console.log(`  web because: ${c.web.join(', ')}`);
  if (c.migrations.length) {
    needSecrets('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
    log('Supabase: applying migrations first');
    await migrate(ok);
  }
  if (webOnly) {
    await web();
    return;
  }
  if (c.web.length) await shipWeb();
  if (native) await build();
  else update();
}

function submit() {
  process.exit(eas(['submit', '--platform', 'ios', '--profile', 'production', '--latest', '--non-interactive'], appleEnv()));
}

(async () => {
  if (mode === 'auto') await auto();
  else if (mode === 'update') update();
  else if (mode === 'build') await build();
  else if (mode === 'prove') proveBundle();
  else if (mode === 'submit') submit();
  else if (mode === 'web') await web();
  else if (mode === 'finish') await finish(args[1]);
  else fail(`unknown mode ${mode}; see the header of scripts/ship.mjs`);
})().catch((err) => fail(err.message));
