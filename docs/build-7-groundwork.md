# Build 7 groundwork: what the `bedazzle` branch holds

Made 2026-10-25 on branch `bedazzle` while another session shipped build 6 on main. Nothing here has
shipped: no update, no build, no submit. No existing file under `app/` or `components/` was
touched, so the merge with build 6 is additive apart from `package.json` and the lockfile. This is
the foundation of docs/PRD-build-7.md, not the whole PRD: the wiring into screens is listed below,
file by file, for the session that implements it after build 6 has landed.

## What exists

| File | What it is |
| --- | --- |
| `assets/unicorn.riv` | "Unicorni" (CC BY 4.0), one looping timeline, no state machine. See docs/CREDITS.md. |
| `assets/sounds/*.m4a` | Twelve UI sounds from Kenney's CC0 packs, built by `scripts/sounds.mjs`. |
| `scripts/sounds.mjs` | Downloads the packs, converts the picks, prints the credits rows. Picks are one line each. |
| `metro.config.js` | Expo default plus `.riv` as an asset, so the unicorn file ships over the air. |
| `lib/assets.d.ts` | Module types for `*.riv` and `*.m4a` imports. |
| `lib/sounds.ts` | The sound layer: preload at launch, `play(name)`, `playStar(level)`, `micOpen()`, `effectsAudioMode`. |
| `lib/motion.ts` | The vocabulary: `springIn`, `tumble`, `swishIn`, `swishOut` (entering/exiting presets), `useSquish`, `useSparkle`, the spring configs. |
| `lib/machines/unicorn.ts` | `unicornMachine` and the one actor: idle, idleHint, idleWait, playing (trick or moment), hidden, ducked. Helpers `unicornMoment`, `unicornTap`, `hideUnicorn`, `showUnicorn`, `duckUnicorn`, `setUnicornPose`, `setUnicornHint`, `unicornTouched`. |
| `components/Unicorn.tsx` | The companion: Rive loop inside an Animated.View, the cues as Reanimated sequences, keyboard ducking, tap tricks. Exports `UNICORN` (size, home, padding). |
| `components/TouchWatcher.tsx` | Wraps the app once; every touch start resets the idle timer. |
| `components/Sparkle.tsx` | The sparkle preset standalone, at a corner of whatever was rewarded. |
| `components/Squishy.tsx` | The one press behaviour for anything that is not a RoundButton: squish, haptic tick, tap sound. |
| `components/RainbowCelebration.tsx` | Set piece 3: rainbow sweep from the cover, star rain, fanfare, heavy haptic, the unicorn's jump. |
| `docs/CREDITS.md` | Every asset with its licence, and the record of how the sound sources were evaluated. |
| `package.json` | `rive-react-native` added with `npx expo install`. A native module: build 7 is a TestFlight build. |

Verified on the branch, before and after rebasing onto main at build 6 slice 6: `npm run typecheck`,
`npm run lint`, `npx expo-doctor` (20/20), and a Metro export with a throwaway route importing every new module, which bundled the `.riv` and all
twelve `.m4a` files. Not verified: anything on a phone. No speaker, no simulator in the session.

## Decisions taken here, and why

1. **`rive-react-native` 9.8.6, as the PRD says, not the new `@rive-app/react-native`.** Rive now
   recommends the new Nitro runtime and calls this one legacy. The new one refuses files without a
   state machine ("files that only contain timeline animations don't play"), and the Unicorni file
   is exactly that. The legacy package plays a timeline with `autoplay` and takes the file through
   `source={require(...)}`, so the file ships over the air. Risk: it registers its view with
   `requireNativeComponent`, the old-architecture path, which runs through the interop layer on
   React Native 0.88. Nothing suggests it fails, but the first TestFlight build is the proof. If it
   does fail, the fallback is the new runtime plus a remix of the file with a one-state machine.
2. **The `.riv` came from Rive's public CDN**, not from Viktor's download. Same file, CC BY 4.0,
   public URL on the marketplace page. The PRD's step "Viktor downloads it" is done unless he wants
   a different remix.
3. **Sounds come from Kenney directly.** soundcn turned out to be Kenney clips re-encoded with no
   per-file source, and UI SFX could not be reached. Record in docs/CREDITS.md.
4. **The unicorn's five voice clips are not sourced.** Freesound returns 403 from the cloud
   session and Kenney has no animal. The manifest holds `null` for them and `play()` stays silent,
   so nothing breaks; the handoff is a Freesound search on a machine that can reach it.
5. **The sound picks are unheard.** Chosen by Kenney's names and measured length. Expect to swap
   one or two after the first listen; each is one line in `scripts/sounds.mjs`.
6. **Poses, not states, for recording/writing/drawing.** The PRD lists those under "moments", but
   they last as long as the mode. The machine keeps a `pose` in context; a full-screen mode mounts
   its own `<Unicorn pose="recording" placement="inline" />` because a Modal covers the root one,
   and only the instance whose pose matches is on stage.
7. **`SET_TOUCHED`, `SET_POSE`, `SET_HINT` are prefixed on purpose.** `lib/machines/inspect.ts`
   keeps `SET_` events out of the breadcrumbs; a touch on every screen is not a transition worth
   a row. Cues and hints log as `unicorn.cue` and `unicorn.hint`.

## Wiring left to do, per existing file (main as of the rebase, build 6 slice 6 and after)

