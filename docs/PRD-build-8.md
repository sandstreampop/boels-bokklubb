# PRD: build 8, "släkten"

Written 2026-10-25, after builds 6 and 7 and the shipping pipeline had landed, for the session
that implements it. Every decision below was made with Viktor one question at a time; do not
reopen them. Ask when something is impossible or contradicts the product rules in CLAUDE.md.

## 1. Goal and the facts that shape it

Goal: relatives can see what Boel made without Viktor sending each card by hand. A read-only web
page, "flödet", shows the same cards the app shares, newest first, with her voice playable.

Facts from Viktor:

- The readers are a mix: grandparents on iPhones and at least one person on Android. Design for
  Safari on iOS and Chrome on Android, large type, tap to play. Desktop must work, nothing more.
- Nothing in the iOS app changes. The app stays four screens, Boel never sees that a feed exists,
  and the no-admin rule holds. The link and the PIN come out of the setup script and Viktor pastes
  them into Messenger once.
- Nothing flows back. No hearts, no comments, no "seen". Replies happen in Messenger, between
  adults. The words are hers and the stream stays append-only.
- Nothing pushes. No email, no digest, no unread markers. The page is fresh when opened and the
  Messenger thread is the nudge, when Viktor feels like it.
- Viktor does not own a domain. The page ships at `https://sandstreampop.github.io/boels-bokklubb/`
  and a custom domain can be added any day with a CNAME file and no code change.

Success looks like: within a month a relative brings up something Boel made without Viktor having
sent it. Observed in conversation, never in a table. The feed has no usage telemetry of any kind;
errors only, like the app.

## 2. Access: one link, one PIN

- **The link** is one secret URL, the same for every relative:
  `https://sandstreampop.github.io/boels-bokklubb/#t=<token>`. The token is 128 bits of randomness,
  base64url, and lives in the fragment so it never reaches GitHub's request logs. Without the
  token the page shows nothing but the title.
- **The PIN** is four digits, separate from the family password. The family digits are the app's
  Supabase login and would give the browser write access; the feed PIN gives read access only, so
  a forwarded link plus PIN can never post, change or delete anything.
- Both are Supabase function secrets, `FEED_TOKEN` and `FEED_PIN`, set by a new `feed` step in
  `scripts/setup.mjs` from the environment variables of the same names. The step prints the link
  and the PIN for Viktor to paste into Messenger. Rotation is rerunning the step with new values;
  every device then has to type the new PIN.
- **The device remembers**: a correct PIN gives the browser a pass that is stored in localStorage
  for a year. The pass is `<expiry>.<HMAC-SHA256 over the expiry, keyed by FEED_TOKEN + FEED_PIN>`,
  so rotating either secret kills every pass at once with nothing stored server side. A new
  device, an expired pass or a rotation shows the PIN screen again.
- **Lockout**: five wrong PINs lock the link for fifteen minutes. One row in a new table
  `feed_attempts` (migration 0004, section 6) counts failures and holds `locked_until`; a correct
  PIN resets it. Locked or not, a wrong PIN also costs a one second delay and the comparison is
  constant time. Every failure is a `warn` in `app_events`. A locked link locks the family out too
  for those minutes, accepted: this is a family feed, not a bank.

## 3. The page

One route, two states, Swedish, minimal text, icons over labels, as in the app. The look is the
app's: tokens from `lib/theme.ts`, Fredoka and Nunito from Google Fonts, pastel pink background,
white cards, rainbow as the only accent. No unicorn, no sounds, no set pieces: the feed is the
card, and cards never carry the unicorn (CLAUDE.md). A gentle fade as cards arrive is the only
motion.

**PIN screen**: "Boels bokklubb" in display type, four digit boxes, numeric keyboard, no explaining
prose. Wrong PIN: the boxes shake and empty. Locked: the boxes are replaced by "Vänta en stund"
and the page retries by itself when the lock has passed. The pass is checked on load, so a
returning relative never sees this screen.

**Feed screen**, top to bottom:

