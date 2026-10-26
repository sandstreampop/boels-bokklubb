# PRD: build 9, "paddan" (the iPad, and three fixes)

Written 2026-10-26 from Viktor's messages, for the session that implements it and the next one
that touches layout. Six changes, decided:

1. The question stored with an answer is the one on screen, and the wand locks once she has
   started answering. An invariant of the machines, with tests.
2. The app works on an iPad, portrait and landscape, without changing anything on the phone.
3. Transcription is off, behind a feature flag. Her voice is the answer.
4. Capital letters are enforced in software: the iPad keyboard ignored the hint.
5. Adding a book ends with the stars, optional.
6. Every gate runs before anything is released, through a committed git hook.

Build 9 is a native build (1.2.0): `app.config.ts` and `package.json` change. Everything else
would have been an update.

## 1. The question she answered

Two bugs with one cause. She swaps the question with the wand, writes, saves: the entry stores
the first question, not the one she answered (the writer machine copied the prompt once at
start). And she answers, taps the wand by accident, saves: the entry stores a question she never
saw while answering. The cause: the prompt existed as three copies (the book machine's, the mode
machine's, the prop), and the rule "no reroll once started" lived nowhere.

The design, a pit of success rather than a patch:

- **One owner per session.** Each mode machine (`writer.ts`, `drawing.ts`, `recorder.ts`) picks
  its question when the mode opens and holds the only copy. The book machine holds none. The
  overlay shows `state.context.prompt`; there is no prompt prop.
- **The lock is a state.** Rerolling is an event, `REROLL`, accepted only in the mode's unlocked
  substate: `writing.blank` (text empty; `answering` otherwise, derived from the text by eventless
  transitions, so the two can never disagree), `drawing.blank` (no stroke and no finger on the
  canvas), `recorder.idle` (before the press; from there any tap stops and saves). The wand is
  lit by `canReroll(snapshot)`, which is `state.can(REROLL)`: the screen renders what the machine
  will accept and decides nothing. A tap on a faded wand sends nothing; an event that slips
  through is ignored by the machine. Clearing the text or undoing the last stroke unlocks again.
- **Typed hand-off.** A mode ends with an answer type that carries the prompt: `WrittenAnswer`
  `{ text, prompt }`, `DrawnAnswer` `{ uri, prompt }`, `SpokenAnswer` `{ uri, durationMs,
  prompt }`, read from the machine's own context in `done` by `writtenAnswer()` and friends. The
  book machine's `WRITING_DONE`, `DRAWING_DONE` and `RECORDING_DONE` events are those types, and
  its save actors take their prompt from the event. A save without the question does not compile;
  `tests/prompts.test.ts` has a `@ts-expect-error` line that proves it.
- **Tests.** `tests/prompts.test.ts` (vitest, Node, every device module mocked) drives each
  machine with events: a reroll before answering changes what is handed over, a reroll after is
  ignored, clearing unlocks, the recording's crash marker carries the same question as its
  answer, a cover has no question, and the book machine saves each answer with exactly the
  question it came with. `npm test` runs in check.yml and in the pre-push hook (section 6).

No explaining prose, no toast: the fade is the whole signal, the same one every disabled button
in the app uses.

## 2. The iPad

### Facts

- `supportsTablet` was false: on an iPad the app ran as a scaled iPhone. Setting it to true gives
  the app the real window, so every screen must lay itself out for 320 to 1400 points of width.
- Orientation stays `portrait` at the top level, which is the iPhone's setting. With a tablet
  enabled and `requireFullScreen` off, Expo's prebuild adds `UISupportedInterfaceOrientations~ipad`
  with all four orientations (App Store review requires it for multitasking). So: iPhone portrait
  only, iPad any orientation, Split View and Slide Over allowed, which is just more widths.
- A React Native `Modal` defaults to portrait only (`supportedOrientations`). Every full-screen
  mode is a Modal (recorder, writer, canvas, share sheet). Without the prop, opening one on an
  iPad in landscape would snap the screen to portrait. Every Modal passes `MODAL_ORIENTATIONS`.
- The add-book screen is a Stack `modal`: a page sheet on the iPad, a card narrower than the
  window. It lays out in whatever width it gets.

### The invariant: compact is today

Every responsive value goes through `lib/layout.ts` (pure functions, no React Native) and the
hook `useLayout()` in `lib/useLayout.ts`. Three size classes by window width:

| class     | width        | where                                 |
| --------- | ------------ | ------------------------------------- |
| `compact` | under 600    | every iPhone, Slide Over on an iPad   |
| `regular` | 600 to 899   | iPad portrait, half of a Split View   |
| `wide`    | 900 and over | iPad landscape                        |

In `compact` every function returns exactly the constants the screens used before build 9:
gutter 20, gap 18, two columns, the old card width formula, no content width cap, the old canvas
formula. `scripts/layout-check.mjs` asserts that for every phone width (320 to 599) and refuses
the push otherwise; `check.yml` runs it. That is the no-regression rule in code, not in a
checklist: a layout change that moves a pixel on the phone fails CI.

Where a value is "none in compact" it is `undefined` (`maxContent`), so the compact style object
is identical to the old one and React Native sees no new property.

### Screen by screen

- **Library**: the grid reads `gridFor(width)`: columns from the width (about 220-point cards:
  three on an iPad portrait, four or five in landscape), gutter 32, gap 24. The FlatList is keyed
  by the column count (React Native requires a remount when `numColumns` changes). The title row
  and the plus button stay where they are.
- **Book page**: `regular` keeps the phone layout inside a 720-point column centred on the
  screen. `wide` is two panes: the cover, title, stars and the four buttons in a 380-point column
  on the left; the stream on the right in its own list. Same header component in both; only the
  container changes. The rainbow celebration measures the cover in the window as before.
- **Stats**: the tiles in the 720-point column. The share card is untouched (it is a fixed-size
  picture, never responsive).
- **Add book**: the page sheet gives its own width; the wizard is centred already. Nothing changes
  except the inputs (section 4).
- **Recorder**: centred column as today; the prompt block gets the content cap so a question is
  not one long line across a landscape iPad.
- **Writer**: the text column gets the content cap, the done bar with it.
- **Canvas**: `compact` keeps the old side formula. `regular`/`wide` size the square from the
  height left after the chrome, so it is as large as the screen allows in both orientations. In
  `wide` landscape the crayons stand in a column beside the canvas instead of two rows under it.
- **Share sheet, login, unicorn, celebration**: already window-relative; the sheet gets the
  orientations prop.

### What is not done

- No iPad-specific features (no pencil pressure, no keyboard shortcuts, no sidebar).
- No landscape on the iPhone.
- No new motion: the same presets, the same set pieces.

## 3. Transcription off

Viktor: the transcript is often wrong; listen instead. `lib/features.ts` holds
`features.transcription = false`. With it off:

- No call to the `transcribe` function after an upload, no sweep at sign-in.
- New recordings are stored with `transcript_status: 'none'`.
- No transcript and no grey "pending" bars on the entry card, the share card or the web page,
  including for old recordings that have a transcript.

The function, the columns and the code stay. Flipping the flag brings it back for new recordings;
old ones with `'none'` would need a sweep by hand. `lib/features.ts` has no imports, so the web
version reads the same flag (`scripts/web.mjs` allows it).

## 4. Capitals in software

`autoCapitalize="characters"` is a keyboard hint; the iPad keyboard (and any hardware keyboard)
ignores it. `components/CapsInput.tsx` wraps `TextInput`, keeps the hint and the no-autocorrect
props, and uppercases every change before it reaches the machine. Used wherever she writes: the
book's name and author, the writing screen, the blank in a fill-in question. The password field
is left alone (digits).

## 5. The stars at the end of the wizard

Viktor: ask her to rate the book as a last step when adding it, optional, so she remembers.
`lib/machines/newBook.ts` gains a `rating` step after `author`: the same `StarRating` as the book
page, `SET_RATING` optional, the check saves with or without stars, back returns to the author.
`addBook` stores the rating on the book row (the outbox already sent it). The progress strip
gets a fourth circle with a star.

## 6. Every gate before a release

Viktor: a hook that always runs all tests before releasing a new version. A release is a push to
main (CI ships it) or a manual ship. `scripts/preflight.mjs` runs every gate in one go: typecheck,
lint, `npm test`, the phone-layout check, the changelog gate; `--full` adds expo-doctor and, when
`web/` changed since the last ship, the web check.

- `.githooks/pre-push`, committed, runs the preflight on any push to `main` and refuses the push
  otherwise. `npm install` installs it through the `prepare` script (`git config core.hooksPath
  .githooks`), so every clone has it. In GitHub Actions the hook stands aside: check.yml has
  already run the same gates as steps, and ship.yml needs it.
- `scripts/ship.mjs update`, `build` and `web` (the manual escape hatches, which bypass ship.yml)
  run the full preflight before they do anything. `auto` does not repeat what check.yml just ran.
- There is no flag to skip a gate. A release that cannot pass them is not released.

## 7. What to test

On the iPad: rotate on every screen, open every mode in landscape, draw, record, write, add a
book and give it stars in the last step. On the phone: nothing should look different. Swap the
question with the wand, type a letter: the wand fades; delete the letter: it lights again; save:
the card shows the question you saw.
