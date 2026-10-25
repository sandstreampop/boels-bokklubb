# PRD: build 7, "bedazzle"

Written 2026-10-25, after the build 6 review, for the session that starts once every build 6 slice
is on Viktor's phone. Decisions below were made with Viktor one question at a time; do not reopen
them. Ask when something is impossible or contradicts CLAUDE.md.

## 1. Goal

Take every interaction from simple to enchanting, the way Bolibompa and Gabby's Dollhouse hold a
five-year-old: a companion who notices her, motion on everything she touches, sound as a layer.
The diary stays the point. The companion and the effects serve her words, never compete with them.

Telemetry is for finding bugs, not for measuring her. Log transitions and failures as everywhere
else in the app; do not add counters, funnels or "engagement" events. No usage optimisation, ever.

## 2. The companion

A unicorn. Always on screen, in a fixed home, bottom left, on every screen. It never covers content:
screens get bottom padding for it, and it ducks (slides down to a peek) while the keyboard is open.

- **Art**: the Rive file "Unicorni" by gianmarcog, CC BY 4.0,
  https://rive.app/marketplace/1151-2225-unicorni/. Viktor downloads the `.riv` into
  `assets/unicorn.riv`. One looping animation, no state machine. Credit goes in `docs/CREDITS.md`
  and in the TestFlight "what to test" notes for the build that ships it. If a remix with a state
  machine arrives later, `Unicorn.tsx` swaps the loop for inputs and nothing else changes.
- **Rendering**: `rive-react-native` (native module, the reason build 7 is a TestFlight build),
  about 96 pt wide, inside an Animated.View that our motion layer moves. The Rive loop keeps the
  character breathing; Reanimated does the moments.
- **Moments** (reactions to the app), each a short Reanimated sequence plus a sound:
  - launch: peeks up from below the shelf, blinks, settles
  - entry saved: hops twice, sparkle burst, happy trill
  - book goes rainbow: part of the celebration set piece below
  - recording: sits beside the timer, sways slowly, no sound while the mic is open
  - writing and drawing: sits below the text or canvas, nods now and then
  - share sheet opens: hides (not on cards, not in screenshots)
- **Tricks** (reactions to her): tapping the unicorn plays a random one of five with its sound:
  spin, jump, sneeze sparkles, wiggle, roll over. Never the same twice in a row. No reward attached.
- **Idle**: ten seconds without a touch on any screen, it yawns, then looks and leans toward the
  most useful button on that screen (plus on the library, mic on a book, done on the writer).
  Repeats every twenty seconds while idle. Touch anything and it snaps back.
- **Sleep gesture**: none. Decided.
- **Machine**: `unicornMachine`, one module-level actor: idle, trick(name), moment(name), idleHint,
  hidden, ducked. Moments and tricks queue; a moment interrupts an idle hint; nothing interrupts a
  moment. The screens send it `MOMENT` and `HIDE`/`SHOW`; the gesture sends `TAP`; a global touch
  listener resets the idle timer. Created with `inspect`.

## 3. Sound

Non-verbal only. Every sound follows the ring switch (`playsInSilentMode: false` for effects) and
never plays while the mic is open. The app is complete with the phone muted.

- **Unicorn voice**: five clips, each under a second: appear chirp, happy trill, yawn, sneeze,
  "hm?" (idle hint). Source: Freesound filtered to CC0, or Kenney's CC0 packs. Pitch the chosen
  clips to one character; do not mix sources that sound like different animals.
- **UI sounds**: tap (soft pop), save (sparkle chime), star (ascending tick, one per star
  level), rainbow (fanfare, two seconds), screen in/out (swish), crayon stroke start (tiny scratch),
  wand reroll (twinkle), error-free: no negative sounds exist in this app.
  Source: evaluate in this order and keep the first that fits the palette: soundcn (shadcn-style
  registry, CC0 sources, copied into the repo), UI SFX (MIT code, CC0 audio), Kenney CC0 packs.
  Record the licence of every file in `docs/CREDITS.md`.
- **Playback**: `expo-audio` players preloaded at launch from `lib/sounds.ts`, one `play(name)`
  function, fire and forget, never awaited on the interaction path. Volume follows the system.
- **No music.** Decided.

## 4. Motion

One vocabulary, applied everywhere, in `lib/motion.ts` as reusable Reanimated presets:

- `springIn`: scale 0.6 to 1 with overshoot, 420 ms. New cards, buttons appearing, prompts.
- `squish`: scale 0.9 on press-in, spring back on release. Every Pressable (RoundButton has it;
  extend to covers, entry cards, stars, crayons, the wand).
- `sparkle`: the StarRating burst as a standalone component, placed at the corner of whatever was
  rewarded.
- `swish`: screen transitions get a slight overshoot and the unicorn rides along.
- `tumble`: out-animation for things being replaced (prompts on reroll).

Three set pieces, no more:

1. **Launch**: the shelf cascades in book by book (stagger 40 ms), title springs, unicorn peeks.
2. **Entry saved**: card springs in, sparkle at its corner, unicorn hops and trills. Covers text,
   audio (then auto-play), photo and drawing.
3. **Rainbow book**: when a book completes, a rainbow sweeps the screen from the cover outward,
   stars rain for a second, the unicorn jumps with a fanfare, the ring draws itself around the
   cover. Once per book, the moment it completes, on the book page.

Haptics ride along: light tick on tap, medium on save, heavy on rainbow. Already partly there.

## 5. Where it must stay out of the way

- Share cards and screenshots of cards: no unicorn, no effects. Cards render as in build 6.
- The recording path: no sounds while recording, the unicorn only sways. Stopping and saving is
  still one tap anywhere; the unicorn's tap target is disabled on the recorder.
- Text inputs: nothing animates while she types.
- Performance: a tap must respond within a frame on an iPhone 8. Preload sounds and the Rive file at
  launch, never on first use.

## 6. Delivery

1. Native build 7: add `rive-react-native`, the `.riv`, the sound files. `npx expo install`,
   `npx expo-doctor`, `npm run build:ios`. Ship the unicorn in its home with launch and tap tricks
   so there is something to see at once.
2. Over the air after that, one update each: sound layer and vocabulary everywhere; the three set
   pieces; moments and idle hints; polish from watching her.

Each step: typecheck, lint, doctor, commit, push, ship, read the logs for errors (not usage).

## 7. Rule changes for CLAUDE.md

- Add: "A unicorn companion lives bottom left on every screen. It reacts to the app and to taps,
  never to usage data, and never appears on share cards."
- Add: "Sound is a layer: the app is complete on mute, follows the ring switch, and is silent while
  the mic is open. No music."
- Add: "Motion uses the presets in lib/motion.ts. Three set pieces exist: launch, entry saved,
  rainbow book. Do not add a fourth without Viktor."
- Add: "Telemetry is for bugs. No usage counters, no funnels."
- Credits: "Every third-party asset is listed in docs/CREDITS.md with its licence."

## 8. Non-goals

No music, no speech, no mini-games or pet mechanics, no sleep or settings for the unicorn, no
usage analytics, no reduced-motion mode (revisit if it ever makes her dizzy), no Android testing.
