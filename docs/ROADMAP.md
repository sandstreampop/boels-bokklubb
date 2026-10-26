# Roadmap

Decided with Viktor on 2026-10-25 after builds 1 to 5. One line per item; the details for the next
build live in a PRD next to this file. Items move, nothing here is a promise to a five-year-old.

## Done: builds 1 to 5 (the base)

- Library, add book, book page with text, voice, photo and stars. Append-only stream.
- Local-first store, durable upload queue, transcription, crash recovery for recordings.
- Observability: every action and machine transition logged, crashes and abnormal exits reported,
  `npm run logs` reads it. State machines for every flow (XState), store with cached selectors.
- Over-the-air updates: `npm run update` lands a JavaScript change on the phone in a minute.

## Next: build 6, "she asks for it" (docs/PRD-build-6.md)

The goal is pull: Boel wants to open it, talk, write, draw, and Viktor wants to screenshot it.

1. Prompts: a random one of fifty for speaking, writing and drawing, stored on the entry.
2. Reward: auto-play her voice right after recording; every new entry bounces in with sparkle.
3. Full-screen writing mode with fill-in prompts.
4. Rainbow ring on completed books (stars + voice + picture); a stats screen behind the title.
5. Native build: view capture and share sheet. Drawing canvas, drawing as cover.
6. Share cards: long-press an entry or the stats to send an image to Messenger.

Shipped as over-the-air slices in that order; only item 5 needs a TestFlight build.

## Build 7: "bedazzle" (docs/PRD-build-7.md, after every build-6 feature has landed)

Shipped 2026-10-25: TestFlight build 7 and four updates. Amended with Viktor on the phone: the
unicorn's home is top right and she rests between cues (no idle hints).

A sprint that takes every interaction from simple to enchanting, the way Bolibompa or Gabby's
Dollhouse hold a five-year-old. Decided: a unicorn companion (Rive, CC BY art), always on screen,
reacting to the app and to taps, with a non-verbal voice; one motion vocabulary everywhere and three
set pieces (launch, entry saved, rainbow book); sound as a layer that follows the ring switch.
Principles:

- Every tap answers: a squish, a sparkle, a sound. Every save celebrates. Every screen enters with
  motion. Stars, the mic, the crayons, the shelf and the rainbow rings all get their own moment.
- Sound is a layer, never a requirement: the app must be complete with the phone muted. Follow the
  ring switch; nothing plays at bedtime by surprise.
- Assets come from open-source libraries, not hand-made: candidates to evaluate are
  [soundcn](https://www.mintlify.com/kapishdima/soundcn/introduction) (a shadcn-style registry of
  700+ UI sounds, copied into the repo, sourced from CC0 collections, mostly Kenney),
  [UI SFX](https://peerlist.io/romainsimon/project/ui-sfx) (MIT code, CC0 audio, a semantic
  "success/tap/open" sound system), Kenney's CC0 audio packs directly, and Freesound filtered to
  CC0 for the sparkles and chimes a child expects. Check each license before shipping.
- Motion stays in Reanimated and the existing design tokens; one motion vocabulary (spring in,
  squish on press, sparkle on reward) reused everywhere rather than a new effect per screen.
- Performance budget: nothing that delays a tap on an iPhone 8, and the recording path stays
  untouched by audio effects (no sound while the mic is open).

## Done 2026-10-25: shipping pipeline (docs/PRD-changelog.md)

Push to main ships: an update, or a native build with a new version number and the changelog
section in TestFlight's "What to Test". A push without its changelog line is refused. Live once
Viktor has put the eight secrets into GitHub Actions (the cloud proxy blocks setting them).

## Done 2026-10-25: build 8, "släkten" (docs/PRD-build-8.md)

Decided with Viktor 2026-10-25, shipped the same day: TestFlight build 8 (1.1.0, the migration)
and four web ships (the shelf, the book page, her recordings, the totals). The page is live at
https://sandstreampop.github.io/boels-bokklubb/ behind the link and the PIN. The app on the web,
read only, for relatives. The page is called Boels bokklubb; "släkten" is the build's name here only.

1. The three read screens rebuilt in `web/` (Vite, TypeScript, no framework): library, book page
   with her voice playable, stats. No plus button, mic, pencil, camera, crayon, star input or share.
2. One secret link plus a four-digit PIN separate from the family password. The device remembers
   for a year. Five wrong PINs lock the link for fifteen minutes.
3. Static page on GitHub Pages at the github.io address, a domain later. One `feed` edge function
   reads with the service role and hands out signed URLs; the anon key gains no read path. One new
   table for the lockout, so build 8 is a native build (1.1.0).
4. Nothing in the app changes, nothing flows back, nothing notifies. Errors only in telemetry.
5. Shipping gains a web path: changes under `web/` deploy the page and the function, with changelog
   lines under `### Web`.

Success: within a month a relative mentions something Boel made without Viktor having sent it.

## Done 2026-10-26: build 9, "paddan" (docs/PRD-build-9.md)

From Viktor's message, shipped as one native build (1.2.0): the app on the iPad in both
orientations with the phone layout locked by a check; the question saved with an answer is the
one on screen when she finished (an invariant of the mode machines, with tests); the wand goes
quiet once she has started; the add-book wizard ends with the stars; capitals enforced in
software; transcription off behind a flag; and a committed pre-push hook that runs every gate
before anything is released.

## Later: build 10 and beyond (not designed yet)

- Parent-recorded prompt clips as an optional override of the text prompts.
- Android build, if a relative wants it. The config is already there.
- A domain for the feed (a CNAME file, no code change) once Viktor buys one.

## Not doing

- Streaks, reminders, daily goals. Gaps must never cost her anything.
- Usage analytics of any kind. Telemetry exists to find bugs, not to measure a child.
- Points, coins, sticker currencies. The shelf and the stats are the only score.
- Editing or deleting in the app. Fixes happen in Supabase.
- A chatbot. Prompts are a fixed pool of questions; the words are hers.
