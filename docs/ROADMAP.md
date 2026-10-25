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

## Later: build 7 and beyond (not designed yet)

- Read-only feed for relatives: a web page per family link showing the same cards. Needs a share
  token, a public read path in Supabase, and a small web app. Decided to design the card first so
  the feed is the card.
- Parent-recorded prompt clips as an optional override of the text prompts.
- Monthly TestFlight refresh needs the four GitHub Actions secrets added by hand (proxy blocks it).
- Android build, if a relative wants it. The config is already there.

## Not doing

- Streaks, reminders, daily goals. Gaps must never cost her anything.
- Points, coins, sticker currencies. The shelf and the stats are the only score.
- Editing or deleting in the app. Fixes happen in Supabase.
- A chatbot. Prompts are a fixed pool of questions; the words are hers.
