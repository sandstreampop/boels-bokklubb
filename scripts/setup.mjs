#!/usr/bin/env node
// One-shot provisioning for Boels bokklubb. Idempotent: safe to run again.
//
//   node scripts/setup.mjs            run everything
//   node scripts/setup.mjs supabase   only the Supabase part (also: migrate, user, env, github, eas, testflight)
//   node scripts/setup.mjs feed       the web version's secrets: FEED_TOKEN and FEED_PIN (prints the link and the PIN)
//
// Reads the secrets listed in README.md from the environment. Never prints them, except the feed
// step, whose link and PIN are for relatives.

import { execSync, spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ascToken } from './asc.mjs';
import { easEnv as withDotenv } from './eas.mjs';
import { ROOT, api, apiKeys, deployFunction, migrate as applyMigrations, projectUrl, setSecrets } from './supabase.mjs';

const FAMILY_EMAIL = 'familjen@boelsbokklubb.app';
const REPO = 'sandstreampop/boels-bokklubb';
const WEB_URL = 'https://sandstreampop.github.io/boels-bokklubb/';
const BUNDLE_ID = 'com.sandstreampop.boelsbokklubb';
// Supabase requires six characters; the family password can be shorter. The app applies the same prefix.
const serverPassword = (typed) => `bokklubb-${typed}`;

const steps = process.argv.slice(2);
const want = (name) => steps.length === 0 || steps.includes(name);

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment secrets: ${missing.join(', ')}`);
}

const log = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ------------------------------------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------------------------------------
let anonKey = null;

async function supabase() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'OPENAI_API_KEY');
  const url = projectUrl();
  const ref = new URL(url).hostname.split('.')[0];
  const mgmt = `https://api.supabase.com/v1/projects/${ref}`;
  const headers = { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' };

  await migrate();

  log('Supabase: reading API keys');
  const keys = await apiKeys();
  anonKey = keys.anon;
  const serviceKey = keys.service;
  ok('anon and service_role keys found');

  log('Supabase: locking down sign-ups');
  await api(`${mgmt}/config/auth`, { method: 'PATCH', headers, body: JSON.stringify({ disable_signup: true, mailer_autoconfirm: true }) });
  ok('public sign-up disabled');

  if (process.env.BOKKLUBB_PASSWORD) await familyUser(url, serviceKey);
  else console.log('  ! BOKKLUBB_PASSWORD not set, skipping the family login (run the "user" step later)');

  log('Supabase: deploying the transcribe function');
  await deployFunction('transcribe');
  ok('transcribe deployed');

  log('Supabase: setting function secrets');
  await setSecrets({ OPENAI_API_KEY: process.env.OPENAI_API_KEY });
  ok('OPENAI_API_KEY stored');
}

/** Applies every file in supabase/migrations, in order. All of them are written to be rerunnable. */
async function migrate() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
  log('Supabase: applying migrations');
  await applyMigrations(ok);
}

/**
 * The web version's secrets (docs/PRD-build-8.md): the secret link's token and the four-digit
 * PIN, stored as function secrets and nowhere else. Rerun with new values to rotate; every
 * device then has to enter the PIN again from the new link. Deploys the feed function too.
 */
async function feed() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
  const token = (process.env.FEED_TOKEN ?? '').trim();
  const pin = (process.env.FEED_PIN ?? '').trim();
  if (!/^[A-Za-z0-9_-]{22,}$/.test(token)) {
    throw new Error(
      'FEED_TOKEN must be at least 128 random bits as base64url (22+ characters of A-Z a-z 0-9 - _). Make one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(16).toString('base64url'))\"",
    );
  }
  if (!/^\d{4}$/.test(pin)) throw new Error('FEED_PIN must be exactly four digits, and not the family password');
  log('Supabase: deploying the feed function');
  await deployFunction('feed');
  ok('feed deployed');
  log('Supabase: storing FEED_TOKEN and FEED_PIN as function secrets');
  await setSecrets({ FEED_TOKEN: token, FEED_PIN: pin });
  ok('stored; the function reads them on its next request');
  console.log(`\n  Link for relatives:  ${WEB_URL}#t=${token}`);
  console.log(`  PIN:                 ${pin}`);
  console.log('  Send both, separately. GitHub Pages must be set to "GitHub Actions" under Settings → Pages.');
}

