# Boels bokklubb

A private reading diary for Viktor's five-year-old daughter Boel. Native iOS app (Expo SDK 58,
React Native, TypeScript, Expo Router) with Supabase for the database, file storage, login and a
speech-to-text edge function. Distributed to the family through TestFlight internal testing.

Read AGENTS.md for the Expo-specific rules (fetch versioned docs, never trust memory for Expo APIs).

## Product rules, decided with Viktor

- Three screens only: library (grid of books, one plus button), add book (title required, author and
  cover optional), book page (one textbox, mic, camera, 1 to 5 star rating, stream of entries).
- The stream is append-only. Nothing in the app edits or deletes. Fixes happen via Supabase.
- No autocorrect, no spellcheck anywhere. Her spelling is the point. Every TextInput sets
  `autoCorrect={false} spellCheck={false} autoCapitalize="none"`.
- Recording: tap to start, tap to stop, no cancel path. Any tap stops and saves. Audio is written to
  the document directory and a marker file lets a crash still produce an entry on next launch.
- Transcription is a bonus. Audio is always kept. Swedish is hinted, not forced.
- Minimal text in the UI, icons over labels, no explaining prose. Swedish where words are needed.
- Look: pastel pink base, pastel rainbow accent, sparkle on stars and record button. Tokens in lib/theme.ts.
- One shared family login (email `familjen@boelsbokklubb.app`, password from `BOKKLUBB_PASSWORD`).
  The typed password is short digits; both app and setup script prefix it with `bokklubb-` for Supabase.
- Not building: admin screens, read status, editing, sharing, search.

## Layout

- `app/` routes: `index.tsx` library, `book/new.tsx`, `book/[id].tsx`, `_layout.tsx` auth gate.
- `components/` UI. `lib/` data: `store.ts` local-first state, `outbox.ts` durable upload queue,
  `actions.ts` what screens call, `media.ts` local file cache, `sync.ts` server pull, `recording.ts`
  crash recovery.
- `supabase/migrations` schema and storage policies. `supabase/functions/transcribe` edge function.
- `scripts/setup.mjs` provisions everything from environment secrets. `scripts/eas-drive.py` answers
  EAS prompts for the first interactive iOS credential setup.
- `.github/workflows/testflight-refresh.yml` rebuilds monthly so TestFlight builds never expire.

## Commands

    npm run typecheck   # tsc --noEmit
    npm run lint        # expo lint
    npm run setup       # provision Supabase, EAS, GitHub secrets, TestFlight group (needs secrets)
    npm run build:ios   # eas build --platform ios --profile production --auto-submit

Run typecheck and lint before committing. Commit to main and push; the repo is Viktor's own.

## When Viktor says "keys are in"

The environment secrets listed in README.md are present. Every step in `scripts/setup.mjs` is
idempotent; rerun a step name after fixing its cause. Node's fetch ignores the proxy, so run every
step with `NODE_USE_ENV_PROXY=1`.

State after the 2026-10-25 session: `supabase`, `user`, `env`, `eas` (credentials created, build 1
submitted) and `testflight` (group "Familjen", Viktor added) are all done. EAS submit reads the app
id and team id literally from eas.json; only the `ascApiKey*` fields expand `$VAR`.

Still open: `github`. The cloud proxy returns 403 on the GitHub Actions secrets API, so the monthly
refresh workflow has no secrets until Viktor adds `EXPO_TOKEN`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and
`ASC_KEY_P8_BASE64` by hand in the repo's Settings → Secrets and variables → Actions (or runs
`node scripts/setup.mjs github` from a machine where `gh` is logged in).

New builds: `npm run build:ios`, or `eas submit --platform ios --profile production --latest` to
resubmit a finished build. Signing is already set up, so no interactive prompts are needed.
