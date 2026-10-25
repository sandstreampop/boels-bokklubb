# Changelog

One section per thing that reached Viktor's phone: a TestFlight build (native) or an over-the-air
update (JavaScript). Newest first. The build number is what TestFlight shows; the update id is the
first eight characters of what `npm run logs` shows in the `app` column.

## Unreleased

- Adding a book is three screens, one thing at a time, with a row of three circles showing where
  she is: take a picture of the book (or go on without one), write its name, write who made it.
  Each step swishes in; the arrow goes on, the check at the end saves.

## Build 7 (2026-10-25, TestFlight)

What to test: nothing new to see yet. This build carries the unicorn's engine and the sounds so
the next updates can switch them on one by one. Check that everything from build 6 still works:
open a book, record, write, draw, share a card.

- The unicorn companion and its sounds are inside the app but not on stage yet.
- Enhörningen: Unicorni av gianmarcog, CC BY 4.0. Ljud: Kenney (kenney.nl), CC0.
- Everything from build 6 and its updates below.

### Update 01a17420 (2026-10-25)

- The unicorn has moved to the top right corner and rests there: after her entrance she only moves
  when something happens. Tap her for a trick, save something and she hops, finish a rainbow book
  and she jumps. No fidgeting in between.
- The unicorn has a voice: a chirp when she arrives, a trill when she is happy, a sneeze when she
  sneezes. She follows into every mode, beside the timer while the mic is open, under the text,
  below the canvas, and leaves while a card is shared. Enhörningens röst: rubberduck
  (opengameart.org), CC0.

### Update 01a1741a (2026-10-25)

- The unicorn sits on the pink, not in a dark square: the background of her artwork is see-through.
- Three set pieces. Opening the app: the shelf cascades in book by book, the title springs, the
  unicorn peeks up. Saving anything: the card springs in with sparkles, a chime, and the unicorn
  hops. A book going rainbow: a rainbow sweeps out from the cover, stars rain, a fanfare plays,
  the unicorn jumps and the ring draws itself around the cover. Once per book.

### Update 01a17418 (2026-10-25)

- Sounds, as a layer: a pop on every button, a tick that climbs with each star, a twinkle on the
  wand, a scratch when a crayon stroke starts, a swish when a screen comes and goes. They follow
  the ring switch and stay quiet while the mic is open. Her own recordings always play, ring
  switch or not. Every cover, card button, star and crayon squishes when pressed.

### Update 01a17411 (2026-10-25)

- The unicorn is on stage: she peeks up bottom left when the app opens and lives there on every
  screen. Tap her for a trick (spin, jump, sneeze, wiggle, roll over), never the same twice in a
  row. She steps off while a card is being shared and ducks when the keyboard is up.

## Build 6 (2026-10-25, TestFlight)

What to test: tap the crayon on a book, draw, tap done; the drawing lands in the stream. Add a
book and draw its cover.

- Drawing: a crayon on the book page opens a white square with seven crayons and undo; the
  drawing lands in the stream like a photo, with its question above it.
- A drawing can be a book's cover: a crayon under the cover slot when adding a book, or a tap on
  the empty cover of a book that has none.
- Everything from the build 5 updates below.

### Update 01a1740d (2026-10-25)

- Drawing has a paintbrush icon so it no longer looks like the pencil for writing.

### Update 01a17403 (2026-10-25)

- The shared card fills the whole picture instead of one corner.

### Update 01a173f9 (2026-10-25)

- Every entry and the totals page have a share button; it shows the card first, with Share and
  Cancel, before anything is sent.
- Sixteen crayons: red, orange, yellow, green, two blues, purple, pink, the five pastels, brown,
  grey and black.

### Update 01a173f0 (2026-10-25)

- Hold a finger on any entry, or on the totals page, to send it as a picture card: the cover,
  the title and stars, the question, her words, the date and a rainbow.
- The mic opens the recording screen with the question and a record button; recording starts
  when she presses the button, not before. A tap outside the button closes the screen.
- The camera button opens the camera straight away; photos are taken, never picked from the
  gallery, on the book page and for covers.

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
