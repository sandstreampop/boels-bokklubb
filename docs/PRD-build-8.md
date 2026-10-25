# PRD: build 8, "släkten" (the read-only web version)

Written 2026-10-25, after builds 6 and 7 and the shipping pipeline, for the session that
implements it. Decisions were made with Viktor one question at a time; do not reopen them. Ask
when something is impossible or contradicts CLAUDE.md. "Släkten" is the build's name in these
documents only. The page is called Boels bokklubb, like the app.

## 1. Goal

Relatives open Boels bokklubb in a browser and see what Boel made. It is the app without the
create actions: the library, the book page, the stats. Same look, same cards, her voice playable.

Facts from Viktor:

- Readers are grandparents on iPhones and at least one person on Android. Safari on iOS and Chrome
  on Android are the targets. Desktop must work.
- Nothing in the iOS app changes. Boel does not see that the web version exists.
- Nothing flows back: no hearts, no comments, no share button on the web. Nothing notifies.
- No domain yet. The address is `https://sandstreampop.github.io/boels-bokklubb/`. A CNAME file
  adds a domain later without code changes.
- The web version is written once more in `web/`, not exported from the Expo app. The app code is
  not touched.

Success: within a month a relative mentions something Boel made without Viktor having sent it.
No usage telemetry on the web, errors only.

## 2. Access

- One secret link for everyone: `https://sandstreampop.github.io/boels-bokklubb/#t=<token>`. The
  token is 128 random bits, base64url, in the fragment so GitHub's logs never see it. Without a
  token or a stored pass the page shows the title and nothing else.
- One four-digit PIN, separate from the family password. The family digits are the Supabase login
  and would give the browser write access; the web PIN gives read access only.
- `FEED_TOKEN` and `FEED_PIN` are Supabase function secrets, set by a new `feed` step in
  `scripts/setup.mjs` from environment variables of the same names. The step prints the link and
  the PIN. Rotation is rerunning the step with new values.
- A correct PIN returns a pass, stored in localStorage for a year. The pass is
  `<expiry>.<HMAC-SHA256 of the expiry, keyed by FEED_TOKEN + FEED_PIN>`, so rotating either secret
  invalidates every device with nothing stored on the server.
- Five wrong PINs lock the link for fifteen minutes, counted in one row of a new table
  `feed_attempts` (section 6). A wrong PIN also waits one second, and the comparison is constant
  time. Each failure is a `warn` in `app_events`. The lock applies to everyone holding the link.

## 3. Screens

Three screens, hash routes `#/`, `#/book/<id>`, `#/stats`. Swedish, icons over labels, no
explaining prose. Tokens from `lib/theme.ts`, Fredoka and Nunito from Google Fonts. No unicorn,
no sounds, no set pieces. Screens fade in, nothing else moves.

**PIN screen**: "Boels bokklubb" in display type and four digit boxes with the numeric keyboard.
Wrong PIN: the boxes shake and empty. Locked: "Vänta en stund" replaces the boxes and the page
retries when the lock has passed. Shown only when there is no valid pass.

**Library** (`app/index.tsx` without the plus button): the title "Boels bokklubb" with the rainbow
count beside it when there are rainbow books, the rainbow bar under it, the grid of covers with
the title under each, the rainbow ring on complete books, the rainbow initial placeholder for a
book without a cover. The title opens the stats. A cover opens the book. Pull to refresh becomes
a reload on open; the data is fetched when a screen is shown.

**Book page** (`app/book/[id].tsx` without mic, pencil, camera, crayon, and with the stars
read-only): the cover with its ring, the title and author, the stars as given, then the stream
of entries newest first. Each entry is `EntryCard.tsx` without the share button: the prompt in
muted type (a fill-in prompt wraps her words), her words in display type verbatim, photos and
drawings as in the app, the date. Audio entries have the round play button with the duration and
the transcript under it; a pending transcript shows the two grey bars, a failed one nothing.
Playback is the browser's Audio element, one at a time, tap to play and tap to pause. The empty
cover is not tappable. Back goes to the library.

**Stats** (`app/stats.tsx` without the share button): the six tiles of `StatTiles.tsx`, rainbow
books big, with the same icons and Swedish labels. Back goes to the library.

Entries are JPEG, PNG and m4a as the app writes them; Safari and Chrome show and play all three.

## 4. Data path

The page holds no Supabase key. A new edge function `supabase/functions/feed/index.ts`, deployed
like `transcribe` (Management API, `verify_jwt: false`, service role inside), answers four POSTs.
CORS allows the Pages origin only. Every request except the first is checked against the pass
before anything is read.

| Body | Answer |
| --- | --- |
| `{ token, pin }` | `{ pass, expiresAt }`, or 401 with `{ lockedUntil }` from the fifth failure |
| `{ pass, screen: 'library' }` | `{ books, stats }`: every book with `rating`, a signed cover URL and `complete`; the six totals |
| `{ pass, screen: 'book', id }` | `{ book, entries }`: the book and all its entries newest first, every `media_path` a signed URL |
| `{ pass, error }` | 204; the error becomes an `error` row in `app_events` with the page's breadcrumbs, source `feed` |

Signed URLs are valid six hours. `complete` and the totals are computed in the function exactly
as `isComplete` and `selectStats` in `lib/store.ts`: a book is complete with a rating, an audio
entry and a photo or drawing. Keep the two in step. Failures are logged to `app_events` as `warn`
or `error` with the request kind, never the PIN. Nothing is written for a successful request.

