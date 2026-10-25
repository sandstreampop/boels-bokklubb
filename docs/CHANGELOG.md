# Changelog

One section per thing that reached Viktor's phone: a TestFlight build (native) or an over-the-air
update (JavaScript). Newest first. The build number is what TestFlight shows; the update id is the
first eight characters of what `npm run logs` shows in the `app` column.

## Unreleased

- Writing is its own full screen, like recording: the pencil opens it with the question at the
  top, big letters, and a done button. A fill-in question keeps the blank underlined with the
  cursor already in it.

## Build 5 (2026-10-25, TestFlight)

### Update 01a173d1 (2026-10-25)

- A recording she just made plays back right away, at the phone's volume.
- Every new thought, recording or photo bounces in with sparkles.

### Update 01a173ce (2026-10-25)

- A question to answer appears when she records or writes, and the magic wand picks another one.
  The question is kept with the entry and shown above her words.

What to test: create a book, open it, record, write, photograph, rate. Relaunch once after I say
an update is out and check the new thing appeared.

- Over-the-air updates: JavaScript changes now reach this build in about a minute after one
  relaunch. This is the build to keep installed.
- Everything from builds 2 to 4 below.

### Update 01a173b5 (2026-10-25)

- Same content as build 5. Published to prove the update path.

## Build 4 (2026-10-25, TestFlight)

- Fixed: book covers and recordings stored before a TestFlight update were not found afterwards,
  because iOS moves the app folder on every install. Stored paths are now rebased on launch.
- Machines are named in the logs.

## Build 3 (2026-10-25, TestFlight)

- The whole state layer rebuilt on XState: every flow is a machine, every transition a breadcrumb.
- Password field behaviour, recorder and outbox unchanged for Boel, more robust underneath.

## Build 2 (2026-10-25, TestFlight)

- Fixed: the app crashed when creating a book and when opening any book without entries.
- Observability: crashes, errors and every step of every flow are reported so Viktor can say
  "it broke" and Claude can see why.
- A missing native dependency of the recorder was added.

## Build 1 (2026-10-25, TestFlight)

- First build: library, add book, book page with text, voice, photo and stars. Crashed on open
  book; see build 2.
