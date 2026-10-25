# PRD: build 6, "she asks for it"

Written 2026-10-25 for the next session to implement. Every decision below was made with Viktor in
a question-by-question review; do not reopen them, do ask when something here turns out to be
impossible or contradicts the product rules in CLAUDE.md.

## 1. Goal and the facts that shape it

Goal: Boel (5) asks to use the app, and Viktor wants to screenshot what she made and send it.

Facts from Viktor:

- Sessions are mixed: a grown-up opens the app and the book, Boel takes over. There is no fixed
  ritual. She uses it when she wants, Viktor prompts her sometimes. So the pull has to come from
  the app, never from streaks or reminders.
- She can read and she writes herself. Her spelling stays untouched (existing rule).
- What she enjoys: hearing herself, collecting, showing off, making things. All four are in scope.
- The share story: a card per entry that goes straight to Messenger as an image.
- Keep it bare bones. Every addition below is the smallest version that does its job.

Success looks like: she asks for it unprompted at least a few times a week, and Viktor shares a card
without being asked to test anything.

## 2. Features, in delivery order

Each slice is shipped over the air (`npm run update`) as soon as it is done, except slice 5 which
needs a TestFlight build. Each slice is a state machine or an extension of one, with telemetry on
every transition, per CLAUDE.md.

### Slice 1: prompts

- Three pools of fifty Swedish prompts: `speak`, `write`, `draw`. Plain string arrays in
  `lib/prompts.ts`, so adding one is a line and ships over the air. Starter pools in appendix A;
  Viktor may edit them.
- Picking: uniformly random, but never the same prompt twice in a row per pool (remember the last
  index in the store).
- Speaking: the prompt is shown on the recording overlay in big display type under the timer, from
  the moment the mic opens. Not spoken.
- Writing: the prompt is the placeholder of the composer (slice 3 replaces the composer).
- Drawing: shown at the top of the canvas (slice 5).
- Reroll: a magic wand button sits beside every prompt (recording overlay, writing screen, canvas).
  Tapping it swaps in a new random prompt from the same pool: the old prompt shrinks and tumbles
  away, the new one springs in with a sparkle burst from the wand tip, a light haptic tick. No
  limit on rerolls and nothing is stored about them. The wand is the `wand` icon in the icon set
  (a tilted stick with three sparkle dots), 56 pt, pink on the white writing screen and the canvas,
  white on the deep-pink recorder. Rerolling while recording keeps recording; the prompt that is on
  screen when she saves is the one stored with the entry. Telemetry: `prompt.reroll` as a breadcrumb.
- Stored: `entries.prompt text null` (migration 0003). The outbox sends it, sync reads it, the
  entry card shows it above her words in the muted style, smaller than her text. Audio entries
  show it above the player. Old entries have no prompt and look as today.
- Fill-in prompts (write pool only) contain `___`. The writing screen shows the prompt with the
  blank, she types only the ending, and the card renders the prompt with her text in the blank.
  Store the prompt verbatim with `___` and the text as typed; rendering joins them.

### Slice 2: the reward moment

- After a recording is saved, the new entry's player auto-plays once, immediately, at the phone's
  current volume. No UI for this. If the volume is at zero nothing special happens.
- Every newly created entry (text, audio, photo, drawing) bounces in: scale from 0.6 with a spring,
  plus the existing star-sparkle burst reused at the card's corner. Entries arriving from sync do
  not animate.
- Telemetry: breadcrumbs only, as everywhere.

### Slice 3: full-screen writing

- The composer on the book page becomes a pencil button in the action row: mic, pencil, camera
  (and later the crayon). Tapping it opens a full-screen writing mode, same shape as the recorder:
  prompt at the top in display type, a large text area with her text in body type at 24 pt, a
  done button bottom right. No cancel: done with empty text just closes; done with text saves.
- Fill-in prompts render as prompt text with the blank visibly underlined and the caret in it.
- `writerMachine`: idle → writing → saving → done. The book machine gets `START_WRITING` and
  `WRITING_DONE(text, prompt)` events.
