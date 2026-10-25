#!/usr/bin/env node
// App Store Connect API, signed with the key in the environment secrets (ASC_KEY_ID, ASC_ISSUER_ID,
// ASC_KEY_P8_BASE64). Used by scripts/ship.mjs to wait for Apple to process a build and to write
// TestFlight's "What to Test", and by scripts/setup.mjs for the tester group.
//
//   node scripts/asc.mjs builds                     the last builds Apple knows about, with their processing state
//   node scripts/asc.mjs whats-new <build> <text>   set "What to Test" (Swedish locale) on build number <build>
//
// Never prints a key. Run with NODE_USE_ENV_PROXY=1 in the cloud session.

import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';

const BASE = 'https://api.appstoreconnect.apple.com/v1';
/** TestFlight shows "What to Test" per locale; the app is Swedish. */
export const LOCALE = 'sv';
/** Apple's limit for whatsNew. */
export const WHATS_NEW_MAX = 4000;

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment secrets: ${missing.join(', ')}`);
}

/** A twenty-minute App Store Connect token (ES256 JWT). */
export function ascToken() {
  need('ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64');
  const key = createPrivateKey(Buffer.from(process.env.ASC_KEY_P8_BASE64.trim(), 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'ES256', kid: process.env.ASC_KEY_ID, typ: 'JWT' });
  const payload = b64({ iss: process.env.ASC_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' });
  const sig = sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

/** One request against the API. `path` is relative to /v1 or a full URL. Throws with the status and body on failure. */
export async function asc(path, init = {}) {
  const url = path.startsWith('https://') ? path : `${BASE}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${ascToken()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
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

function appId() {
  need('ASC_APP_ID');
  return process.env.ASC_APP_ID;
}

/** Builds Apple has for the app, newest first: { id, version (build number), appVersion, processingState, uploaded }. */
export async function builds({ buildNumber = null, appVersion = null, limit = 10 } = {}) {
  const q = new URLSearchParams({ 'filter[app]': appId(), sort: '-uploadedDate', limit: String(limit), include: 'preReleaseVersion' });
  if (buildNumber != null) q.set('filter[version]', String(buildNumber));
  if (appVersion) q.set('filter[preReleaseVersion.version]', appVersion);
  const res = await asc(`builds?${q}`);
  const versions = new Map((res.included ?? []).filter((i) => i.type === 'preReleaseVersions').map((i) => [i.id, i.attributes.version]));
  return res.data.map((b) => ({
    id: b.id,
    version: b.attributes.version,
    appVersion: versions.get(b.relationships?.preReleaseVersion?.data?.id) ?? null,
    processingState: b.attributes.processingState,
    uploaded: b.attributes.uploadedDate,
    expired: b.attributes.expired,
  }));
}

/**
 * Waits until Apple has processed build number `buildNumber` of `appVersion` and returns it.
 * Polls every minute; a FAILED or INVALID state throws. EAS submits the build as soon as it is
 * built, so the first minutes usually find nothing at all, which is not an error.
 */
export async function waitForProcessedBuild({ buildNumber, appVersion, timeoutMinutes = 60, log = console.log }) {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let seen = null;
  while (Date.now() < deadline) {
    const [b] = await builds({ buildNumber, appVersion, limit: 1 });
    if (b) {
      if (b.processingState !== seen) log(`  App Store Connect: build ${b.version} (${appVersion}) is ${b.processingState}`);
      seen = b.processingState;
      if (b.processingState === 'VALID') return b;
      if (b.processingState === 'FAILED' || b.processingState === 'INVALID') {
        throw new Error(`Apple rejected build ${buildNumber}: processing state ${b.processingState}`);
      }
    } else if (seen === null) {
      log(`  App Store Connect: build ${buildNumber} (${appVersion}) not uploaded yet`);
      seen = 'MISSING';
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`Apple had not processed build ${buildNumber} after ${timeoutMinutes} minutes`);
}

/** Sets TestFlight's "What to Test" for one build. Creates the localization if it does not exist, else updates it. */
export async function setWhatsNew(buildId, text, locale = LOCALE) {
  const whatsNew = text.trim().slice(0, WHATS_NEW_MAX);
  const existing = await asc(`builds/${buildId}/betaBuildLocalizations`);
  const mine = existing.data.find((l) => l.attributes.locale === locale);
  if (mine) {
    await asc(`betaBuildLocalizations/${mine.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { type: 'betaBuildLocalizations', id: mine.id, attributes: { whatsNew } } }),
    });
    return { id: mine.id, created: false };
  }
  const created = await asc('betaBuildLocalizations', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale, whatsNew },
        relationships: { build: { data: { type: 'builds', id: buildId } } },
      },
    }),
  });
  return { id: created.data.id, created: true };
}

const self = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (self) {
  const [cmd, ...rest] = process.argv.slice(2);
  (async () => {
    if (cmd === 'builds') {
      for (const b of await builds({ limit: Number(rest[0] ?? 10) })) {
        console.log(`${b.uploaded?.slice(0, 16).replace('T', ' ')}  ${String(b.appVersion).padEnd(7)} build ${String(b.version).padEnd(4)} ${b.processingState}${b.expired ? ' (expired)' : ''}`);
      }
    } else if (cmd === 'whats-new') {
      const [buildNumber, ...words] = rest;
      const text = words.join(' ');
      if (!buildNumber || !text) throw new Error('usage: node scripts/asc.mjs whats-new <build number> <text>');
      const [b] = await builds({ buildNumber, limit: 1 });
      if (!b) throw new Error(`Apple has no build ${buildNumber}`);
      const r = await setWhatsNew(b.id, text);
      console.log(`What to Test ${r.created ? 'created' : 'updated'} for build ${b.version} (${b.appVersion})`);
    } else {
      console.error('usage: node scripts/asc.mjs builds [n] | whats-new <build> <text>');
      process.exit(2);
    }
  })().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
