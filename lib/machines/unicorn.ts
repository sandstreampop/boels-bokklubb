// The unicorn companion's brain (PRD build 7 §2, amended 2026-10-25: she rests, and moves only
// when something happens). One module-level actor. Screens send MOMENT, HIDE, SHOW and SET_POSE;
// the gesture sends TAP. The view (components/Unicorn.tsx) renders the state and decides nothing.
//
//   idle ──TAP (queue a trick) ───┐
//   idle ──MOMENT (queue it) ─────┴──▶ playing ──after the cue's length──▶ playing (next in queue) or idle
//                                       TAP / MOMENT while playing only queue; nothing interrupts a cue
//   HIDE from anywhere ──▶ hidden ──SHOW──▶ idle          (share sheet, cards, screenshots)
//
// Rules, decided: at rest she is still (the Rive loop is paused); a cue plays the loop and the
// Reanimated sequence, then she rests again. Nothing interrupts a cue; tricks never repeat the one
// before; HIDE wins over everything and drops the queue. No idle hints, no sleep gesture. Nothing
// here reads usage; the breadcrumbs are for bugs.

import { assign, createActor, setup } from 'xstate';

import { inspect } from './inspect';
import { play, type SoundName } from '@/lib/sounds';
import { info } from '@/lib/telemetry';

export const TRICKS = ['spin', 'jump', 'sneeze', 'wiggle', 'roll'] as const;
export type TrickName = (typeof TRICKS)[number];
export const MOMENTS = ['launch', 'saved', 'rainbow'] as const;
export type MomentName = (typeof MOMENTS)[number];
/** Where she is: decides which instance is on stage (a full-screen Modal mounts its own). */
export type Pose = 'home' | 'recording' | 'writing' | 'drawing';
export type Cue = { kind: 'trick'; name: TrickName } | { kind: 'moment'; name: MomentName };

/** How long each cue holds the stage, and what it says. The view animates to match. */
export const CUES: Record<TrickName | MomentName, { ms: number; sound: SoundName | null }> = {
  spin: { ms: 700, sound: 'unicorn-trill' },
  jump: { ms: 650, sound: 'unicorn-chirp' },
  sneeze: { ms: 900, sound: 'unicorn-sneeze' },
  wiggle: { ms: 700, sound: 'unicorn-chirp' },
  roll: { ms: 1000, sound: 'unicorn-trill' },
  launch: { ms: 1400, sound: 'unicorn-chirp' },
  saved: { ms: 900, sound: 'unicorn-trill' },
  // The fanfare belongs to the set piece (components/RainbowCelebration.tsx), not the unicorn.
  rainbow: { ms: 1600, sound: null },
};
/** Taps while a cue plays queue up to this many tricks; a mash is not a to-do list. */
const MAX_QUEUED_TRICKS = 2;

type Context = {
  queue: Cue[];
  current: Cue | null;
  lastTrick: TrickName | null;
  pose: Pose;
  /** The launch moment has played: until then the home instance stays off the edge. */
  launched: boolean;
};
type Events =
  | { type: 'TAP' }
  | { type: 'MOMENT'; name: MomentName }
  | { type: 'HIDE' }
  | { type: 'SHOW' }
  // SET_ prefixed on purpose: the inspector keeps SET_ events out of the breadcrumbs.
  | { type: 'SET_POSE'; pose: Pose };

export const unicornMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  delays: {
    CUE: ({ context }) => (context.current ? CUES[context.current.name].ms : 0),
  },
  guards: {
    queueEmpty: ({ context }) => context.queue.length === 0,
  },
  actions: {
    queueTrick: assign(({ context }) => {
      const pending = context.queue.filter((c) => c.kind === 'trick').length;
      if (pending >= MAX_QUEUED_TRICKS) return {};
      const options = TRICKS.filter((t) => t !== context.lastTrick);
      const name = options[Math.floor(Math.random() * options.length)];
      return { queue: [...context.queue, { kind: 'trick', name } as Cue], lastTrick: name };
    }),
    queueMoment: assign(({ context, event }) => {
      if (event.type !== 'MOMENT') return {};
      return { queue: [...context.queue, { kind: 'moment', name: event.name } as Cue] };
    }),
    startNext: assign(({ context }) => {
      const [next, ...rest] = context.queue;
      return { current: next ?? null, queue: rest, launched: context.launched || next?.name === 'launch' };
    }),
    cueSound: ({ context }) => {
      const cue = context.current;
      if (!cue) return;
      const sound = CUES[cue.name].sound;
      if (sound) play(sound);
      info('unicorn.cue', { kind: cue.kind, name: cue.name, pose: context.pose });
    },
    clearStage: assign({ queue: [], current: null }),
    setPose: assign(({ event }) => (event.type === 'SET_POSE' ? { pose: event.pose } : {})),
  },
}).createMachine({
  id: 'unicorn',
  context: { queue: [], current: null, lastTrick: null, pose: 'home', launched: false },
  initial: 'idle',
  on: {
    HIDE: '.hidden',
    SET_POSE: { actions: 'setPose' },
  },
  states: {
    idle: {
      on: {
        TAP: { target: 'playing', actions: 'queueTrick' },
        MOMENT: { target: 'playing', actions: 'queueMoment' },
        SHOW: {},
      },
    },
    playing: {
      entry: ['startNext', 'cueSound'],
      exit: assign({ current: null }),
      after: {
        CUE: [
          { guard: 'queueEmpty', target: 'idle' },
          { target: 'playing', reenter: true },
        ],
      },
      on: {
        TAP: { actions: 'queueTrick' },
        MOMENT: { actions: 'queueMoment' },
      },
    },
    hidden: {
      entry: 'clearStage',
      on: { SHOW: 'idle' },
    },
  },
});

// ---- the one actor ---------------------------------------------------------------------------------

export const unicorn = createActor(unicornMachine, { inspect });
let started = false;

/** Starts the companion. Called by the first helper below or by components/Unicorn.tsx on mount. */
export function startUnicorn() {
  if (started) return;
  started = true;
  unicorn.start();
}

function send(event: Events) {
  if (!started) startUnicorn();
  unicorn.send(event);
}

/** A reaction to the app: launch, an entry saved, a book gone rainbow. Queues behind what plays. */
export const unicornMoment = (name: MomentName) => send({ type: 'MOMENT', name });
/** Her tap on the unicorn: a random trick, never the same twice in a row. */
export const unicornTap = () => send({ type: 'TAP' });
/** Off stage, for share sheets and anything captured as an image. */
export const hideUnicorn = () => send({ type: 'HIDE' });
export const showUnicorn = () => send({ type: 'SHOW' });
/** Which full-screen mode she is in, so the right instance shows. */
export const setUnicornPose = (pose: Pose) => send({ type: 'SET_POSE', pose });