- All TextInput rules apply: no autocorrect, no spellcheck, no autocapitalize.

### Slice 4: rainbow ring and stats

- A book is complete when it has a rating, at least one audio entry, and at least one photo or
  drawing. Complete books get a rainbow ring (the pastel rainbow as a 4 pt gradient border) around
  the cover on the library grid and on the book page. Derived in the store with a selector,
  nothing stored.
- Library header: the title "Boels bokklubb" becomes tappable and opens the stats screen. Next to
  the title, the count of rainbow books as a big number with a small rainbow ring, only when > 0.
- Stats screen, `app/stats.tsx`, the one exception to "three screens only" (update CLAUDE.md).
  Totals only, no time axis. Six tiles with an icon and a big number, no labels: books, rainbow
  books, voice notes, written thoughts, photos, drawings. Rainbow books is the largest tile. Back
  button like the book page. Long-press anywhere on the stats shares it as an image (slice 6).
- Telemetry: `screen.focus` for stats, `book.completed` as a breadcrumb.

### Slice 5: native build 6, drawing

Native additions (the only reasons for a build): `react-native-view-shot` (capture a view to PNG)
and `expo-sharing` (share sheet). Install with `npx expo install`, run `npx expo-doctor`, bump
nothing else. Then `npm run build:ios`.

- Drawing canvas: full screen like the recorder. The draw prompt at the top. Below it a square
  canvas, white, with the pastel rainbow's six colours plus black as crayons along the bottom, one
  brush width (about 10 pt at 1x), undo (one step at a time, unlimited), done. Finger only.
- Implementation: `react-native-gesture-handler` pan gesture collecting points into SVG paths
  (`react-native-svg` is installed). Export by capturing the canvas view with view-shot to PNG.
  No Skia, no new native module beyond the two above.
- Saved as a new entry kind `drawing` (migration 0003 extends the `kind` check). Media path
  `<bookId>/<entryId>.png`, bucket `media`, shown in the stream exactly like a photo.
- Drawing as cover: on the add-book screen, a third button under the cover slot, a crayon. Opens the
  same canvas; done sets the drawing as the cover (uploaded to `covers`). On the book page, if the
  book has no cover, tapping the placeholder cover opens the canvas and sets it. Covers are never
  replaced once set (append-only rule).
- `drawingMachine`: idle → drawing → exporting → done. Keeps the path list in context so undo is a
  pop.
- Telemetry: export duration and failures.

### Slice 6: share cards

- Long-press on any entry card opens the iOS share sheet with a PNG of a card. Nothing visible
  marks it. A short haptic on the long-press start.
- Card layout, rendered off-screen at 1080 x 1350 (4:5, what Messenger and Instagram show fully):
  pastel pink background, the cover (or rainbow placeholder with the initial) top left, the title
  and stars beside it, then the prompt in muted type if any, then her words in display type
  verbatim, then the date and a rainbow bar at the bottom. For audio entries the transcript is the
  words, with a small mic icon. For photos and drawings the image fills the middle and the words
  area is omitted. The card never shows UI chrome, pending dots or buttons.
- Long-press on the stats screen shares a stats card: the six tiles on the same background with
  "Boels bokklubb" and the date.
- Rendered with a hidden `ShareCard` component and view-shot; the file goes to the cache directory
  and is removed after the sheet closes.
- Telemetry: `share.open`, `share.done`, `share.cancel` as breadcrumbs, plus failures.

## 3. Data changes (migration 0003_prompts_and_drawings.sql)

```sql
alter table public.entries add column if not exists prompt text;
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries add constraint entries_kind_check
  check (kind in ('text', 'audio', 'photo', 'drawing'));
```

Storage: `media` bucket must accept `image/png` (it does). Types: `EntryKind` gains `'drawing'`,
`Entry` gains `prompt: string | null`. The outbox row includes `prompt`. The transcribe function is
unchanged (it only looks at audio).

Apply with `npm run migrate` before shipping slice 1.

