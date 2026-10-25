// The sound layer (PRD build 7 §3). Non-verbal UI sounds and the unicorn's voice, as a layer the
// app never depends on: complete on mute, follows the ring switch, silent while the mic is open.
// No music (decided).
//
// - Every clip is preloaded at launch into its own AudioPlayer by startSounds(), so play() is a
//   seek and a play, never a load. Players live for the life of the app. Nothing on the
//   interaction path awaits anything.
// - micOpen(true) is sent by the recorder when the mic opens and play() is a no-op until
//   micOpen(false): a sound through the recording session would also end up in her voice note.
// - Audio mode is global in expo-audio. Effects want playsInSilentMode: false (ring switch) and
//   mixWithOthers (never pause her music). The recorder sets its own mode while the mic is open;
//   `effectsAudioMode` is what it should restore afterwards instead of playsInSilentMode: true.
// - A clip the repo does not have yet (the unicorn's voice, see docs/CREDITS.md) is `null` in the
//   manifest: play() logs it once and stays silent. The app must be complete without it.

import { createAudioPlayer, setAudioModeAsync, type AudioMode, type AudioPlayer, type AudioSource } from 'expo-audio';

import tap from '../assets/sounds/tap.m4a';
import save from '../assets/sounds/save.m4a';
import star_1 from '../assets/sounds/star-1.m4a';
import star_2 from '../assets/sounds/star-2.m4a';
import star_3 from '../assets/sounds/star-3.m4a';
import star_4 from '../assets/sounds/star-4.m4a';
import star_5 from '../assets/sounds/star-5.m4a';
import rainbow from '../assets/sounds/rainbow.m4a';
import screen_in from '../assets/sounds/screen-in.m4a';
import screen_out from '../assets/sounds/screen-out.m4a';
import crayon from '../assets/sounds/crayon.m4a';
import wand from '../assets/sounds/wand.m4a';
import { captureError, debug, info } from './telemetry';

export type SoundName =
  | 'tap'
  | 'save'
  | 'star-1'
  | 'star-2'
  | 'star-3'
  | 'star-4'
  | 'star-5'
  | 'rainbow'
  | 'screen-in'
  | 'screen-out'
  | 'crayon'
  | 'wand'
  | 'unicorn-chirp'
  | 'unicorn-trill'
  | 'unicorn-yawn'
  | 'unicorn-sneeze'
  | 'unicorn-hm';

/** Built by scripts/sounds.mjs; sources and licences in docs/CREDITS.md. */
const manifest: Record<SoundName, AudioSource | null> = {
  tap: tap,
  save: save,
  'star-1': star_1,
  'star-2': star_2,
  'star-3': star_3,
  'star-4': star_4,
  'star-5': star_5,
  rainbow: rainbow,
  'screen-in': screen_in,
  'screen-out': screen_out,
  crayon: crayon,
  wand: wand,
  // The unicorn's voice is not sourced yet: Freesound is unreachable from the cloud session and
  // Kenney's packs have no animal in them. Five CC0 clips under a second, one character.
  'unicorn-chirp': null,
  'unicorn-trill': null,
  'unicorn-yawn': null,
  'unicorn-sneeze': null,
  'unicorn-hm': null,
};

/** The app's resting audio mode: effects obey the ring switch and never interrupt other apps. */
export const effectsAudioMode: Partial<AudioMode> = {
  playsInSilentMode: false,
  allowsRecording: false,
  interruptionMode: 'mixWithOthers',
};

const players = new Map<SoundName, AudioPlayer>();
const reported = new Set<SoundName>();
let started = false;
let mic = false;

/** Preload every clip. Call once at launch, early; safe to call again. Never throws. */
export function startSounds() {
  if (started) return;
  started = true;
  void setAudioModeAsync(effectsAudioMode).catch((err) => captureError('sounds.mode', err));
  let loaded = 0;
  for (const [name, source] of Object.entries(manifest) as [SoundName, AudioSource | null][]) {
    if (!source) continue;
    try {
      players.set(name, createAudioPlayer(source));
      loaded++;
    } catch (err) {
      captureError('sounds.load', err, { name });
    }
  }
  info('sounds.ready', { loaded, missing: Object.values(manifest).filter((s) => !s).length });
}

/** The recorder calls this when the mic opens and closes. While open, every play() is silent. */
export function micOpen(open: boolean) {
  mic = open;
}

/** Play a clip from the start. Fire and forget: returns at once, logs failures, never throws. */
export function play(name: SoundName) {
  if (!started || mic) return;
  const player = players.get(name);
  if (!player) {
    if (!reported.has(name)) {
      reported.add(name);
      debug('sound.missing', { name });
    }
    return;
  }
  void player
    .seekTo(0)
    .then(() => player.play())
    .catch((err) => captureError('sound.play', err, { name }));
}

/** The star sounds climb with the rating: one tick per level, pitched up. */
export function playStar(level: number) {
  const n = Math.min(5, Math.max(1, Math.round(level)));
  play(`star-${n}` as SoundName);
}
