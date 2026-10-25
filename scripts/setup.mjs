#!/usr/bin/env node
// One-shot provisioning for Boels bokklubb. Idempotent: safe to run again.
//
//   node scripts/setup.mjs            run everything
//   node scripts/setup.mjs supabase   only the Supabase part (also: env, github, eas, testflight)
//
// Reads the secrets listed in README.md from the environment. Never prints them.

import { execSync, spawnSync } from 'node:child_process';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FAMILY_EMAIL = 'familjen@boelsbokklubb.app';
const REPO = 'sandstreampop/boels-bokklubb';
const BUNDLE_ID = 'com.sandstreampop.boelsbokklubb';

const steps = process.argv.slice(2);
const want = (name) => steps.length === 0 || steps.includes(name);

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment secrets: ${missing.join(', ')}`);
}

const log = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function api(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${res.status}: ${detail.slice(0, 500)}`);
  }
  return body;
}

// ------------------------------------------------------------------------------------------------
// Supabase
// ------------------------------------------------------------------------------------------------
let anonKey = null;

async function supabase() {
  need('SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'OPENAI_API_KEY', 'BOKKLUBB_PASSWORD');
  const url = process.env.SUPABASE_URL.replace(/\/$/, '');
  const ref = new URL(url).hostname.split('.')[0];
  const mgmt = `https://api.supabase.com/v1/projects/${ref}`;
  const headers = { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' };

  log('Supabase: applying migrations');
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const query = readFileSync(join(dir, f), 'utf8');
    await api(`${mgmt}/database/query`, { method: 'POST', headers, body: JSON.stringify({ query }) });
    ok(f);
  }

  log('Supabase: reading API keys');
  const keys = await api(`${mgmt}/api-keys?reveal=true`, { headers });
  const pick = (names, type) =>
    keys.find((k) => names.includes(k.name) && k.api_key)?.api_key ?? keys.find((k) => k.type === type && k.api_key)?.api_key;
  anonKey = pick(['anon'], 'publishable');
  const serviceKey = pick(['service_role'], 'secret');
  if (!anonKey || !serviceKey) throw new Error('Could not find anon and service_role keys');
  ok('anon and service_role keys found');

  log('Supabase: locking down sign-ups');
  await api(`${mgmt}/config/auth`, { method: 'PATCH', headers, body: JSON.stringify({ disable_signup: true, mailer_autoconfirm: true }) });
  ok('public sign-up disabled');

  log('Supabase: creating the family login');
  const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' };
  const list = await api(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers: adminHeaders });
  const existing = (list.users ?? []).find((u) => u.email === FAMILY_EMAIL);
  const payload = JSON.stringify({ email: FAMILY_EMAIL, password: process.env.BOKKLUBB_PASSWORD, email_confirm: true });
  if (existing) {
    await api(`${url}/auth/v1/admin/users/${existing.id}`, { method: 'PUT', headers: adminHeaders, body: payload });
    ok('family user updated');
  } else {
    await api(`${url}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: payload });
    ok('family user created');
  }

  log('Supabase: deploying the transcribe function');
  const fnDir = join(ROOT, 'supabase', 'functions', 'transcribe');
  const form = new FormData();
  form.append('file', new Blob([readFileSync(join(fnDir, 'index.ts'))], { type: 'text/typescript' }), 'index.ts');
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: 'transcribe', verify_jwt: false }));
  await api(`${mgmt}/functions/deploy?slug=transcribe`, {
    method: 'POST',
    headers: { authorization: headers.authorization },
    body: form,
  });
  ok('transcribe deployed');

  log('Supabase: setting function secrets');
  await api(`${mgmt}/secrets`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ name: 'OPENAI_API_KEY', value: process.env.OPENAI_API_KEY }]),
  });
  ok('OPENAI_API_KEY stored');
}

function env() {
  need('SUPABASE_URL');
  if (!anonKey) throw new Error('Run the supabase step first (or in the same run) so the anon key is known');
  log('Writing .env with public app config');
  writeFileSync(
    join(ROOT, '.env'),
    `EXPO_PUBLIC_SUPABASE_URL=${process.env.SUPABASE_URL.replace(/\/$/, '')}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}\n`,
  );
  ok('.env written (public values, commit it)');
}

// ------------------------------------------------------------------------------------------------
// GitHub Actions secrets for the monthly TestFlight refresh
// ------------------------------------------------------------------------------------------------
function github() {
  need('EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID');
  log('GitHub: setting Actions secrets');
  for (const name of ['EXPO_TOKEN', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ASC_APP_ID']) {
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
    ...process.env,
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
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  if (!app.expo.extra?.eas?.projectId) {
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
function ascToken() {
  need('ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64');
  const key = createPrivateKey(Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
  const payload = b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

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
