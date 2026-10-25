# PRD: shipping pipeline (changelog, versions, CI)

To be implemented by a session of its own once build 6 is on the phone, or by the build 6 session
at its end. Do not implement it in parallel with build 6 on main: it edits the ship script and
package.json, which that session uses, and it changes who is allowed to ship.

## Goal

Viktor can always answer "what's new in the build on my phone" in two places: TestFlight's
"What to Test" for native builds, and `docs/CHANGELOG.md` for everything including over-the-air
updates. Writing the entry is part of shipping, not an afterthought. And shipping happens from CI
on push to main, not from whichever session happens to hold the secrets.

## CI owns shipping

Decided with Viktor: the scripts below run in GitHub Actions, not in sessions. A session's job ends
at "typecheck, lint, doctor, changelog line, commit, push". Reasons: main is the single source of
truth for the production channel (two parallel sessions can no longer publish each other's
half-done tree), the Apple and Expo secrets live in one place, and the audit trail is the Actions
log.

Workflows in `.github/workflows/`:

1. `check.yml`, on every push and pull request: `npm ci`, typecheck, lint, `expo-doctor`, and a
   changelog check: if anything under `app/`, `components/`, `lib/` or `assets/` changed since the
   last shipped section, `## Unreleased` must have at least one line. Fails otherwise.
2. `ship.yml`, on push to main, after check passes, concurrency group `ship` so runs queue:
   - decides native versus update from the diff against the last shipped commit: `package.json`,
     `package-lock.json`, `app.json`, `eas.json` or anything under `supabase/migrations/` changed
     means native build (and migrations run first with `npm run migrate`); otherwise an update.
     A `[native]` tag in the commit subject forces a build.
   - update: `eas update --channel production --environment production --non-interactive` with
     the Unreleased lines as the message; then moves Unreleased into `### Update <id>` and
     pushes the changelog commit with `[skip ci]`.
   - native: bumps the minor version, moves Unreleased into `## x.y.0 (build N, date, TestFlight)`,
     pushes that commit with `[skip ci]`, runs `eas build --auto-submit --non-interactive`, waits,
     polls App Store Connect until processed, writes "What to Test".
3. `testflight-refresh.yml` stays for the monthly expiry rebuild and gets the same version bump
   and changelog section (text: "Monthly refresh, nothing new").

Secrets in the repo: the six Apple and Expo ones Viktor adds by hand, plus `SUPABASE_URL` and
`SUPABASE_ACCESS_TOKEN` for migrations. The default `GITHUB_TOKEN` with `contents: write` pushes
the changelog commits.

`npm run update` and `npm run build:ios` remain as the manual escape hatch and call the same
scripts, so CI and a laptop never disagree about what a ship does. Sessions do not run them unless
Viktor asks.

## How it works

1. `docs/CHANGELOG.md` is the single source. Top section is `## Unreleased`. Every commit that
   changes what Boel sees adds a line there, in Viktor's words, not the commit's.
2. `npm run update` and `npm run build:ios` refuse to run when `## Unreleased` is empty.
3. On ship, the script moves the Unreleased lines into a new dated section:
   `## Build N (date, TestFlight)` for a native build (N read from EAS after the build is created),
   or `### Update <first 8 of the update id> (date)` under the current build for an update. It
   commits that change with the message `Changelog: build N` or `Changelog: update <id>` and
   pushes.
4. For a native build, the script also sets TestFlight's "What to Test" to the new section's text
   through the App Store Connect API, once Apple has processed the build: poll `builds` for
   `processingState = VALID`, then `PATCH /v1/betaBuildLocalizations` (create one for locale `sv`
   with `whatsNew`, max 4000 characters). The token helper in `scripts/setup.mjs` already signs
   these requests; move it to a shared `scripts/asc.mjs`.
5. For an update, the update message passed to EAS is the Unreleased lines joined, so the EAS
   dashboard matches the changelog.
6. `npm run logs -- --sessions` already prints the build and the running update id, so a line in
   the changelog can be matched to what a phone is running.

## Version numbers

The app has sat at 1.0.0 since build 1. From build 6 on, every native build is a new version:

