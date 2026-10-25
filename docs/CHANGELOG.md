# Changelog

One section per thing that reached Viktor's phone: a TestFlight build (native) or an over-the-air
update (JavaScript). Newest first. The build number is what TestFlight shows; the update id is the
first eight characters of what `npm run logs` shows in the `app` column.

## Unreleased

- Hold a finger on any entry, or on the totals page, to send it as a picture card: the cover,
  the title and stars, the question, her words, the date and a rainbow.
- The mic opens the recording screen with the question and a record button; recording starts
  when she presses the button, not before. A tap outside the button closes the screen.
- The camera button opens the camera straight away; photos are taken, never picked from the
  gallery, on the book page and for covers.

## Build 6 (2026-10-25, TestFlight)

What to test: tap the crayon on a book, draw, tap done; the drawing lands in the stream. Add a
book and draw its cover.

- Drawing: a crayon on the book page opens a white square with seven crayons and undo; the
  drawing lands in the stream like a photo, with its question above it.
- A drawing can be a book's cover: a crayon under the cover slot when adding a book, or a tap on
  the empty cover of a book that has none.
- Everything from the build 5 updates below.

## Build 5 (2026-10-25, TestFlight)

### Update 01a173e6 (2026-10-25)

- Updates reach the phone with the database settings again: the four updates below were bundled
  without them and showed "Appen saknar inställningar för databasen". This one carries
  everything from them.

### Update 01a173d8 (2026-10-25, broken: no database settings)

- A book with stars, a recording and a picture gets a rainbow ring around its cover, and the
  number of rainbow books shows next to the title.
- Tapping the title opens a page of totals: books, rainbow books, recordings, thoughts, photos
  and drawings.

### Update 01a173d5 (2026-10-25, broken: no database settings)

- Writing is its own full screen, like recording: the pencil opens it with the question at the
  top, big letters, and a done button. A fill-in question keeps the blank underlined with the
  cursor already in it.

### Update 01a173d1 (2026-10-25, broken: no database settings)

- A recording she just made plays back right away, at the phone's volume.
- Every new thought, recording or photo bounces in with sparkles.

### Update 01a173ce (2026-10-25, broken: no database settings)

- A question to answer appears when she records or writes, and the magic wand picks another one.
  The question is kept with the entry and shown above her words.

What to test: create a book, open it, record, write, photograph, rate. Relaunch once after I say
an update is out and check the new thing appeared.

- Over-the-air updates: JavaScript changes now reach this build in about a minute after one
  relaunch. This is the build to keep installed.
- Everything from builds 2 to 4 below.

### Update 01a173b5 (2026-10-25, broken: no database settings)

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
