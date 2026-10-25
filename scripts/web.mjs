#!/usr/bin/env node
// The web version (web/, docs/PRD-build-8.md) through Vite's API, with web/fixture.json standing
// in for the feed function wherever the real one would be.
//
//   npm run web          dev server with the fixture answering /__feed (npm run web -- --host for a phone)
//   npm run web:build    typecheck web/, refuse React Native imports, build into web/dist
//   npm run web:check    build, serve web/dist, open each screen in Playwright Chromium with the fixture,
//                        fail on a console error or a missing element. check.yml runs this on every push.
//
// Chromium stands in for Android Chrome; Safari is checked on Viktor's phone.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dotenv } from './eas.mjs';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WEB = join(ROOT, 'web');
const DIST = join(WEB, 'dist');
const CONFIG = join(WEB, 'vite.config.mts');
const BASE = '/boels-bokklubb/';
/** The only modules under lib/ the page may import: no React Native, no Expo, no store. */
const ALLOWED_LIB = ['theme', 'format', 'fillIn'];

const [mode = 'check', ...rest] = process.argv.slice(2);
const log = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ---- the fixture in place of the function -------------------------------------------------------

export function loadFixture() {
  return JSON.parse(readFileSync(join(WEB, 'fixture.json'), 'utf8'));
}

/** Answers a feed request body the way supabase/functions/feed/index.ts would, from the fixture. */
export function answer(fixture, body, state) {
  const json = (status, data) => ({ status, data });
  if (!body || typeof body !== 'object') return json(400, { error: 'bad json' });
  if ('token' in body || 'pin' in body) {
    if (state.lockedUntil && new Date(state.lockedUntil) > new Date()) return json(401, { lockedUntil: state.lockedUntil });
    if (body.token !== fixture.token) return json(401, {});
    if (body.pin !== fixture.pin) {
      state.failures = (state.failures ?? 0) + 1;
      if (state.failures >= 5) {
        state.failures = 0;
        state.lockedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
        return json(401, { lockedUntil: state.lockedUntil });
      }
      return json(401, {});
    }
    state.failures = 0;
    return json(200, { pass: fixture.pass ?? 'fixture-pass', expiresAt: new Date(Date.now() + 365 * 86400e3).toISOString() });
  }
  if (body.pass !== (fixture.pass ?? 'fixture-pass')) return json(401, { error: 'no pass' });
  if ('error' in body) {
    state.errors = [...(state.errors ?? []), body.error];
    return { status: 204, data: null };
  }
  if (body.screen === 'library') return json(200, fixture.library);
  if (body.screen === 'book') return body.id === fixture.book.book.id ? json(200, fixture.book) : json(404, { error: 'no such book' });
  return json(400, { error: 'unknown screen' });
}

/** A Vite plugin: the dev server answers /__feed from the fixture. */
function fixturePlugin() {
  const fixture = loadFixture();
  const state = {};
  return {
    name: 'bokklubb-fixture',
    configureServer(server) {
      server.middlewares.use('/__feed', (req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          let body = null;
          try {
            body = JSON.parse(raw);
          } catch {}
          const a = answer(fixture, body, state);
          res.statusCode = a.status;
          if (a.data === null) return res.end();
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(a.data));
        });
      });
    },
  };
}

// ---- build ----------------------------------------------------------------------------------------

