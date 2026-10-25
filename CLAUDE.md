# Boels bokklubb

A private reading diary for Viktor's five-year-old daughter Boel. Native iOS app (Expo SDK 58,
React Native, TypeScript, Expo Router) with Supabase for the database, file storage, login and a
speech-to-text edge function. Distributed to the family through TestFlight internal testing.

Read AGENTS.md for the Expo-specific rules (fetch versioned docs, never trust memory for Expo APIs).
The plan lives in docs/ROADMAP.md; build specs are docs/PRD-build-6.md, docs/PRD-build-7.md and
next docs/PRD-build-8.md (the relatives' feed), and docs/PRD-changelog.md is the shipping pipeline (implemented 2026-10-25: sessions push, CI
ships). Start there. Telemetry is for finding bugs, never for measuring usage.

## Product rules, decided with Viktor

- Four screens only: library (grid of books, one plus button, the title opens the stats), add book
  (a three-step wizard, one thing per screen with a progress strip: picture, title, author; title
  required, author and cover optional; no drawing here, a cover is drawn on the book page), book page (mic, pencil, camera, crayon, 1 to 5 star
  rating, stream of entries), stats (six totals, no time axis). Writing and drawing are full-screen
  modes like recording.
- The stream is append-only. Nothing in the app edits or deletes. Fixes happen via Supabase.
- No autocorrect, no spellcheck anywhere, and the keyboard always opens in caps: she writes in
  capitals. Her spelling is the point. Every TextInput sets
  `autoCorrect={false} spellCheck={false} autoCapitalize="characters"`.
- Recording: the mic opens the recording mode with the prompt and one record button; recording starts
  when she presses that button, and from then on any tap stops and saves, no cancel path. Before
  the button is pressed a tap outside it just closes the mode. Audio is written to the document
  directory and a marker file lets a crash still produce an entry on next launch.
- Transcription is a bonus. Audio is always kept. Swedish is hinted, not forced.
- Minimal text in the UI, icons over labels, no explaining prose. Swedish where words are needed.
- Prompts are text, one random of fifty per pool, stored on the entry. No voice prompts. The magic
  wand rerolls a prompt anywhere one is shown.
- Share is a visible share button on every entry card and on the stats. It never sends at once: a
  sheet previews the card with Share and Cancel first.
- Photos are taken with the camera, never chosen from the gallery.
- A book with stars, a recording and a picture is complete and wears the rainbow ring. Derived,
  never stored.
- Look: pastel pink base, pastel rainbow accent, sparkle on stars and record button. Tokens in lib/theme.ts.
- One shared family login (email `familjen@boelsbokklubb.app`, password from `BOKKLUBB_PASSWORD`).
  The typed password is short digits; both app and setup script prefix it with `bokklubb-` for Supabase.
- Not building: admin screens, read status, editing, sharing, search.

Build 7 ("bedazzle", docs/PRD-build-7.md), decided with Viktor:

- A unicorn companion lives top right on every screen. After the launch animation she is at rest
  and moves only when something happens: a tap (a trick), an entry saved, a book gone rainbow. No
  idle animation, no hints. She reacts to the app and to taps, never to usage data, and never
  appears on share cards.
- Sound is a layer: the app is complete on mute, follows the ring switch, and is silent while the
  mic is open. No music.
- Motion uses the presets in lib/motion.ts. Three set pieces exist: launch, entry saved, rainbow
  book. Do not add a fourth without Viktor.
- Telemetry is for bugs. No usage counters, no funnels.
- Credits: every third-party asset is listed in docs/CREDITS.md with its licence.

## Rule: validate where the artifact is produced

