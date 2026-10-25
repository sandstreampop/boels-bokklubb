#!/usr/bin/env node
// The Supabase Management API, shared by scripts/setup.mjs (provisioning) and scripts/ship.mjs
// (migrations and the feed function on ship). Needs SUPABASE_URL and SUPABASE_ACCESS_TOKEN; run
// with NODE_USE_ENV_PROXY=1 in the cloud. Never prints a secret.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing environment secrets: ${missing.join(', ')}`);
}

/** Accepts the project URL, or any URL under it (people paste the REST endpoint), and returns the base. */
export function projectUrl() {
  need('SUPABASE_URL');
  const u = new URL(process.env.SUPABASE_URL);
  return `${u.protocol}//${u.hostname}`;
}

export const projectRef = () => new URL(projectUrl()).hostname.split('.')[0];
export const mgmtUrl = () => `https://api.supabase.com/v1/projects/${projectRef()}`;

export function mgmtHeaders() {
  need('SUPABASE_ACCESS_TOKEN');
  return { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' };
}

export async function api(url, init = {}) {
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

/** Runs SQL as the project owner. */
export function query(sql) {
  return api(`${mgmtUrl()}/database/query`, { method: 'POST', headers: mgmtHeaders(), body: JSON.stringify({ query: sql }) });
}

/** Applies every file in supabase/migrations, in order. All of them are written to be rerunnable. Calls `onEach(file)` after each. */
export async function migrate(onEach = () => {}) {
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await query(readFileSync(join(dir, f), 'utf8'));
    onEach(f);
  }
}

/** Deploys supabase/functions/<name>/index.ts with verify_jwt false: each function checks its caller itself. */
export async function deployFunction(name) {
  const file = join(ROOT, 'supabase', 'functions', name, 'index.ts');
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'text/typescript' }), 'index.ts');
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name, verify_jwt: false }));
  await api(`${mgmtUrl()}/functions/deploy?slug=${name}`, {
    method: 'POST',
    headers: { authorization: mgmtHeaders().authorization },
    body: form,
  });
}

/** Upserts function secrets: `{ NAME: value }`. */
export function setSecrets(values) {
  const body = Object.entries(values).map(([name, value]) => ({ name, value }));
  return api(`${mgmtUrl()}/secrets`, { method: 'POST', headers: mgmtHeaders(), body: JSON.stringify(body) });
}

/** The anon and service_role keys of the project. */
export async function apiKeys() {
  const keys = await api(`${mgmtUrl()}/api-keys?reveal=true`, { headers: { authorization: mgmtHeaders().authorization } });
  const pick = (names, type) =>
    keys.find((k) => names.includes(k.name) && k.api_key)?.api_key ?? keys.find((k) => k.type === type && k.api_key)?.api_key;
  const anon = pick(['anon'], 'publishable');
  const service = pick(['service_role'], 'secret');
  if (!anon || !service) throw new Error('Could not find anon and service_role keys');
  return { anon, service };
}