## 4. Rule changes to make in CLAUDE.md

- "Three screens only" becomes four: library, add book, book page, stats.
- The book page input row is: mic, pencil, camera, crayon. Writing and drawing are full-screen
  modes like recording.
- Add: "Prompts are text, one random of fifty per pool, stored on the entry. No voice prompts. The
  magic wand rerolls a prompt anywhere one is shown."
- Add: "Share is a long-press, never a visible button."

## 5. Non-goals for build 6

No feed for relatives (build 7), no voice or TTS prompts, no eraser or brush sizes, no editing of
prompts in the app, no time-based stats, no notifications, no Android testing.

## 6. Order of work for the implementing session

1. Read CLAUDE.md, this file, `lib/machines/*.ts` headers, `lib/telemetry.ts`.
2. Migration 0003, types, outbox row, sync. `npm run migrate`.
3. Slice 1, then `npm run update`. Tell Viktor to relaunch once. Check `npm run logs`.
4. Slices 2, 3, 4 the same way, one update each.
5. Slice 5: install the two modules, canvas, `npm run build:ios`. Twenty-five minutes.
6. Slice 6 over the air once build 6 is installed (view-shot is in the binary by then).
7. Each slice: typecheck, lint, expo-doctor, commit to main, push, ship.

Everything ships with telemetry, which is for finding bugs, never for measuring her. After each
slice, read the logs from Viktor's phone for errors before starting the next.

## Appendix A: starter prompt pools (Swedish, 50 each)

Viktor may rewrite any of these. Keep them short, concrete and about the book she just read.
Fill-in prompts (write pool) use `___` for the blank.

### speak

1. Vad hände i boken?
2. Vem tyckte du mest om?
3. Var det något som var läskigt?
4. Vad var det roligaste?
5. Hur slutade boken?
6. Vad skulle du ha gjort om du var med i boken?
7. Vilket djur eller person var dummast?
8. Var det något du inte förstod?
9. Vad luktade det i boken, tror du?
10. Vilken bild var finast?
11. Var det en bra bok? Varför?
12. Vad hette den du gillade mest, och varför gillade du den?
13. Fanns det något gott att äta i boken?
14. Vad tror du händer efter slutet?
15. Var det någon som var ledsen? Varför?
16. Var det någon som var modig?
17. Vad var det konstigaste i boken?
18. Vilket ställe i boken skulle du vilja besöka?
19. Om du fick byta namn på boken, vad skulle den heta?
20. Vad tror du mamma eller pappa tycker om den här boken?
21. Berätta om början.
22. Berätta om mitten.
23. Berätta om slutet.
24. Fanns det något som var orättvist?
25. Vem skulle du vilja vara kompis med i boken?
26. Vad lärde du dig?
27. Skrattade du någon gång? När?
28. Var det någon som bråkade? Om vad?
29. Vilka färger var det mest av i boken?
30. Om boken var en dröm, vad skulle du drömma?
31. Vad gjorde den som var elak?
32. Vem skulle du ge en kram i boken?
33. Fanns det en hemlighet i boken?
34. Vad var det tråkigaste?
35. Om du fick ändra en sak i boken, vad då?
36. Vilken sida vill du läsa igen?
37. Var det någon som fick hjälp? Av vem?
38. Vad skulle du säga till den som skrev boken?
39. Vilket ljud hördes mest i boken?
40. Var hände boken? Hemma, i skogen, någon annanstans?
41. Vem i boken är mest som du?
42. Vad tyckte du om bilderna?
43. Vilken sak i boken skulle du vilja ha?
44. Var det någon som ljög?
45. Hur kändes det i magen när du läste?
46. Vad skulle du berätta för din bästa kompis om boken?
47. Vem skulle du inte vilja träffa i boken?
48. Var det någon som sprang, flög eller simmade? Berätta.
49. Vad var det bästa någon sa i boken?
50. Ge boken stjärnor och berätta varför.

### write