## 5. Code and checks

- `web/` holds `index.html`, `main.ts` (routing), `pin.ts`, `library.ts`, `book.ts`, `stats.ts`,
  `api.ts`, `telemetry.ts`, `app.css` and `fixture.json`, built by Vite with
  `base: '/boels-bokklubb/'` into `web/dist`. TypeScript, no framework. It imports `lib/theme.ts`,
  `lib/format.ts` and the fill-in helpers from `lib/prompts.ts`, nothing else from `lib/`.
  `web/tsconfig.json` has no React Native types, so an import that pulls one in fails the
  typecheck.
- `web/fixture.json` holds a library answer and a book answer with every entry shape (text, fill-in,
  audio done, audio pending, audio failed, photo, drawing, a book without a cover, a complete
  book). `node scripts/web.mjs check` builds, serves `web/dist`, loads each screen in Playwright
  Chromium with the fixture in place of the function, and fails on a console error or a missing
  element. It runs in `check.yml` after the bundle proof. Chromium stands in for Android Chrome;
  Safari is checked on Viktor's phone.
- npm scripts `web`, `web:build`, `web:check`, and Vite and Playwright as devDependencies, are added
  in the same commit as the migration so the fingerprint changes once.
- Telemetry on the web is a ring of breadcrumbs (route, fetch, play) and `captureError`, which
  posts to the function. Nothing else is recorded.

## 6. Data changes (migration 0004_feed.sql)

```sql
create table if not exists public.feed_attempts (
  key text primary key,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.feed_attempts enable row level security;
-- No policies: only the service role, inside the feed function, touches this table.
```

One row, key `link`. No change to `books`, `entries`, the buckets or their policies. The anon key
gains no read path.

A migration means a native build (CLAUDE.md), so build 8 is 1.1.0. Its "What to test" says there
is nothing new in the app and to open the web link instead.

## 7. Shipping

`scripts/ship.mjs auto` knows "update" and "native build". It gains "web":

- A change under `web/` or `supabase/functions/feed/` since the last ship builds the page, deploys
  `web/dist` to GitHub Pages (a `deploy-pages` job in `ship.yml`, Pages source "GitHub Actions"),
  and deploys the function through the Management API with the code `setup.mjs` already has (move
  it to `scripts/supabase.mjs`, call it from both). A push that also changes app files does both.
- `scripts/changelog.mjs`: `APP_PATHS` gains `web/` and `supabase/functions/feed/`. On ship the
  Unreleased lines land under the current build as `### Web (date)`. Same rules: one sentence, in
  Viktor's words, no file names.
- Secrets: nothing new in GitHub. `SUPABASE_URL` and `SUPABASE_ACCESS_TOKEN` deploy the function;
  the Pages job needs `pages: write` and `id-token: write`. `FEED_TOKEN` and `FEED_PIN` are set
  once from a session with `npm run setup feed` and never pass through CI.

## 8. Rule changes for CLAUDE.md

- Layout: "`web/` the read-only web version for relatives, a static Vite page on GitHub Pages. It
  talks only to the `feed` edge function and imports only React-Native-free modules from `lib/`."
- Product rules: "The web version is the app without create actions: library, book page, stats.
  One secret link, one four-digit PIN separate from the family password. No accounts, no replies,
  no share, no notifications, nothing in the app. No unicorn, no sounds."
- Shipping: "A change under `web/` or `supabase/functions/feed/` deploys the page to GitHub Pages
  and the function to Supabase. Its changelog lines land under `### Web`."
- Observability: "The web version logs errors through the `feed` function into `app_events`, never
  page loads or plays."
- Keys are in: `npm run setup feed` with `FEED_TOKEN` and `FEED_PIN` set, and GitHub Pages set to
  "GitHub Actions" under Settings → Pages.

## 9. Non-goals

No accounts or per-relative links, no replies, no share on the web, no email or push, no domain
yet, no add book, no recording, writing, photo, drawing or rating on the web, no search, no
editing, no unicorn or sounds, no page-view or play counting, no Android app, no parent-recorded
prompt clips (still "Later").

## 10. Order of work

1. Read CLAUDE.md, this file, `app/index.tsx`, `app/book/[id].tsx`, `app/stats.tsx`,
   `components/BookCard.tsx`, `components/EntryCard.tsx`, `components/StatTiles.tsx`,
   `components/Rainbow.tsx`, `supabase/functions/transcribe/index.ts`, `scripts/setup.mjs`,
   `scripts/ship.mjs`, `scripts/changelog.mjs`.
2. One native commit: migration 0004, the `feed` function, the `feed` setup step, `web/` with the
   PIN screen and the library, the npm scripts, Vite and Playwright, `scripts/web.mjs check` in
   `check.yml`, the `web` path in `ship.mjs` and the Pages job in `ship.yml`, the changelog gate
   paths, the CLAUDE.md rules, and Unreleased lines starting with "What to test: inget nytt i
   appen; öppna webblänken på telefonen." Typecheck, lint, doctor, web check, push. CI builds 1.1.0.
3. Viktor: set `FEED_TOKEN` and `FEED_PIN`, run `npm run setup feed`, set Pages to "GitHub
   Actions", send the link and PIN. Open on an iPhone and an Android phone.
4. Then one web ship each: the book page without audio; audio playback; the stats; fixes from what
   relatives report. Each: typecheck, lint, web check, changelog line, push.
5. After each ship, `npm run logs -- --since 1h` for `feed` errors before the next.
