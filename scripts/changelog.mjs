#!/usr/bin/env node
// docs/CHANGELOG.md is the single source of what reached Viktor's phone. The top section is
// `## Unreleased`; every commit that changes what Boel sees adds a line there, in Viktor's words.
// Shipping (scripts/ship.mjs) moves those lines into a dated section; this module is the only code
// that reads or writes the file.
//
//   node scripts/changelog.mjs check        CI gate: app code changed since the last ship means Unreleased must have lines
//   node scripts/changelog.mjs unreleased   print the Unreleased lines (exit 1 when empty)
//   node scripts/changelog.mjs shipped      print the commit of the last ship and what changed since
//
// Layout of the file, newest first:
//
//   ## Unreleased
//   ## 1.1.0 (build 8, 2026-11-01, TestFlight)     a native build: version, build number, date
//   ### Update 01a1744f (2026-10-25)               an over-the-air update, under the build it belongs to
//   ### Web (2026-10-26)                           a ship of the web version only, under the current build
//   ## Build 7 (2026-10-25, TestFlight)            builds before the version numbers started

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
export const CHANGELOG = join(ROOT, 'docs', 'CHANGELOG.md');

/** Paths whose change means Boel sees something different on her phone: an over-the-air update. */
export const IOS_PATHS = ['app/', 'components/', 'lib/', 'assets/'];
/** Paths whose change means relatives see something different: the page and the feed function are deployed. */
export const WEB_PATHS = ['web/', 'supabase/functions/feed/'];
/** Paths whose change means someone sees something different, so a changelog line is required. */
export const APP_PATHS = [...IOS_PATHS, ...WEB_PATHS];
/** Paths whose change means a new TestFlight build is needed rather than an over-the-air update. */
export const NATIVE_PATHS = ['package.json', 'package-lock.json', 'app.config.ts', 'eas.json', 'supabase/migrations/'];
export const MIGRATION_PATH = 'supabase/migrations/';

const UNRELEASED = '## Unreleased';

export function read() {
  return readFileSync(CHANGELOG, 'utf8');
}

/** Start and end (exclusive) of the Unreleased body: the lines between its heading and the next heading. */
function unreleasedRange(text) {
  const start = text.indexOf(`${UNRELEASED}\n`);
  if (start < 0) throw new Error(`docs/CHANGELOG.md has no "${UNRELEASED}" section`);
  const bodyStart = start + UNRELEASED.length + 1;
  const next = text.slice(bodyStart).search(/^#{2,3} /m);
  const bodyEnd = next < 0 ? text.length : bodyStart + next;
  return { bodyStart, bodyEnd };
}

/** The Unreleased lines, trimmed, as one string; empty string when there is nothing to ship. */
export function unreleased(text = read()) {
  const { bodyStart, bodyEnd } = unreleasedRange(text);
  return text.slice(bodyStart, bodyEnd).trim();
}

/** Lines are for people: one sentence each, starting with the change. Used for update messages and "What to Test". */
export function asPlainText(body) {
  const out = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // A wrapped continuation line joins the sentence above it; a bullet or "What to test:" starts a new one.
    if (/^(- |What to test:)/.test(line) || out.length === 0) out.push(line.replace(/^- /, ''));
    else out[out.length - 1] += ` ${line}`;
  }
  return out.join('\n');
}

/** True when the Unreleased lines name the thing to try first, as every build section must. */
export function hasWhatToTest(body) {
  return /^What to test:/m.test(body);
}

/**
 * Moves the Unreleased lines into a new section and writes the file.
 *   release({ kind: 'build', version: '1.1.0', build: 8 })   → `## 1.1.0 (build 8, date, TestFlight)` right under Unreleased
 *   release({ kind: 'update', id: '01a1744f-…' })            → `### Update 01a1744f (date)` under the current build's own lines
 *   release({ kind: 'web' })                                 → `### Web (date)` in the same place
 * Returns the new section's title and body.
 */