- `npm run build:ios` bumps the minor of `expo.version` in app.json before building: build 6 is
  1.1.0, build 7 is 1.2.0. Major stays 1 until Viktor says otherwise. The script commits the bump
  together with the changelog section (`Changelog: 1.1.0 (build 6)`). The build number keeps
  auto-incrementing on EAS as today.
- Over-the-air updates cannot change the version a phone shows, so they do not bump it. They are
  listed under the version they belong to as `### Update <id>`, and the update message is prefixed
  with the version (`1.1.0: …`) so the EAS dashboard reads the same way.
- The bump happens only at native build time, never between builds: the runtime version is a
  fingerprint that includes app.json, so a version change in the working tree would stop updates
  from reaching the installed build until the next native build.
- TestFlight shows version and build on the install screen, so Viktor can match them to the
  changelog without opening the repo. Nothing in the app shows a version; no explaining prose.
- Changelog section titles become `## 1.1.0 (build 6, date, TestFlight)`; the existing 1.0.0
  sections stay as they are.

## Invariant: a bundle without its Supabase config cannot exist

What happened on 2026-10-25: `eas update --environment production` ignores the committed `.env`
(it sets `EXPO_NO_DOTENV=1` and uses EAS environment variables), EAS had none, so two updates
shipped with an empty Supabase URL and the app showed "Appen saknar inställningar för databasen".
Nobody remembered a rule; a rule would not have helped. Four layers, each of which alone would have
stopped it, and none of which depend on anyone remembering:

1. **The config refuses to evaluate.** Replace `app.json` with `app.config.ts`. It reads
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` and throws with a plain message
   when either is empty or not an `https://*.supabase.co` URL. `expo export` (which every
   `eas update` runs), `eas build`, `expo start` and `expo-doctor` all evaluate the config first,
   so no bundle, build or dev server can come into being without the values. Local work keeps
   using `.env`; EAS uses its environment variables; both go through the same check.
2. **One source of truth for EAS.** `scripts/setup.mjs env` writes `.env` and also upserts the
   same two values as plaintext EAS environment variables for `production`, `preview` and
   `development` (`eas env:create` / `env:update`). The step is idempotent and runs in `npm run
   setup`, so a fresh project cannot reach a build without them.
3. **The pipeline proves the bundle.** `ship.yml`, before publishing, runs `expo export` under the
   same environment flags EAS uses and greps the exported JS for the Supabase hostname. No
   hostname, no publish, and the job output names the missing variable. The same assertion runs
   in `check.yml` on every push with `EXPO_NO_DOTENV=1` and `eas env:exec --environment
   production`, so a broken EAS environment fails CI before anyone ships.
4. **The app refuses the bundle.** `lib/supabase.ts` drops the placeholder client. If the values
   are missing at runtime and the launch is an over-the-air bundle (`Updates.isEmbeddedLaunch` is
   false), the module writes a fatal event to the local telemetry file and throws at load.
   expo-updates treats a crash during launch of a new update as a failed update and starts the
   embedded bundle next time, which passed layer 1 when it was built. The Login hint "Appen saknar
   inställningar" goes away; it only ever displayed the symptom.

Layer 1 is the one that makes the state impossible; 2 to 4 make the failure loud if 1 is ever
bypassed. Implement 1 and 2 first, in the same session that does the pipeline.

The general rule this encodes, for CLAUDE.md: "Anything the app cannot run without is validated
where the artifact is produced, never in a checklist. If a mistake shipped once, add the check
that would have refused it, in code or in CI, in the same fix."

## Writing rules

- Lines are for Viktor and relatives, one sentence each, no file names, no machine names.
- Start with the change, not "Fixed:" or "Added:"; a fix says what works now.
- A build section begins with one line "What to test:" naming the thing to try.

## Done means

An entry cannot be forgotten (check.yml refuses), a push to main ships by itself as an update or a
native build, every native build has a new version number and TestFlight shows the section for it
without anyone pasting it, the changelog has a section for every build and update that exists on
EAS as of the implementing session, and CLAUDE.md says that sessions push and CI ships.