Native build 7 first (`npx expo install` is done; run `npx expo-doctor`, `npm run build:ios`), then
over the air one update each, in the PRD's order. Every item below is an edit to a file this branch
did not touch. Main's shape since build 6: `app.config.ts` replaced `app.json`; writing and drawing
are `components/WriterOverlay.tsx` and `components/DrawingOverlay.tsx` (Modals, like the
recorder); share is a button on every card that goes through `lib/machines/share.ts` and the
root-mounted `components/ShareHost.tsx`; `lib/store.ts` already detects "the moment a book becomes
complete" and logs `book.completed`.

- `app/_layout.tsx`: call `startSounds()` next to `startTelemetry()`; wrap the `<Stack>` in
  `<TouchWatcher>`; mount `<Unicorn />` next to `<ShareHost />` inside the GestureHandlerRootView;
  send `unicornMoment('launch')` in the existing `app.ready` effect.
- `app/index.tsx`: `paddingBottom: insets.bottom + UNICORN.padding`; `setUnicornHint('plus')` on
  focus; set piece 1: wrap each BookCard in `<Animated.View entering={springIn(index * durations.cascade)}>`
  on first render only, and the title in `springIn()`.
- `app/book/[id].tsx`: padding as above (it is `insets.bottom + 40` today); `setUnicornHint('mic')`
  on focus; after a saved entry (the book machine's save actors' onDone, text, audio, photo and
  drawing alike): `play('save')`, `unicornMoment('saved')`, `<Sparkle fireKey={newestEntryId}
  corner="topRight" />` on the newest card, keeping build 6's spring-in of the card. Set piece 3:
  turn the store's `book.completed` detection into a store field or an event the page can read
  (a `celebrate: string | null` in the store context, cleared by the page), mount
  `<RainbowCelebration origin={coverCentre} onDone={unmount} />` over the page with the cover centre
  from `measureInWindow`, and pass the existing `RainbowRing` a `celebrating` flag so it draws itself.
- `components/StarRating.tsx`: `playStar(n)` in `tap`.
- `components/RoundButton.tsx`: `play('tap')` in `onPress` (the squish is already there).
- `components/BookCard.tsx`, `components/EntryCard.tsx`, the crayons in `DrawingOverlay.tsx`:
  wrap the pressable in `<Squishy>`; the `Wand` in `components/Prompt.tsx` passes `sound="wand"`.
  `usePromptSwap` there already tumbles the old prompt and bursts the new one: keep it, or swap its
  timings for `tumble()` / `springIn()` so the three places share the preset.
- `components/RecorderOverlay.tsx`: `setUnicornPose('recording')` when it opens and `'home'` in
  the done and unavailable effects; `micOpen(true)` when `recording` becomes true, `micOpen(false)`
  in the done and unavailable effects; mount `<Unicorn pose="recording" placement="inline" />`
  beside the timer.
- `lib/machines/recorder.ts`: the `stop` actor restores `effectsAudioMode` instead of
  `{ playsInSilentMode: true }`.
- `components/EntryCard.tsx`: around `player.play()` for a voice note, `setAudioModeAsync({ playsInSilentMode: true })`
  first and `setAudioModeAsync(effectsAudioMode)` when playback ends or the card unmounts
  (decided, see below). Build 6's auto-play after recording goes through the same path.
- `components/WriterOverlay.tsx` and `components/DrawingOverlay.tsx`: `setUnicornPose('writing' | 'drawing')`
  on open, `'home'` on done, `setUnicornHint('done')`, `<Unicorn pose=... placement="inline" />`
  below the text or canvas; `play('crayon')` where the pan gesture begins a stroke; nothing animates
  while she types.
- `lib/machines/share.ts`: `hideUnicorn()` on entering `rendering`, `showUnicorn()` on returning to
  `idle`, so neither the capture nor the preview sheet shows her.
- Screen transitions: `play('screen-in')` / `play('screen-out')` from `useScreen` focus and blur
  is the cheapest place; the Stack's own slide stays, the overshoot comes from `swishIn` on each
  screen's root view.
- `docs/CHANGELOG.md`: the build 7 section, with the two credit lines from docs/CREDITS.md in its
  "what to test" text.

## Decided, and open questions for Viktor

- **Her own recordings and the ring switch: decided 2026-10-25, her recordings play on silent,
  effects do not.** The recorder's `stop` actor restores `effectsAudioMode` (ring switch obeyed).
  The entry player in `components/EntryCard.tsx` sets `playsInSilentMode: true` right before it
  plays a voice note and restores `effectsAudioMode` when playback ends or the card unmounts, so
  her words always play and the pops and chimes stay quiet on a silent phone. Build 6's auto-play
  after recording goes through the same path.
- **The fanfare is 1.6 s**, the longest cheerful jingle in Kenney's pack; the PRD says two seconds.
- **Merging to main ships.** Since "Shipping moves to CI", a push to main is a release. Merge this
  branch only when build 7 is meant to go out; the lockfile already holds all three native modules.

## Risks to watch on the first TestFlight build

- The legacy Rive view on the new architecture (decision 1). Symptom: a red box
  "RiveReactNativeView was not found in the UIManager" or a blank square where the unicorn should be.
  `unicorn.rive.error` in the logs says which.
- The runtime fingerprint changes with the new native module, as expected: build 7 must be
  installed before any build 7 update can reach the phone.
- XState's idle timers keep running while the app is in the background; on return she may hint at
  once. Harmless; if it looks wrong, send `SET_TOUCHED` on `AppState` active.
