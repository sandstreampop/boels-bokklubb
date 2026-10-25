// The unicorn companion's brain (PRD build 7 §2). One module-level actor. Screens send MOMENT,
// HIDE, SHOW and SET_POSE; the gesture sends TAP; the keyboard sends DUCK/UNDUCK; TouchWatcher sends
// SET_TOUCHED on every touch. The view (components/Unicorn.tsx) renders the state and decides nothing.
//
//   idle ──10 s──▶ idleHint ──(hint done)──▶ idleWait ──20 s──▶ idleHint
//     ▲  SET_TOUCHED from idleHint/idleWait ◀──────────────────────┘
//     │
//     ├──TAP (queue a trick) ───┐
//     ├──MOMENT (queue it) ─────┴──▶ playing ──after the cue's length──▶ playing (next in queue) or idle
//     │                               TAP / MOMENT while playing only queue; nothing interrupts a cue
//   HIDE from anywhere ──▶ hidden ──SHOW──▶ idle          (share sheet, cards, screenshots)
//   DUCK from anywhere but hidden ──▶ ducked ──UNDUCK──▶ idle   (keyboard open: slides down to a peek)
//
// Rules, decided: a moment interrupts an idle hint; nothing interrupts a moment or a trick; tricks
// never repeat the one before; HIDE wins over everything; hidden and ducked drop the queue (she is
// elsewhere). No sleep gesture. Nothing here reads usage; the breadcrumbs are for bugs.

import { assign, createActor, setup } from 'xstate';

import { inspect } from './inspect';
import { play, type SoundName } from '@/lib/sounds';
import { info } from '@/lib/telemetry';

export const TRICKS = ['spin', 'jump', 'sneeze', 'wiggle', 'roll'] as const;
export type TrickName = (typeof TRICKS)[number];
export const MOMENTS = ['launch', 'saved', 'rainbow'] as const;
export type MomentName = (typeof MOMENTS)[number];
/** Where she is: decides where the unicorn sits and how it moves between cues. */
export type Pose = 'home' | 'recording' | 'writing' | 'drawing';
/** The most useful button on the current screen, for the idle lean. */
export type HintTarget = 'plus' | 'mic' | 'done' | null;
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
export const IDLE_MS = 10_000;
export const IDLE_REPEAT_MS = 20_000;
export const HINT_MS = 1_800;
/** Taps while a cue plays queue up to this many tricks; a mash is not a to-do list. */
const MAX_QUEUED_TRICKS = 2;

type Context = {
  queue: Cue[];
  current: Cue | null;
  lastTrick: TrickName | null;
  pose: Pose;
  hint: HintTarget;
  /** The launch moment has played: until then every home instance stays below the shelf. */
  launched: boolean;
};
type Events =
  | { type: 'TAP' }
  | { type: 'MOMENT'; name: MomentName }
  | { type: 'HIDE' }
  | { type: 'SHOW' }
  | { type: 'DUCK' }
  | { type: 'UNDUCK' }
  // SET_ prefixed on purpose: the inspector keeps SET_ events out of the breadcrumbs, and these fire
  // on every touch and every screen.
  | { type: 'SET_TOUCHED' }
  | { type: 'SET_POSE'; pose: Pose }
  | { type: 'SET_HINT'; target: HintTarget };

export const unicornMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  delays: {
    IDLE: IDLE_MS,
    REPEAT: IDLE_REPEAT_MS,
    HINT: HINT_MS,
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
    hintSound: ({ context }) => {
      play('unicorn-yawn');
      info('unicorn.hint', { target: context.hint, pose: context.pose });
    },
    setPose: assign(({ event }) => (event.type === 'SET_POSE' ? { pose: event.pose } : {})),
    setHint: assign(({ event }) => (event.type === 'SET_HINT' ? { hint: event.target } : {})),
  },
}).createMachine({
  id: 'unicorn',
  context: { queue: [], current: null, lastTrick: null, pose: 'home', hint: null, launched: false },
  initial: 'idle',
  on: {
    HIDE: '.hidden',
    DUCK: '.ducked',
    SET_POSE: { actions: 'setPose' },
    SET_HINT: { actions: 'setHint' },
  },
  states: {
    idle: {
      after: { IDLE: 'idleHint' },
      on: {
        TAP: { target: 'playing', actions: 'queueTrick' },
        MOMENT: { target: 'playing', actions: 'queueMoment' },
        SET_TOUCHED: { target: 'idle', reenter: true },
        UNDUCK: {},
        SHOW: {},
      },
    },
    idleHint: {
      entry: 'hintSound',
      after: { HINT: 'idleWait' },
      on: {
        TAP: { target: 'playing', actions: 'queueTrick' },
        MOMENT: { target: 'playing', actions: 'queueMoment' },
        SET_TOUCHED: 'idle',
      },
    },
    idleWait: {
      after: { REPEAT: 'idleHint' },
      on: {
        TAP: { target: 'playing', actions: 'queueTrick' },
        MOMENT: { target: 'playing', actions: 'queueMoment' },
        SET_TOUCHED: 'idle',
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
      on: { SHOW: 'idle', DUCK: {} },
    },
    ducked: {
      entry: 'clearStage',
      on: { UNDUCK: 'idle' },
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
/** Keyboard open: slides down to a peek. */
export const duckUnicorn = (ducked: boolean) => send({ type: ducked ? 'DUCK' : 'UNDUCK' });
/** Which full-screen mode she is in, so the right instance shows and moves accordingly. */
export const setUnicornPose = (pose: Pose) => send({ type: 'SET_POSE', pose });
/** The button the idle lean points at on the current screen. */
export const setUnicornHint = (target: HintTarget) => send({ type: 'SET_HINT', target });
/** Any touch anywhere: resets the idle timer. Sent by components/TouchWatcher.tsx. */
export const unicornTouched = () => send({ type: 'SET_TOUCHED' });
