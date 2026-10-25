// The web version is built by Vite from this folder into web/dist, served by GitHub Pages under
// /boels-bokklubb/. The page talks to one place, the feed function of the Supabase project in the
// committed .env; the build refuses to exist without it (CLAUDE.md, "validate where the artifact
// is produced"). scripts/web.mjs runs dev, build and check through Vite's API with this config.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

function dotenv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const supabaseUrl = dotenv().EXPO_PUBLIC_SUPABASE_URL ?? '';
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
  throw new Error('.env has no EXPO_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co); the web page cannot know where its feed is. Run node scripts/setup.mjs env.');
}

// scripts/web.mjs derives the same URL from .env to prove the built page carries it.
const FEED_URL = `${supabaseUrl}/functions/v1/feed`;

export default defineConfig({
  root,
  base: '/boels-bokklubb/',
  publicDir: false,
  define: { __FEED_URL__: JSON.stringify(FEED_URL) },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
  server: { fs: { allow: ['..'] } },
});
