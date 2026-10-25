# PRD: changelog process

Small, to be implemented by whichever session next touches `scripts/ship.mjs` (the build 6 session
at its end, or a separate short one). Do not implement it in parallel with build 6 on main: it edits
the ship script and package.json, which that session also uses.

## Goal

Viktor can always answer "what's new in the build on my phone" in two places: TestFlight's
"What to Test" for native builds, and `docs/CHANGELOG.md` for everything including over-the-air
updates. Writing the entry is part of shipping, not an afterthought.

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

## Writing rules

- Lines are for Viktor and relatives, one sentence each, no file names, no machine names.
- Start with the change, not "Fixed:" or "Added:"; a fix says what works now.
- A build section begins with one line "What to test:" naming the thing to try.

## Done means

An entry cannot be forgotten (the scripts refuse), TestFlight shows the section for the next native
build without anyone pasting it, and the changelog has a section for every build and update that
exists on EAS as of the implementing session, back-filled from `docs/CHANGELOG.md` as it stands.