async function familyUser(url, serviceKey) {
  need('BOKKLUBB_PASSWORD');
  log('Supabase: creating the family login');
  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
  const list = await api(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: adminHeaders });
  const existing = (list.users ?? []).find((u) => u.email === FAMILY_EMAIL);
  const payload = JSON.stringify({ email: FAMILY_EMAIL, password: serverPassword(process.env.BOKKLUBB_PASSWORD), email_confirm: true });
  if (existing) {
    await api(`${url}/auth/v1/admin/users/${existing.id}`, { method: 'PUT', headers: adminHeaders, body: payload });
    ok('family user updated');
  } else {
    await api(`${url}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: payload });
    ok('family user created');
  }
}

async function user() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN');
  await familyUser(projectUrl(), (await apiKeys()).service);
}

/**
 * One source of truth for the two public values the app cannot run without: .env for local work,
 * and the same values as plaintext EAS environment variables for every environment, because
 * `eas update --environment` and `eas build` ignore .env and read those. Idempotent.
 */
function env() {
  need('SUPABASE_URL');
  if (!anonKey) {
    // Rerun of just this step: take the values from the committed .env.
    const existing = Object.fromEntries(
      readFileSync(join(ROOT, '.env'), 'utf8')
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
    anonKey = existing.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null;
    if (!anonKey) throw new Error('Run the supabase step first (or in the same run) so the anon key is known');
  }
  log('Writing .env with public app config');
  writeFileSync(
    join(ROOT, '.env'),
    `EXPO_PUBLIC_SUPABASE_URL=${projectUrl()}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}\n`,
  );
  ok('.env written (public values, commit it)');

  need('EXPO_TOKEN');
  log('EAS: environment variables for production, preview and development');
  const values = { EXPO_PUBLIC_SUPABASE_URL: projectUrl(), EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey };
  for (const environment of ['production', 'preview', 'development']) {
    for (const [name, value] of Object.entries(values)) {
      const create = spawnSync(
        'npx',
        ['eas-cli@latest', 'env:create', '--environment', environment, '--scope', 'project', '--visibility', 'plaintext', '--name', name, '--value', value, '--non-interactive'],
        { cwd: ROOT, encoding: 'utf8', env: withDotenv() },
      );
      if (create.status === 0) {
        ok(`${environment} ${name} created`);
        continue;
      }
      if (!/already exists/i.test(`${create.stdout}${create.stderr}`)) throw new Error(`eas env:create ${environment} ${name} failed: ${(create.stderr || create.stdout).slice(-400)}`);
      const update = spawnSync(
        'npx',
        ['eas-cli@latest', 'env:update', '--variable-name', name, '--variable-environment', environment, '--value', value, '--non-interactive'],
        { cwd: ROOT, encoding: 'utf8', env: withDotenv() },
      );
      if (update.status !== 0) throw new Error(`eas env:update ${environment} ${name} failed: ${(update.stderr || update.stdout).slice(-400)}`);
      ok(`${environment} ${name} updated`);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// GitHub Actions secrets: CI ships (ship.yml), checks the bundle (check.yml) and rebuilds monthly
// ------------------------------------------------------------------------------------------------
const GITHUB_SECRETS = ['EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID', 'SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN'];
function github() {
  need(...GITHUB_SECRETS);
  log('GitHub: setting Actions secrets');
  for (const name of GITHUB_SECRETS) {
    const r = spawnSync('gh', ['secret', 'set', name, '-R', REPO], { input: process.env[name], stdio: ['pipe', 'inherit', 'inherit'] });
    if (r.status !== 0) throw new Error(`gh secret set ${name} failed`);
    ok(name);
  }
}

// ------------------------------------------------------------------------------------------------
// EAS: link project, build, submit to TestFlight
// ------------------------------------------------------------------------------------------------
function ascKeyPath() {
  need('ASC_KEY_P8_BASE64');
  const dir = mkdtempSync(join(tmpdir(), 'asc-'));
  const p = join(dir, 'AuthKey.p8');
  writeFileSync(p, Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64'));
  return p;
}

function easEnv() {
  need('EXPO_TOKEN', 'APPLE_TEAM_ID', 'ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_APP_ID');
  return {
    ...withDotenv(),
    EXPO_ASC_API_KEY_PATH: ascKeyPath(),
    EXPO_ASC_KEY_ID: process.env.ASC_KEY_ID,
    EXPO_ASC_ISSUER_ID: process.env.ASC_ISSUER_ID,
    EXPO_APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
    EXPO_APPLE_TEAM_TYPE: 'INDIVIDUAL',
  };
}

function eas() {
  const e = easEnv();
  log('EAS: linking project');
  const app = readFileSync(join(ROOT, 'app.config.ts'), 'utf8');
  if (!/projectId/.test(app)) {
    execSync('npx eas-cli@latest init --force --non-interactive', { cwd: ROOT, stdio: 'inherit', env: e });
  }
  ok('project linked');

  log('EAS: building for iOS and submitting to TestFlight (20 to 30 minutes)');
  const r = spawnSync(
    'python3',
    [join(ROOT, 'scripts', 'eas-drive.py'), 'build', '--platform', 'ios', '--profile', 'production', '--auto-submit'],
    { cwd: ROOT, stdio: 'inherit', env: e },
  );
  if (r.status !== 0) throw new Error('eas build failed, see output above');
  ok('build submitted to TestFlight');
}

// ------------------------------------------------------------------------------------------------
// App Store Connect: internal TestFlight group with the account holder in it
// ------------------------------------------------------------------------------------------------
async function testflight() {
  need('ASC_APP_ID');
  const base = 'https://api.appstoreconnect.apple.com/v1';
  const headers = { authorization: `Bearer ${ascToken()}`, 'content-type': 'application/json' };
  const appId = process.env.ASC_APP_ID;

  log('TestFlight: internal group "Familjen"');
  const groups = await api(`${base}/apps/${appId}/betaGroups`, { headers });
  let group = groups.data.find((g) => g.attributes.name === 'Familjen');
  if (!group) {
    const created = await api(`${base}/betaGroups`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'betaGroups',
          attributes: { name: 'Familjen', isInternalGroup: true, hasAccessToAllBuilds: true },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      }),
    });
    group = created.data;
    ok('group created');
  } else {
    ok('group exists');
  }

  log('TestFlight: adding team users as testers');
  const users = await api(`${base}/users?limit=200`, { headers });
  const testers = await api(`${base}/betaTesters?limit=200`, { headers });
  const byEmail = new Map(testers.data.map((t) => [t.attributes.email?.toLowerCase(), t.id]));
  for (const u of users.data) {
    const email = u.attributes.username?.toLowerCase();
    if (!email) continue;
    try {
      const testerId = byEmail.get(email);
      if (testerId) {
        await api(`${base}/betaGroups/${group.id}/relationships/betaTesters`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ data: [{ type: 'betaTesters', id: testerId }] }),
        });
      } else {
        await api(`${base}/betaTesters`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: {
              type: 'betaTesters',
              attributes: { email, firstName: u.attributes.firstName, lastName: u.attributes.lastName },
              relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
            },
          }),
        });
      }
      ok(`${email} is a tester`);
    } catch (err) {
      console.log(`  ! could not add ${email} automatically: ${err.message.slice(0, 200)}`);
      console.log('    Add them by hand: App Store Connect → TestFlight → Internal Testing → Familjen → Testers (+).');
    }
  }
}

// ------------------------------------------------------------------------------------------------
async function main() {
  console.log(`Boels bokklubb setup for ${BUNDLE_ID}`);
  if (want('supabase')) await supabase();
  if (steps.includes('user')) await user();
  if (steps.includes('migrate')) await migrate();
  if (steps.includes('feed')) await feed();
  if (want('env')) env();
  if (want('github')) github();
  if (want('eas')) eas();
  if (want('testflight')) await testflight();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