export function release(what, date = today()) {
  const text = read();
  const body = unreleased(text);
  if (!body) throw new Error('docs/CHANGELOG.md has nothing under "## Unreleased"; write what changed for Boel first');
  const { bodyStart, bodyEnd } = unreleasedRange(text);
  const rest = text.slice(bodyEnd);
  let title;
  let out;
  if (what.kind === 'build') {
    title = `## ${what.version} (build ${what.build}, ${date}, TestFlight)`;
    out = `${text.slice(0, bodyStart)}\n${title}\n\n${body}\n\n${rest}`;
  } else if (what.kind === 'update' || what.kind === 'web') {
    title = what.kind === 'web' ? `### Web (${date})` : `### Update ${what.id.slice(0, 8)} (${date})`;
    // Under the current build: after its heading and its own lines, before its first update.
    const buildAt = rest.search(/^## /m);
    if (buildAt < 0) throw new Error('docs/CHANGELOG.md has no build section to file the update under');
    const afterHeading = buildAt + rest.slice(buildAt).indexOf('\n') + 1;
    const nextHeading = rest.slice(afterHeading).search(/^#{2,3} /m);
    const insertAt = nextHeading < 0 ? rest.length : afterHeading + nextHeading;
    out = `${text.slice(0, bodyStart)}\n${rest.slice(0, insertAt).replace(/\n*$/, '\n\n')}${title}\n\n${body}\n\n${rest.slice(insertAt)}`;
  } else {
    throw new Error(`release: unknown kind ${what.kind}`);
  }
  writeFileSync(CHANGELOG, out.replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n'));
  return { title, body };
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---- git -----------------------------------------------------------------------------------------

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

/** The commit of the last ship: the latest "Changelog: …" commit, or the root commit if none is reachable. */
export function lastShipCommit() {
  const found = git('log', '-1', '--format=%H', '--grep=^Changelog: ');
  if (found) return found;
  return git('rev-list', '--max-parents=0', 'HEAD').split('\n').pop();
}

/** Files changed since the last ship, and what they mean for shipping. */
export function changesSince(commit = lastShipCommit()) {
  const head = git('rev-parse', 'HEAD');
  const files = head === commit ? [] : git('diff', '--name-only', `${commit}..HEAD`).split('\n').filter(Boolean);
  const subject = git('log', '-1', '--format=%s');
  const touches = (prefixes) => files.filter((f) => prefixes.some((p) => f.startsWith(p)));
  return {
    commit,
    head,
    subject,
    files,
    app: touches(APP_PATHS),
    ios: touches(IOS_PATHS),
    web: touches(WEB_PATHS),
    native: touches(NATIVE_PATHS),
    migrations: touches([MIGRATION_PATH]),
    forcedNative: /\[native\]/i.test(subject),
    headIsShip: /^Changelog: /.test(subject),
  };
}

// ---- CLI -----------------------------------------------------------------------------------------

function check() {
  const body = unreleased();
  const c = changesSince();
  const since = c.commit.slice(0, 8);
  if (c.headIsShip) {
    console.log(`HEAD is the ship commit "${c.subject}"; nothing to check.`);
    return;
  }
  if (c.app.length && !body) {
    console.error(
      `${c.app.length} file(s) under ${APP_PATHS.join(', ')} changed since the last ship (${since}) but ` +
        `docs/CHANGELOG.md has nothing under "## Unreleased".\n` +
        `Add one line per change, in Viktor's words, then commit again. Changed:\n  ${c.app.join('\n  ')}`,
    );
    process.exit(1);
  }
  const native = c.native.length || c.forcedNative;
  if (native && body && !hasWhatToTest(body)) {
    console.error(
      `This push needs a native build (${c.forcedNative ? '[native] in the subject' : c.native.join(', ')}), so the ` +
        `Unreleased lines must begin with one line "What to test: …" naming the thing to try.`,
    );
    process.exit(1);
  }
  console.log(
    body
      ? `Unreleased has ${body.split('\n').filter((l) => /^(- |What to test:)/.test(l)).length} line(s); ${c.app.length} app file(s) changed since ${since}.`
      : `Nothing under Unreleased and no app files changed since ${since}; nothing to ship.`,
  );
}

const self = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (self) {
  const [cmd] = process.argv.slice(2);
  try {
    if (cmd === 'check') check();
    else if (cmd === 'unreleased') {
      const body = unreleased();
      if (!body) process.exit(1);
      console.log(body);
    } else if (cmd === 'shipped') {
      const c = changesSince();
      console.log(`last ship: ${c.commit}\nsince then: ${c.files.length ? c.files.join('\n  ') : '(nothing)'}`);
      console.log(`native: ${c.native.length || c.forcedNative ? 'yes' : 'no'}  migrations: ${c.migrations.length ? 'yes' : 'no'}  web: ${c.web.length ? 'yes' : 'no'}`);
    } else {
      console.error('usage: node scripts/changelog.mjs check | unreleased | shipped');
      process.exit(2);
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