1. Boken handlade om ___
2. Den jag gillade mest var ___
3. Det roligaste var när ___
4. Jag blev rädd när ___
5. Slutet var ___
6. Om jag var med i boken skulle jag ___
7. Jag tyckte boken var ___
8. Den dummaste i boken var ___
9. Det finaste i boken var ___
10. Jag ville att ___
11. Det konstigaste var ___
12. Jag skrattade när ___
13. Jag blev ledsen när ___
14. Den modigaste var ___
15. Boken borde heta ___
16. Jag skulle vilja bo i ___
17. Det godaste i boken var ___
18. Jag förstod inte ___
19. Efter slutet tror jag att ___
20. Jag skulle vilja vara kompis med ___
21. Det var orättvist att ___
22. Jag lärde mig att ___
23. Den elaka gjorde ___
24. Jag skulle ge en kram till ___
25. Hemligheten i boken var ___
26. Det tråkigaste var ___
27. Jag skulle ändra ___
28. Sidan jag vill läsa igen är ___
29. Jag skulle säga till den som skrev boken att ___
30. Boken hände i ___
31. Den som är mest som jag är ___
32. Bilderna var ___
33. Jag skulle vilja ha ___ från boken
34. I magen kändes det ___
35. Till min kompis skulle jag säga att ___
36. Det bästa någon sa var ___
37. Boken får ___ stjärnor för att ___
38. Skriv tre ord om boken.
39. Skriv vad du tänker på just nu.
40. Skriv ett brev till någon i boken.
41. Skriv vad som hände först, sen och sist.
42. Skriv något som var roligt.
43. Skriv något som var läskigt.
44. Skriv vad du skulle göra om du var huvudpersonen.
45. Skriv en fråga till någon i boken.
46. Skriv vad du gillade bäst.
47. Skriv om bilden du gillade mest.
48. Skriv ett nytt slut.
49. Skriv vad du vill läsa om nästa gång.
50. Skriv varför någon annan borde läsa boken.

### draw

1. Rita den du gillade mest i boken.
2. Rita det läskigaste.
3. Rita det roligaste som hände.
4. Rita slutet.
5. Rita var boken hände.
6. Rita dig själv i boken.
7. Rita ett nytt omslag.
8. Rita det godaste i boken.
9. Rita den dummaste.
10. Rita en sak från boken som du vill ha.
11. Rita vad som händer efter slutet.
12. Rita den modigaste.
13. Rita ett djur från boken.
14. Rita ett hus från boken.
15. Rita det finaste stället.
16. Rita vad huvudpersonen drömmer om.
17. Rita något som var konstigt.
18. Rita en ny kompis till huvudpersonen.
19. Rita boken som en karta.
20. Rita det bästa ljudet i boken.
21. Rita hur det kändes i magen.
22. Rita det första som hände.
23. Rita det som hände i mitten.
24. Rita vad du skulle ge till den som var ledsen.
25. Rita en present till den du gillade mest.
26. Rita det som var orättvist.
27. Rita hemligheten.
28. Rita ett monster från boken, eller hitta på ett.
29. Rita ett fordon som passar i boken.
30. Rita vädret i boken.
31. Rita den elaka, snäll.
32. Rita vad som finns bakom dörren i boken.
33. Rita något som flyger i boken.
34. Rita något som växer i boken.
35. Rita en fest för alla i boken.
36. Rita boken i bara en färg.
37. Rita det du vill läsa om nästa gång.
38. Rita en bild till sidan du gillade mest.
39. Rita huvudpersonen som gammal.
40. Rita huvudpersonen som bebis.
41. Rita boken som en tårta.
42. Rita något du skulle bygga i boken.
43. Rita en maskin som hjälper någon i boken.
44. Rita mamma eller pappa i boken.
45. Rita den du skulle vilja krama.
46. Rita det tråkigaste, men roligt.
47. Rita en skylt som hör hemma i boken.
48. Rita vad som är i fickan på huvudpersonen.
49. Rita boken som ett djur.
50. Rita stjärnorna du ger boken.