function typecheck() {
  log('web: typecheck (no React Native types)');
  const r = spawnSync('npx', ['tsc', '-p', join(WEB, 'tsconfig.json'), '--noEmit'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) fail('web/ does not typecheck');
  ok('web/ typechecks');
}

/** The page imports only React-Native-free modules from lib/, and nothing from react, react-native or expo. */
function checkImports() {
  log('web: imports');
  const bad = [];
  for (const name of readdirSync(WEB).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(WEB, name), 'utf8');
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const spec = m[1];
      const lib = /^\.\.\/lib\/([^/']+)$/.exec(spec);
      if (lib && !ALLOWED_LIB.includes(lib[1].replace(/\.ts$/, ''))) bad.push(`${name}: ${spec} (lib/ allows only ${ALLOWED_LIB.join(', ')})`);
      else if (/^\.\.\/(app|components)\//.test(spec)) bad.push(`${name}: ${spec} (app code is React Native)`);
      else if (/^(react|react-native|expo|@expo|@react-native|@xstate|@supabase)(\/|$)/.test(spec)) bad.push(`${name}: ${spec}`);
    }
  }
  if (bad.length) fail(`web/ imports React Native or Expo code:\n  ${bad.join('\n  ')}`);
  ok(`only ${ALLOWED_LIB.map((l) => `lib/${l}.ts`).join(', ')} from the app`);
}

async function build() {
  typecheck();
  checkImports();
  log('web: vite build');
  const { build } = await import('vite');
  await build({ configFile: CONFIG, logLevel: 'warn' });
  if (!existsSync(join(DIST, 'index.html'))) fail('vite produced no web/dist/index.html');
  const assets = join(DIST, 'assets');
  const js = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8'));
  // The same URL web/vite.config.mts bakes in, derived here on its own: the proof must not trust the config.
  const FEED_URL = `${dotenv().EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/feed`;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\//.test(FEED_URL)) fail('.env has no EXPO_PUBLIC_SUPABASE_URL; run node scripts/setup.mjs env first');
  if (!js.some((src) => src.includes(FEED_URL))) fail(`the built page does not carry its feed URL ${FEED_URL}`);
  if (js.some((src) => /react-native|expo-/.test(src))) fail('the built page carries React Native or Expo code');
  ok(`web/dist carries ${FEED_URL}`);
  return FEED_URL;
}

// ---- check ----------------------------------------------------------------------------------------

/** A 1×1 pink PNG for every image the fixture points at. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5/hPwAIAgL/4aW5GwAAAABJRU5ErkJggg==', 'base64');

async function check() {
  const feedUrl = await build();
  const fixture = loadFixture();
  const { preview } = await import('vite');
  const server = await preview({ configFile: CONFIG, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1' } });
  const origin = server.resolvedUrls.local[0].replace(/\/$/, '').replace(new RegExp(`${BASE.replace(/\/$/, '')}$`), '');
  const page0 = `${origin}${BASE}`;
  log(`web: Playwright Chromium against ${page0}`);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const failures = [];
  const state = {};

  async function open({ name, viewport, mobile, hash, storage, steps }) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, locale: 'sv-SE' });
    if (storage) await context.addInitScript((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), storage);
    const page = await context.newPage();
    const problems = [];
    page.on('console', (m) => {
      // A wrong PIN is a 401 by design; Chromium logs every non-2xx response as a console error.
      if (m.type() === 'error' && !/status of 401/.test(m.text())) problems.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith(origin)) return route.continue();
      if (url === feedUrl) {
        let body = null;
        try {
          body = route.request().postDataJSON();
        } catch {}
        const a = answer(fixture, body, state);
        return route.fulfill({ status: a.status, contentType: 'application/json', body: a.data === null ? '' : JSON.stringify(a.data) });
      }
      if (/\.(png|jpe?g)(\?|$)/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      if (/fonts\.googleapis\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
    });
    try {
      await page.goto(`${page0}${hash ?? ''}`, { waitUntil: 'load' });
      await steps(page, { expect: (cond, what) => !cond && problems.push(`missing: ${what}`) });
    } catch (err) {
      problems.push(err.message.split('\n')[0]);
    }
    await page.waitForTimeout(100);
    const stored = await page.evaluate(() => ({ pass: localStorage.getItem('bokklubb.pass'), token: localStorage.getItem('bokklubb.token') }));
    await context.close();
    if (problems.length) failures.push(`${name}:\n    ${problems.join('\n    ')}`);
    else ok(name);
    return stored;
  }

  const phone = { viewport: { width: 390, height: 844 }, mobile: true };
  const desktop = { viewport: { width: 1280, height: 800 }, mobile: false };
  const count = (page, sel) => page.locator(sel).count();
  const books = fixture.library.books;

  await open({
    name: 'no token: the title and nothing else',
    ...phone,
    steps: async (page, { expect }) => {
      await page.waitForSelector('.title-only .title');
      expect((await page.textContent('.title')) === 'Boels bokklubb', 'the title');
      expect((await count(page, '.pin-input')) === 0, 'no PIN boxes');
      expect((await count(page, '.grid')) === 0, 'no library');
    },
  });

  await open({
    name: 'the link: PIN screen, a wrong PIN shakes and empties, the fifth locks',
    ...phone,
    hash: `#t=${fixture.token}`,
    steps: async (page, { expect }) => {
      await page.waitForSelector('.pin .pin-input');
      expect((await count(page, '.pin-box')) === 4, 'four boxes');
      await page.fill('.pin-input', '0000');
      await page.waitForSelector('.pin-boxes.shake');
      await page.waitForFunction(() => document.querySelector('.pin-input')?.value === '');
      expect((await count(page, '.pin-box.filled')) === 0, 'boxes emptied after a wrong PIN');
      for (let i = 0; i < 4; i++) {
        await page.fill('.pin-input', '0000');
        await page.waitForFunction(() => document.querySelector('.pin-input')?.value === '' || document.querySelector('.pin-wait:not([hidden])'));
      }
      await page.waitForSelector('.pin-wait:not([hidden])');
      expect((await page.textContent('.pin-wait')) === 'Vänta en stund', '"Vänta en stund" while locked');
      expect(await page.locator('.pin-boxes').isHidden(), 'boxes gone while locked');
    },
  });
  state.lockedUntil = null;
  state.failures = 0;

  const stored = await open({
    name: 'the right PIN opens the library',
    ...phone,
    hash: `#t=${fixture.token}`,
    steps: async (page, { expect }) => {
      await page.waitForSelector('.pin .pin-input');
      await page.fill('.pin-input', fixture.pin);
      await page.waitForSelector('.library .grid .book');
      expect((await count(page, '.book')) === books.length, `${books.length} books`);
      expect((await page.textContent('.library .title')) === 'Boels bokklubb', 'the title');
      expect((await page.textContent('.count')) === String(fixture.library.stats.rainbow), 'the rainbow count beside the title');
      expect((await count(page, '.ring')) === books.filter((b) => b.complete).length, 'a ring on every complete book');
      expect((await count(page, '.cover img')) === books.filter((b) => b.cover_url).length, 'a picture for every cover');
      expect((await count(page, '.initial')) === books.filter((b) => !b.cover_url).length, 'an initial for every book without a cover');
      expect((await count(page, '.stars')) === books.filter((b) => b.rating).length, 'stars under every rated book');
      expect((await page.getAttribute('.book', 'href')) === `#/book/${books[0].id}`, 'a cover opens the book');
      expect((await page.getAttribute('.title-row', 'href')) === '#/stats', 'the title opens the stats');
    },
  });
  if (!stored.pass) failures.push('the pass was not stored after the right PIN');

  await open({
    name: 'a stored pass opens the library straight away, also on a desktop',
    ...desktop,
    storage: { 'bokklubb.pass': stored.pass ?? '', 'bokklubb.pass.expires': String(Date.now() + 86400e3), 'bokklubb.token': fixture.token },
    steps: async (page, { expect }) => {
      await page.waitForSelector('.library .grid .book');
      expect((await count(page, '.pin-input')) === 0, 'no PIN screen');
      expect((await count(page, '.book')) === books.length, `${books.length} books`);
    },
  });

  await open({
    name: 'an expired pass shows the PIN screen again',
    ...phone,
    storage: { 'bokklubb.pass': 'stale', 'bokklubb.pass.expires': String(Date.now() - 1000), 'bokklubb.token': fixture.token },
    steps: async (page, { expect }) => {
      await page.waitForSelector('.pin .pin-input');
      expect((await count(page, '.grid')) === 0, 'no library');
    },
  });

  await browser.close();
  await server.close();
  if (failures.length) fail(`web check failed:\n  ${failures.join('\n  ')}`);
  console.log('\nweb check passed.');
}

async function dev() {
  const { createServer } = await import('vite');
  const host = rest.includes('--host');
  const server = await createServer({ configFile: CONFIG, plugins: [fixturePlugin()], server: { host, port: 5173 } });
  await server.listen();
  const fixture = loadFixture();
  server.printUrls();
  console.log(`\n  The dev server answers from web/fixture.json. Open ${server.resolvedUrls.local[0]}#t=${fixture.token} and enter ${fixture.pin}.`);
}

(async () => {
  if (mode === 'dev') await dev();
  else if (mode === 'build') await build();
  else if (mode === 'check') await check();
  else fail(`unknown mode ${mode}; see the header of scripts/web.mjs`);
})().catch((err) => fail(err.stack ?? err.message));
