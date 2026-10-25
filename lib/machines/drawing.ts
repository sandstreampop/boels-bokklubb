// Drawing with a finger, full screen like recording. Keeps the strokes so undo is a pop.
//
//   idle ──START(prompt)──▶ drawing ──DONE (strokes)──▶ exporting ──▶ done ──RESET──▶ idle
//                              │ DONE (nothing drawn)                   ▲
//                              └────────────────────────────────────────┘
//
// STROKE appends a finished stroke, UNDO removes the last one, SET_COLOR picks a crayon. The
// canvas view is captured to a PNG by `capture`, passed in as input the way the recorder gets its
// recorder object. No cancel: done with nothing drawn just closes.

import { assign, fromPromise, setup } from 'xstate';

import { unicornTouched } from '@/lib/machines/unicorn';
import { captureError, info, traced } from '@/lib/telemetry';

export type Stroke = { color: string; d: string };

type Input = { capture: () => Promise<string> };
type Context = Input & { prompt: string | null; color: string; strokes: Stroke[]; uri: string | null };
type Events =
  | { type: 'START'; prompt: string | null }
  | { type: 'STROKE'; stroke: Stroke }
  | { type: 'UNDO' }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'DONE' }
  | { type: 'RESET' };

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
  },
}).createMachine({
  id: 'drawing',
  context: ({ input }) => ({ ...input, prompt: null, color: CRAYONS[CRAYONS.length - 1], strokes: [], uri: null }),
  initial: 'idle',
  states: {
    idle: {
      on: { START: { target: 'drawing', actions: assign({ prompt: ({ event }) => event.prompt, strokes: [], uri: null }) } },
    },
    drawing: {
      on: {
        // A stroke is a touch the root TouchWatcher never sees (the canvas is in a Modal).
        STROKE: { actions: [assign({ strokes: ({ context, event }) => [...context.strokes, event.stroke] }), () => unicornTouched()] },
        UNDO: { actions: assign({ strokes: ({ context }) => context.strokes.slice(0, -1) }) },
        SET_COLOR: { actions: assign({ color: ({ event }) => event.color }) },
        DONE: [{ guard: 'hasStrokes', target: 'exporting' }, { target: 'done' }],
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
      on: { RESET: { target: 'idle', actions: assign({ strokes: [], uri: null, prompt: null }) } },
    },
  },
});