Anything the app cannot run without is validated where the artifact is produced, never in a
checklist. If a mistake shipped once, add the check that would have refused it, in code or in CI,
in the same fix. The first instance: `app.config.ts` throws without `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, because `eas update --environment production` ignores the
committed `.env` and reads EAS environment variables (two updates shipped without them on
2026-10-25). `scripts/setup.mjs env` keeps `.env` and the EAS variables for production, preview and
development in step. `node scripts/ship.mjs prove` (run by check.yml on every push and by every
update before publishing) exports under `eas env:exec production` with sentinel values in the
process environment and refuses unless the real hostname, not the sentinel, is in the bundle; the
update then publishes exactly that export. And `lib/supabase.ts` throws at load, after writing a
fatal telemetry event, if a bundle without the values ever reaches a phone, so expo-updates falls
back to the embedded bundle.

## Architecture: state machines first

Every flow with more than one step is an XState v5 machine in `lib/machines/`, and screens are thin:
they render machine state and send events. Shared data lives in an `@xstate/store` store
(`lib/store.ts`). This is a rule, not a preference: it is what keeps the app understandable for
Viktor and for the next session, and the store's cached selectors make the render-loop crash of
build 1 impossible by construction.

- `machines/app.ts` boot, session, sign-in. Provided at the root as `AppActor`.
- `machines/outbox.ts` the durable upload queue (one module-level actor; `enqueue` from actions).
- `machines/recorder.ts` permission → prepare → recording → stopping → done. Owned by RecorderOverlay.
- `machines/newBook.ts` the add-book form. `machines/book.ts` the book page: write, photo, record, rate,
  and the prompts (it owns what the wand rerolls). `machines/writer.ts` full-screen writing.
- `machines/inspect.ts` turns every transition into a telemetry breadcrumb and reports actor errors.
  Pass `{ inspect }` to every `useMachine`, `createActor` and `createActorContext`.

Rules: side effects live in machine actions or invoked promise actors, never in `useEffect` chains
(the only allowed effects are bridging a machine to a prop or a native hook, as RecorderOverlay does).
A new screen gets a machine; a new background process gets an actor. Draw the state diagram in the
file header comment. Reads from the store go through `useStore(selector)` and the `select*` helpers.

## Layout

- `app/` routes: `index.tsx` library, `book/new.tsx`, `book/[id].tsx`, `stats.tsx`, `_layout.tsx` auth gate.
- `components/` UI. `lib/` data: `store.ts` local-first state, `machines/` flows (see above),
  `actions.ts` what machines call to create things, `media.ts` local file cache, `sync.ts` server
  pull, `recording.ts` crash recovery, `telemetry.ts` observability, `prompts.ts` the three pools.
- `supabase/migrations` schema and storage policies. `supabase/functions/transcribe` edge function.
- `app.config.ts` the Expo config (refuses to evaluate without the Supabase values).
- `scripts/setup.mjs` provisions everything from environment secrets. `scripts/eas-drive.py` answers
  EAS prompts for the first interactive iOS credential setup. `scripts/ship.mjs` ships (CI and the
  escape hatch), `scripts/changelog.mjs` reads and writes docs/CHANGELOG.md, `scripts/asc.mjs` talks
  to App Store Connect (processing state, "What to Test"), `scripts/eas.mjs` wraps eas-cli.
- `.github/workflows/check.yml` on every push and PR, `ship.yml` on push to main (see Shipping),
  `testflight-refresh.yml` rebuilds monthly so TestFlight builds never expire.

## Observability (the testing loop)

Every screen, action and background job logs to `lib/telemetry.ts`, which buffers to a file and
ships to the `app_events` table. Uncaught errors, unhandled rejections, console.error/warn, render
crashes (via `components/ErrorBoundary.tsx`) and abnormal exits (launch marker) are all captured
with the breadcrumbs before them. When Viktor reports something broke: `npm run logs -- --since 1h`
then `npm run logs -- --session <id>` for the full trail of that launch. New code must log through
`info`/`warn`/`captureError`/`traced`, never swallow an error silently, and use `useScreen` in new
screens. Run `npx expo-doctor` before every build: a missing native peer dependency crashes a
TestFlight build without any JS error.

## Shipping: sessions push, CI ships

A session's job ends at "typecheck, lint, doctor, changelog line, commit, push". A push to main
runs `.github/workflows/ship.yml`: first `check.yml` (typecheck, lint, expo-doctor, the changelog
gate, the bundle proof), then `node scripts/ship.mjs auto`, which ships an over-the-air update or,
when package.json, package-lock.json, app.config.ts, eas.json or a migration changed (or the subject
says `[native]`), a TestFlight build with migrations applied first. Runs queue, so two sessions can
no longer publish each other's half-done tree. Sessions do not run `npm run update` or
`npm run build:ios` unless Viktor asks; they are the manual escape hatch and call the same script.

- Every commit that changes what Boel sees adds a line under `## Unreleased` in docs/CHANGELOG.md,
  in Viktor's words, one sentence, starting with the change (a fix says what works now), no file
  or machine names. `check.yml` refuses a push that changes app/, components/, lib/ or assets/
  without one. A native build also needs one line `What to test: …` first.