1. A totals strip: the six tiles of the stats card (rainbow books big, then books, voices,
   thoughts, photos, drawings) with the same icons and Swedish labels as `StatTiles.tsx`.
2. The stream: every entry across every book, newest first, thirty at a time, each rendered as the
   share card of build 6 at the column width (max 540 px, centred): the cover or rainbow initial
   top left, title and stars beside it, the prompt in muted type, her words verbatim in display
   type (a fill-in prompt wraps around them, exactly as `ShareCard.tsx` does), the date, a rainbow
   bar. Photos and drawings fill the middle with the prompt as caption; drawings are contained on
   white, photos cover.
3. Audio entries carry a round play button with the duration, and the transcript under it when
   there is one; a pending or failed transcript shows the mic and "…" in muted type, like the app.
   Playback is the browser's Audio element, one at a time, tap to play and tap to pause. iOS blocks
   autoplay, so nothing autoplays anywhere.
4. One button, "Fler", under the last card, which fetches the next thirty older cards. It disappears
   when there are no more. Nothing is ever truncated.

Entries are JPEG, PNG and m4a as the app writes them, which Safari and Chrome both play. HEIC is
accepted by the bucket but the camera path writes JPEG; if a HEIC ever appears in the feed, the
card shows the rainbow placeholder and the function logs a `warn`.

## 4. Data path: one edge function

The static page holds no Supabase key and never talks to the database or storage directly. A new
edge function `supabase/functions/feed/index.ts`, deployed like `transcribe` (Management API,
`verify_jwt: false`, service role inside), answers three POSTs. CORS allows the Pages origin only.

| Body | Answer |
| --- | --- |
| `{ token, pin }` | `{ pass, expiresAt }`, or 401 with `{ lockedUntil }` after the fifth failure |
| `{ pass, before? }` | `{ stats, entries, books }`: the six totals, the thirty newest entries before the ISO date `before` (newest first), and the books they belong to; every `media_path` and `cover_path` replaced by a signed URL valid six hours |
| `{ pass, error }` | 204; the error becomes an `error` row in `app_events` with the page's breadcrumbs, source `feed` |

Every request is checked against the pass before anything is read. The totals are computed in the
function exactly as `selectStats` in `lib/store.ts` does (a book is rainbow when it has a rating,
an audio entry and a photo or drawing); keep the two in step. Function failures and PIN failures
are logged to `app_events` as `warn` or `error` with the request kind, never with the PIN. No row
is ever written for a successful page load: the feed has no usage telemetry.

## 5. Code, folder, checks

- `web/` holds the page: `index.html`, `main.ts`, `card.ts`, `pin.ts`, `api.ts`, `feed.css`, built
  by Vite with `base: '/boels-bokklubb/'` into `web/dist`. TypeScript, no framework: a list of cards
  does not need one. It imports `lib/theme.ts`, `lib/format.ts` and the fill-in helpers of
  `lib/prompts.ts`, and nothing else from `lib/`: `web/tsconfig.json` has no React Native types, so
  a module that pulls one in fails the typecheck.
- `web/fixture.json` is a feed answer with every card shape (text, fill-in, audio done, audio
  pending, photo, drawing, book without cover, the totals). `node scripts/web.mjs check` builds the
  page, serves `web/dist`, loads it in Playwright Chromium with the fixture injected in place of the
  function, and fails on any console error or a card that did not render. It runs in `check.yml`
  after the bundle proof. Chromium stands in for Android Chrome; Safari is tested on Viktor's phone.
- npm scripts `web`, `web:build` and `web:check` are added in the same commit as the migration, so
  the fingerprint changes once, inside build 8. Vite and Playwright are devDependencies.
- Telemetry on the page is the app's shape in miniature: a ring of breadcrumbs (route, fetch,
  play, more) and `captureError` posting to the function. Nothing else is recorded.

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

One row, key `link`. No change to `books`, `entries`, storage buckets or their policies: the feed
reads through the service role inside the function and the anon key never gains a read path.

