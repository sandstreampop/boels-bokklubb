# Boels bokklubb

Boels egen läsdagbok. En iOS-app där hon lägger till böcker, skriver eller berättar vad hon tycker,
fotar och sätter stjärnor. Allt sparas i molnet och går att titta tillbaka på i åratal.

## Stack

- Expo SDK 58, React Native, TypeScript, Expo Router. Built in the cloud with EAS, shipped via TestFlight.
- Supabase: Postgres (`books`, `entries`), private storage buckets (`covers`, `media`), one family
  login, and an edge function that transcribes voice notes with OpenAI.
- Local-first: entries appear instantly and upload from a durable outbox when online.

## Secrets the setup script reads

Set these as environment secrets in the Claude Code cloud environment (never commit them):

| Name | What |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer team id |
| `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8_BASE64` | App Store Connect API key (Admin), p8 as one base64 line |
| `ASC_APP_ID` | The app's numeric Apple ID in App Store Connect |
| `EXPO_TOKEN` | Expo access token |
| `SUPABASE_URL`, `SUPABASE_ACCESS_TOKEN` | Supabase project URL and personal access token |
| `OPENAI_API_KEY` | For transcription, stored as an edge function secret |
| `BOKKLUBB_PASSWORD` | The family password |

Then `npm run setup`, or step by step: `node scripts/setup.mjs supabase env github eas testflight`.

The same secrets, plus `SUPABASE_URL` and `SUPABASE_ACCESS_TOKEN`, go into the repo's GitHub
Actions secrets (the `github` step does it where `gh` is logged in): CI ships.

## Day to day

    npm run typecheck && npm run lint
    # write a line under "## Unreleased" in docs/CHANGELOG.md, commit, push

A push to main ships by itself (`.github/workflows/ship.yml`): an over-the-air update for JavaScript
changes, a TestFlight build with a new version number when the native project changed. The
changelog section becomes TestFlight's "What to Test". `npm run update` and `npm run build:ios` do
the same thing by hand. `.github/workflows/testflight-refresh.yml` rebuilds on the 1st of every
month so the TestFlight build never expires.
