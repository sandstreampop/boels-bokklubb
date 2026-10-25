// What Boel can do on a book page: write, photograph, record, rate. One thing at a time.
//
//   idle ──START_WRITING──▶ writing ──WRITING_DONE──▶ idle (fresh write prompt; the writer saved)
//   idle ──OPEN_PHOTOS──▶ choosingPhoto ──PICK──▶ takingPhoto ──▶ idle
//   idle ──START_RECORDING──▶ recording (fresh speak prompt) ──RECORDING_DONE──▶ savingAudio ──▶ idle
//   idle ──START_DRAWING──▶ drawing (fresh draw prompt) ──DRAWING_DONE(uri)──▶ savingDrawing ──▶ idle
//   idle ──DRAW_COVER──▶ drawingCover ──COVER_DONE(uri)──▶ savingCover ──▶ idle   (only while the book has no cover)
//   idle ──RATE──▶ idle (rating is queued immediately)
//   REROLL_PROMPT(pool) in any state swaps that pool's prompt; the one on screen at save time is stored.

import { assign, fromPromise, setup } from 'xstate';

import { addAudioEntry, addDrawingEntry, addPhotoEntry, rateBook, setDrawnCover } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { pickPrompt } from '@/lib/prompts';
import { captureError, debug } from '@/lib/telemetry';
import type { PromptPool } from '@/lib/types';

type Input = { bookId: string };
type Context = Input & {
  /** The question on the recording overlay. Picked when recording starts. */
  speakPrompt: string | null;
  /** The question on the writing screen. Picked when the page opens and after every writing. */
  writePrompt: string;
  /** The question on the canvas. Picked when drawing starts. */
  drawPrompt: string | null;
};
type Events =
  | { type: 'START_WRITING' }
  | { type: 'WRITING_DONE' }
  | { type: 'OPEN_PHOTOS' }
  | { type: 'CLOSE_PHOTOS' }
  | { type: 'PICK'; source: 'camera' | 'library' }
  | { type: 'START_RECORDING' }
  | { type: 'RECORDING_DONE'; uri: string; durationMs: number }
  | { type: 'RECORDING_UNAVAILABLE' }
  | { type: 'START_DRAWING' }
  | { type: 'DRAWING_DONE'; uri: string | null }
  | { type: 'DRAW_COVER' }
  | { type: 'COVER_DONE'; uri: string | null }
  | { type: 'REROLL_PROMPT'; pool: PromptPool }
  | { type: 'RATE'; rating: number };

export const bookMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    takePhoto: fromPromise(async ({ input }: { input: { bookId: string; source: 'camera' | 'library' } }) => {
      const uri = await pickPhoto(input.source);
      if (uri) await addPhotoEntry(input.bookId, uri);
      return !!uri;
    }),
    saveDrawing: fromPromise(async ({ input }: { input: { bookId: string; uri: string | null; prompt: string | null } }) => {
      if (input.uri) await addDrawingEntry(input.bookId, input.uri, input.prompt);
      return !!input.uri;
    }),
    saveCover: fromPromise(async ({ input }: { input: { bookId: string; uri: string | null } }) => {
      if (input.uri) await setDrawnCover(input.bookId, input.uri);
      return !!input.uri;
    }),
    saveAudio: fromPromise(({ input }: { input: { bookId: string; uri: string; durationMs: number; prompt: string | null } }) =>
      addAudioEntry(input.bookId, input.uri, input.durationMs, input.prompt),
    ),
  },
  actions: {
    reroll: assign(({ event }) => {
      if (event.type !== 'REROLL_PROMPT') return {};
      debug('prompt.reroll', { pool: event.pool });
      const next = pickPrompt(event.pool);
      return {
        ...(event.pool === 'speak' ? { speakPrompt: next } : {}),
        ...(event.pool === 'write' ? { writePrompt: next } : {}),
        ...(event.pool === 'draw' ? { drawPrompt: next } : {}),
      };
    }),
  },
}).createMachine({
  id: 'book',
  context: ({ input }) => ({
    ...input,
    speakPrompt: null,
    writePrompt: pickPrompt('write'),
    drawPrompt: null,
  }),
  initial: 'idle',
  on: {
    RATE: {
      actions: ({ context, event }) => {
        rateBook(context.bookId, event.rating).catch((err) => captureError('book.rate', err, { bookId: context.bookId }));
      },
    },
    REROLL_PROMPT: { actions: 'reroll' },
  },
  states: {
    idle: {
      on: {
        START_WRITING: 'writing',
        OPEN_PHOTOS: 'choosingPhoto',
        START_RECORDING: 'recording',
        START_DRAWING: 'drawing',
        DRAW_COVER: 'drawingCover',
      },
    },
    drawing: {
      entry: assign({ drawPrompt: () => pickPrompt('draw') }),
      on: { DRAWING_DONE: 'savingDrawing' },
    },
    savingDrawing: {
      invoke: {
        src: 'saveDrawing',
        input: ({ context, event }) => ({ bookId: context.bookId, uri: event.type === 'DRAWING_DONE' ? event.uri : null, prompt: context.drawPrompt }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addDrawing', event.error, { bookId: context.bookId }) },
      },
    },
    drawingCover: {
      on: { COVER_DONE: 'savingCover' },
    },
    savingCover: {
      invoke: {
        src: 'saveCover',
        input: ({ context, event }) => ({ bookId: context.bookId, uri: event.type === 'COVER_DONE' ? event.uri : null }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.drawCover', event.error, { bookId: context.bookId }) },
      },
    },
    writing: {
      on: { WRITING_DONE: { target: 'idle', actions: assign({ writePrompt: () => pickPrompt('write') }) } },
    },
    choosingPhoto: {
      on: { PICK: 'takingPhoto', CLOSE_PHOTOS: 'idle' },
    },
    takingPhoto: {
      invoke: {
        src: 'takePhoto',
        input: ({ context, event }) => ({ bookId: context.bookId, source: event.type === 'PICK' ? event.source : 'library' }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.takePhoto', event.error, { bookId: context.bookId }) },
      },
    },
    recording: {
      entry: assign({ speakPrompt: () => pickPrompt('speak') }),
      on: { RECORDING_DONE: 'savingAudio', RECORDING_UNAVAILABLE: 'idle' },
    },
    savingAudio: {
      invoke: {
        src: 'saveAudio',
        input: ({ context, event }) => ({
          bookId: context.bookId,
          uri: event.type === 'RECORDING_DONE' ? event.uri : '',
          durationMs: event.type === 'RECORDING_DONE' ? event.durationMs : 0,
          prompt: context.speakPrompt,
        }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addAudio', event.error, { bookId: context.bookId }) },
      },
    },
  },
});