A migration means the ship is a native build (CLAUDE.md), so build 8 is 1.1.0 and its "What to
test" says: nothing new in the app; open the feed link on your phone instead.

## 7. Shipping: a third path

`scripts/ship.mjs auto` knows "update" and "native build". It gains "feed":

- A change under `web/` or `supabase/functions/feed/` since the last ship builds the page, deploys
  `web/dist` to GitHub Pages (a `deploy-pages` job in `ship.yml`, source "GitHub Actions"), and
  deploys the function through the Management API with the same code `setup.mjs` uses (move that
  into `scripts/supabase.mjs` and call it from both). A push that also changes app files does both
  paths; the Pages deploy runs first because it cannot break the app.
- `scripts/changelog.mjs`: `APP_PATHS` gains `web/` and `supabase/functions/feed/`, so a feed change
  without an Unreleased line is refused like any other. On ship the lines land under the current
  build as `### Flödet (date)`, in Viktor's words, one sentence each, no file names. The totals
  strip arriving reads "Farmor ser de sex siffrorna överst i flödet", not "StatTiles ported".
- Secrets: nothing new in GitHub. `SUPABASE_URL` and `SUPABASE_ACCESS_TOKEN` deploy the function;
  Pages needs the `pages: write` and `id-token: write` permissions on the job. `FEED_TOKEN` and
  `FEED_PIN` are set once from a session by `npm run setup feed` and never pass through CI.

## 8. Rule changes for CLAUDE.md

- Add to the layout list: "`web/` the relatives' feed, a static page on GitHub Pages; it talks only
  to the `feed` edge function and imports only React-Native-free modules from `lib/`."
- Add to product rules: "The feed is read only and one way: one secret link, one four-digit PIN
  separate from the family password, no accounts, no replies, no notifications, nothing in the app.
  It shows the share cards, newest first, with her voice playable. No unicorn, no sounds."
- Add to shipping: "A change under `web/` or `supabase/functions/feed/` ships the page to GitHub
  Pages and the function to Supabase; its changelog lines land under `### Flödet`."
- Add to telemetry: "The feed logs errors through the `feed` function into `app_events`, never page
  loads or plays."
- Add to "When Viktor says keys are in": `npm run setup feed` with `FEED_TOKEN` and `FEED_PIN` set,
  and GitHub Pages switched to "GitHub Actions" under Settings → Pages.

## 9. Non-goals

No accounts or per-relative links, no replies or hearts, no email or push, no custom domain yet,
no per-book navigation (the stream is the whole page), no search, no editing, no unicorn or
sounds on the web, no page-view or play counting, no Android app, no parent-recorded prompt clips
(still "Later" in the roadmap).

## 10. Order of work for the implementing session

1. Read CLAUDE.md, this file, `components/ShareCard.tsx`, `components/StatTiles.tsx`,
   `supabase/functions/transcribe/index.ts`, `scripts/setup.mjs`, `scripts/ship.mjs`,
   `scripts/changelog.mjs`.
2. One commit, native: migration 0004, the `feed` function, the `feed` setup step, `web/` with the
   PIN screen and the stream (no audio, no totals yet), the npm scripts, Vite and Playwright,
   `scripts/web.mjs check` wired into `check.yml`, the `feed` path in `ship.mjs` and the Pages job
   in `ship.yml`, the changelog gate paths, the CLAUDE.md rules, and the Unreleased lines starting
   with "What to test: inget nytt i appen; öppna länken till flödet på telefonen." Typecheck, lint,
   doctor, `node scripts/web.mjs check`, push. CI builds 1.1.0.
3. Tell Viktor: set `FEED_TOKEN` and `FEED_PIN`, run `npm run setup feed`, switch Pages to
   "GitHub Actions", paste the link and PIN into Messenger. Open the link on an iPhone and an
   Android phone, type the PIN, scroll.
4. Over the web after that, one ship each: audio playback; the totals strip and "Fler"; polish from
   what relatives say. Each: typecheck, lint, web check, changelog line, push.
5. After each ship, `npm run logs -- --since 1h` for `feed` errors before starting the next.