- On ship the Unreleased lines become `### Update <id> (date)` under the current build, or
  `## x.y.0 (build N, date, TestFlight)` for a native build, committed as `Changelog: …` with
  `[skip ci]` and pushed. The update message on EAS is the same lines, prefixed with the version.
- Every native build is a new version: the ship bumps the minor of `version` in app.config.ts
  (build 8 is 1.1.0; major stays 1 until Viktor says). Never bump it by hand between builds: the
  runtime version is a fingerprint that includes the config, and a bump in the tree would stop
  updates reaching the installed build. Updates never change the version.
- After a native build the ship waits for Apple to process it and writes the section into
  TestFlight's "What to Test" (scripts/asc.mjs, Swedish locale). Nothing in the app shows a version.
- `testflight-refresh.yml` is the same native ship monthly, with "Monthly refresh, nothing new".

## Commands

    npm run typecheck   # tsc --noEmit
    npm run lint        # expo lint
    npm run logs        # tail app telemetry (--since 2h, --level warn, --session <id>, --sessions, --follow)
    npm run migrate     # apply supabase/migrations through the Management API
    npm run setup       # provision Supabase, EAS, GitHub secrets, TestFlight group (needs secrets)
    node scripts/changelog.mjs check   # what check.yml asks: a changelog line for every change Boel sees
    npm run update      # manual escape hatch: the over-the-air ship CI would do (refuses without Unreleased lines)
    npm run build:ios   # manual escape hatch: the native ship (bump, changelog, build, submit, What to Test, 40 min)
    NODE_USE_ENV_PROXY=1 node --no-warnings scripts/ship.mjs prove   # the bundle proof alone
    NODE_USE_ENV_PROXY=1 node --no-warnings scripts/asc.mjs builds   # what Apple has, with processing state
    NODE_USE_ENV_PROXY=1 node --no-warnings scripts/eas.mjs …        # any other eas-cli command, with .env loaded

Do not add npm scripts between native builds: package.json scripts are part of the runtime
fingerprint, and a changed fingerprint means updates no longer reach the installed build.

Run typecheck and lint before committing. Commit to main and push; the repo is Viktor's own. CI
ships what was pushed.

## When Viktor says "keys are in"

The environment secrets listed in README.md are present. Every step in `scripts/setup.mjs` is
idempotent; rerun a step name after fixing its cause. Node's fetch ignores the proxy, so run every
step with `NODE_USE_ENV_PROXY=1`.

State after the 2026-10-25 session: `supabase`, `user`, `env`, `eas` (credentials created, build 1
submitted) and `testflight` (group "Familjen", Viktor added) are all done. EAS submit reads the app
id and team id literally from eas.json; only the `ascApiKey*` fields expand `$VAR`.

`github`: the cloud proxy returns 403 on the GitHub Actions secrets API, so Viktor added `EXPO_TOKEN`,
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `APPLE_TEAM_ID`, `ASC_APP_ID`, `SUPABASE_URL`
and `SUPABASE_ACCESS_TOKEN` by hand. Done 2026-10-25: they live in the GitHub environment named `main` (Settings →
Environments), which every workflow job declares with `environment: main`; a secret added as a
plain repository secret would also work. A failed Ship run is rerun from the Actions tab; nothing
is lost, the Unreleased lines wait.

The app checks for an update on every launch and waits up to 3 s for it, so a shipped update is
live on the phone after one relaunch; `npm run logs` shows the running update id in the `app`
column and TestFlight shows version and build on the install screen.
