# Credits

Every third-party asset in the app, with its licence. Rule (CLAUDE.md): a row here before a file
lands in `assets/`. The TestFlight "what to test" notes for the build that ships an asset repeat
its credit line.

## Art

| File | What | Source | Licence |
| --- | --- | --- | --- |
| `assets/unicorn.riv` | the unicorn companion | "Unicorni" by gianmarcog, <https://rive.app/marketplace/1151-2225-unicorni/>, runtime file from Rive's public CDN (`public.rive.app/community/runtime-files/1151-2225-unicorni.riv`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Credit line: "Enhörningen: Unicorni av gianmarcog, CC BY 4.0." The file has one artboard, "New
Artboard", one timeline animation, "Animation 1", and no state machine. One change to the file,
allowed by CC BY: the artboard's dark background rectangle (fill #313131) has its alpha set to 0,
so the unicorn sits on the app's pink instead of in a dark square. Done by patching the one
colour value in the binary (offset 3822, property `colorValue` of a `SolidColor`); redo it if a new
remix replaces the file. If a remix with a state
machine replaces it, update this row and `components/Unicorn.tsx` only.

## Sounds

Built by `node scripts/sounds.mjs` from CC0 packs (mono AAC, 44.1 kHz, peak at -3 dBFS): Kenney's
for the interface, rubberduck's creature pack on OpenGameArt for the unicorn's voice. Kenney asks
for no credit; the credit line is still "Ljud: Kenney (kenney.nl), CC0. Enhörningens röst:
rubberduck (opengameart.org), CC0."

| File | Used for | Source | Licence |
| --- | --- | --- | --- |
| `assets/sounds/tap.m4a` | every tap, a soft pop | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/click_001.ogg` | CC0 |
| `assets/sounds/save.m4a` | entry saved, a chime | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/confirmation_002.ogg` | CC0 |
| `assets/sounds/star-1.m4a` | one star | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/tick_004.ogg` | CC0 |
| `assets/sounds/star-2.m4a` | two stars | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/tick_004.ogg`, pitched +2 semitones | CC0 |
| `assets/sounds/star-3.m4a` | three stars | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/tick_004.ogg`, pitched +4 semitones | CC0 |
| `assets/sounds/star-4.m4a` | four stars | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/tick_004.ogg`, pitched +7 semitones | CC0 |
| `assets/sounds/star-5.m4a` | five stars | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/tick_004.ogg`, pitched +9 semitones | CC0 |
| `assets/sounds/rainbow.m4a` | book goes rainbow, a fanfare (1.6 s) | [Music Jingles](https://kenney.nl/assets/music-jingles) `Audio/Steel jingles/jingles_STEEL07.ogg` | CC0 |
| `assets/sounds/screen-in.m4a` | screen enters, a swish | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/maximize_006.ogg` | CC0 |
| `assets/sounds/screen-out.m4a` | screen leaves, a swish | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/minimize_006.ogg` | CC0 |
| `assets/sounds/crayon.m4a` | crayon stroke starts, a tiny scratch | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/scratch_003.ogg` | CC0 |
| `assets/sounds/wand.m4a` | wand reroll, a twinkle | [Interface Sounds](https://kenney.nl/assets/interface-sounds) `Audio/glass_001.ogg` | CC0 |
| `assets/sounds/unicorn-chirp.m4a` | the unicorn appears, a chirp | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck, `cute_02.ogg` | CC0 |
| `assets/sounds/unicorn-trill.m4a` | the unicorn is happy, a trill | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck, `cute_05.ogg` | CC0 |
| `assets/sounds/unicorn-yawn.m4a` | the unicorn yawns | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck, `cute_10.ogg` | CC0 |
| `assets/sounds/unicorn-sneeze.m4a` | the unicorn sneezes | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck, `cough_02.ogg` | CC0 |
| `assets/sounds/unicorn-hm.m4a` | the unicorn wonders, "hm?" | [80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) by rubberduck, `cute_08.ogg` | CC0 |

The picks were made by Kenney's own file names and measured length, not by ear: the session that
made them had no speaker. If one sounds wrong on the phone, change its line in
`scripts/sounds.mjs`, rerun, and update the row.

## The unicorn's voice

Five clips under a second each, one character, no words. Freesound answers 403 to the cloud
session (the block is Freesound's, not the proxy's) and Kenney has no animal, so the search went to
OpenGameArt filtered to CC0. The pick is rubberduck's "80 CC0 creature SFX" (2018): its ten
`cute_*` files are one synthesised squeaky creature (fundamental about 430 to 650 Hz), and its
cough and nose sounds are unpitched, so the sneeze fits any voice. Chosen by name and by measured
pitch envelope, not by ear, like the Kenney picks: if one sounds wrong, the alternatives in the
same voice are `cute_07` (a flat blip) for the chirp, `cute_09` (a smooth "weee") for the trill,
`ooh.ogg` for the yawn and `nose.ogg` for the sneeze. The `null` manifest path still works for any
clip removed.

## How the sound sources were evaluated (PRD build 7 §3, in that order)

1. **soundcn** (<https://soundcn.xyz>): a shadcn-style registry of 816 items. Each sound is an mp3
   as a base64 string inside a TypeScript module with no per-file source. The README says most
   sounds are CC0 "primarily Kenney", and 110 items (names starting `i-`, `u-`, the World of
   Warcraft set) are Blizzard's and not free. Not used: no per-file licence can be recorded, and
   every usable clip is a Kenney clip re-encoded.
2. **UI SFX** (<https://peerlist.io/romainsimon/project/ui-sfx>): the page refuses non-browser
   requests and the package is not on npm under that name, so it could not be evaluated from the
   cloud session. Revisit if the Kenney picks sound wrong.
3. **Kenney CC0 packs, direct**: chosen. Per-file provenance, CC0, converted by `scripts/sounds.mjs`.
