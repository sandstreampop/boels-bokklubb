// Drawing with a finger, full screen like recording. Keeps the strokes so undo is a pop, and owns
// the question for the whole session (null for a cover: no question, no wand).
//
//   idle ──START(cover?)──▶ drawing.blank ──(finger down or a stroke)──▶ drawing.answering ──(undone to empty)──▶ blank
//                              │ REROLL: a new question                     REROLL is not accepted here
//                              └──── DONE from either ────▶ exporting (strokes) or done (nothing drawn) ──RESET──▶ idle
//
// The invariant (docs/PRD-build-9.md §1, same shape as lib/machines/writer.ts): this machine holds
// the only copy of the prompt, REROLL is accepted only while the canvas is blank (no stroke and no
// finger on it, derived by eventless transitions), and the answer handed to the book machine is
// read from that copy at done. BEGIN is the finger touching the canvas; STROKE the finished path;
// UNDO removes the last one; SET_COLOR picks a crayon. The canvas view is captured to a PNG by
// `capture`, passed in as input the way the recorder gets its recorder object. No cancel: done
// with nothing drawn hands over no file. tests/prompts.test.ts holds the machine to this.

import { assign, fromPromise, not, or, setup, type SnapshotFrom } from 'xstate';

import { pickPrompt } from '@/lib/prompts';
import { captureError, info, traced } from '@/lib/telemetry';

export type Stroke = { color: string; d: string };

type Input = { capture: () => Promise<string> };
type Context = Input & { prompt: string | null; inking: boolean; color: string; strokes: Stroke[]; uri: string | null };
type Events =
  | { type: 'START'; cover: boolean }
  | { type: 'REROLL' }
  | { type: 'BEGIN' }
  | { type: 'STROKE'; stroke: Stroke }
  | { type: 'UNDO' }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'DONE' }
  | { type: 'RESET' };

/** What the canvas hands to the book machine: the picture (null when nothing was drawn) and the question. */
export type DrawnAnswer = { uri: string | null; prompt: string | null };

/** Two rows of crayons: the classic rainbow and friends on top, the app's pastels and black below. */
export const CRAYONS = [
  '#FF3B30', // red
  '#FF9500', // orange
  '#FFD60A', // yellow
  '#34C759', // green
  '#5AC8FA', // light blue
  '#007AFF', // blue
  '#AF52DE', // purple
  '#FF2D55', // pink
  '#FF9AA2', // pastel rose
  '#FFDAC1', // pastel peach
  '#E2F0CB', // pastel lime
  '#B5EAD7', // pastel mint
  '#C7CEEA', // pastel lavender
  '#8B5A2B', // brown
  '#9A9A9A', // grey
  '#2B2B2B', // black
] as const;

export const drawingMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    export: fromPromise(({ input }: { input: { capture: () => Promise<string>; strokes: number } }) =>
      traced('drawing.export', { strokes: input.strokes }, input.capture),
    ),
  },
  guards: {
    hasStrokes: ({ context }) => context.strokes.length > 0,
    inking: ({ context }) => context.inking,
    hasPrompt: ({ context }) => context.prompt !== null,
  },
  actions: {
    pick: assign({ prompt: () => pickPrompt('draw') }),
  },
}).createMachine({
  id: 'drawing',
  context: ({ input }) => ({ ...input, prompt: null, inking: false, color: CRAYONS[CRAYONS.length - 1], strokes: [], uri: null }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        START: {
          target: 'drawing',
          actions: assign({
            prompt: ({ event }) => (event.cover ? null : pickPrompt('draw')),
            inking: false,
            strokes: [],
            uri: null,
          }),
        },
      },
    },
    drawing: {
      initial: 'blank',
      on: {
        BEGIN: { actions: assign({ inking: true }) },
        STROKE: { actions: assign({ inking: false, strokes: ({ context, event }) => [...context.strokes, event.stroke] }) },
        UNDO: { actions: assign({ strokes: ({ context }) => context.strokes.slice(0, -1) }) },
        SET_COLOR: { actions: assign({ color: ({ event }) => event.color }) },
        DONE: [{ guard: 'hasStrokes', target: 'exporting' }, { target: 'done' }],
      },
      states: {
        blank: {
          on: { REROLL: { guard: 'hasPrompt', actions: 'pick' } },
          always: { guard: or(['hasStrokes', 'inking']), target: 'answering' },
        },
        answering: {
          always: { guard: not(or(['hasStrokes', 'inking'])), target: 'blank' },
        },
      },
    },
    exporting: {
      invoke: {
        src: 'export',
        input: ({ context }) => ({ capture: context.capture, strokes: context.strokes.length }),
        onDone: { target: 'done', actions: assign({ uri: ({ event }) => event.output }) },
        onError: { target: 'done', actions: ({ event, context }) => captureError('drawing.export', event.error, { strokes: context.strokes.length }) },
      },
    },
    done: {
      entry: ({ context }) => info('drawing.done', { strokes: context.strokes.length, hasUri: !!context.uri }),
      on: { RESET: { target: 'idle', actions: assign({ strokes: [], uri: null, prompt: null, inking: false }) } },
    },
  },
});

export type DrawingSnapshot = SnapshotFrom<typeof drawingMachine>;

/** The answer as the machine holds it: read in `done`, handed to the book machine as DRAWING_DONE. */
export const drawnAnswer = (s: DrawingSnapshot): DrawnAnswer => ({ uri: s.context.uri, prompt: s.context.prompt });

/** Whether the wand is lit: only while the canvas is blank and there is a question to replace. */
export const canReroll = (s: DrawingSnapshot): boolean => s.can({ type: 'REROLL' });
