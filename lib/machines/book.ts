// What Boel can do on a book page: write, photograph, record, draw, rate. One thing at a time.
//
//   idle ──START_WRITING──▶ writing ──WRITING_DONE(answer)──▶ savingText ──▶ idle
//   idle ──TAKE_PHOTO──▶ takingPhoto (camera only, never the gallery) ──▶ idle
//   idle ──START_RECORDING──▶ recording ──RECORDING_DONE(answer)──▶ savingAudio ──▶ idle
//                                  └─RECORDING_SKIPPED / RECORDING_UNAVAILABLE──▶ idle
//   idle ──START_DRAWING──▶ drawing ──DRAWING_DONE(answer)──▶ savingDrawing ──▶ idle
//   idle ──DRAW_COVER──▶ drawingCover ──DRAWING_DONE(answer)──▶ savingCover ──▶ idle   (only while the book has no cover)
//   idle ──RATE──▶ idle (rating is queued immediately)
//
// This machine holds no prompt. Each mode's machine (writer, drawing, recorder) picks and owns its
// question and hands it back inside its answer (WrittenAnswer, DrawnAnswer, SpokenAnswer), so the
// save here can only ever store the question that was on screen when she finished. The event
// types require the prompt: a save without it does not compile. docs/PRD-build-9.md §1.

import { fromPromise, setup } from 'xstate';

import { addAudioEntry, addDrawingEntry, addPhotoEntry, addTextEntry, rateBook, setDrawnCover } from '@/lib/actions';
import { takePhoto } from '@/lib/images';
import type { DrawnAnswer } from '@/lib/machines/drawing';
import type { SpokenAnswer } from '@/lib/machines/recorder';
import { setUnicornPose, type Pose } from '@/lib/machines/unicorn';
import type { WrittenAnswer } from '@/lib/machines/writer';
import { captureError } from '@/lib/telemetry';

type Input = { bookId: string };
type Context = Input;
type Events =
  | { type: 'START_WRITING' }
  | ({ type: 'WRITING_DONE' } & WrittenAnswer)
  | { type: 'TAKE_PHOTO' }
  | { type: 'START_RECORDING' }
  | ({ type: 'RECORDING_DONE' } & SpokenAnswer)
  | { type: 'RECORDING_UNAVAILABLE' }
  | { type: 'RECORDING_SKIPPED' }
  | { type: 'START_DRAWING' }
  | { type: 'DRAW_COVER' }
  | ({ type: 'DRAWING_DONE' } & DrawnAnswer)
  | { type: 'RATE'; rating: number };

export const bookMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    takePhoto: fromPromise(async ({ input }: { input: { bookId: string } }) => {
      const uri = await takePhoto();
      if (uri) await addPhotoEntry(input.bookId, uri);
      return !!uri;
    }),
    saveText: fromPromise(async ({ input }: { input: { bookId: string } & WrittenAnswer }) => {
      if (input.text) await addTextEntry(input.bookId, input.text, input.prompt);
      return !!input.text;
    }),
    saveDrawing: fromPromise(async ({ input }: { input: { bookId: string } & DrawnAnswer }) => {
      if (input.uri) await addDrawingEntry(input.bookId, input.uri, input.prompt);
      return !!input.uri;
    }),
    saveCover: fromPromise(async ({ input }: { input: { bookId: string; uri: string | null } }) => {
      if (input.uri) await setDrawnCover(input.bookId, input.uri);
      return !!input.uri;
    }),
    saveAudio: fromPromise(({ input }: { input: { bookId: string } & SpokenAnswer }) =>
      addAudioEntry(input.bookId, input.uri, input.durationMs, input.prompt),
    ),
  },
  actions: {
    // Where the unicorn sits: the full-screen modes mount their own instance with the matching
    // pose, and `home` brings the root one back.
    pose: (_, params: { pose: Pose }) => setUnicornPose(params.pose),
  },
}).createMachine({
  id: 'book',
  context: ({ input }) => ({ ...input }),
  initial: 'idle',
  on: {
    RATE: {
      actions: ({ context, event }) => {
        rateBook(context.bookId, event.rating).catch((err) => captureError('book.rate', err, { bookId: context.bookId }));
      },
    },
  },
  states: {
    idle: {
      entry: { type: 'pose', params: { pose: 'home' } },
      on: {
        START_WRITING: 'writing',
        TAKE_PHOTO: 'takingPhoto',
        START_RECORDING: 'recording',
        START_DRAWING: 'drawing',
        DRAW_COVER: 'drawingCover',
      },
    },
    writing: {
      entry: { type: 'pose', params: { pose: 'writing' } },
      on: { WRITING_DONE: 'savingText' },
    },
    savingText: {
      invoke: {
        src: 'saveText',
        input: ({ context, event }) => ({
          bookId: context.bookId,
          text: event.type === 'WRITING_DONE' ? event.text : '',
          prompt: event.type === 'WRITING_DONE' ? event.prompt : null,
        }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addText', event.error, { bookId: context.bookId }) },
      },
    },
    drawing: {
      entry: { type: 'pose', params: { pose: 'drawing' } },
      on: { DRAWING_DONE: 'savingDrawing' },
    },
    savingDrawing: {
      invoke: {
        src: 'saveDrawing',
        input: ({ context, event }) => ({
          bookId: context.bookId,
          uri: event.type === 'DRAWING_DONE' ? event.uri : null,
          prompt: event.type === 'DRAWING_DONE' ? event.prompt : null,
        }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addDrawing', event.error, { bookId: context.bookId }) },
      },
    },
    drawingCover: {
      entry: { type: 'pose', params: { pose: 'drawing' } },
      on: { DRAWING_DONE: 'savingCover' },
    },
    savingCover: {
      invoke: {
        src: 'saveCover',
        input: ({ context, event }) => ({ bookId: context.bookId, uri: event.type === 'DRAWING_DONE' ? event.uri : null }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.drawCover', event.error, { bookId: context.bookId }) },
      },
    },
    takingPhoto: {
      invoke: {
        src: 'takePhoto',
        input: ({ context }) => ({ bookId: context.bookId }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.takePhoto', event.error, { bookId: context.bookId }) },
      },
    },
    recording: {
      entry: { type: 'pose', params: { pose: 'recording' } },
      on: { RECORDING_DONE: 'savingAudio', RECORDING_UNAVAILABLE: 'idle', RECORDING_SKIPPED: 'idle' },
    },
    savingAudio: {
      invoke: {
        src: 'saveAudio',
        input: ({ context, event }) => ({
          bookId: context.bookId,
          uri: event.type === 'RECORDING_DONE' ? event.uri : '',
          durationMs: event.type === 'RECORDING_DONE' ? event.durationMs : 0,
          prompt: event.type === 'RECORDING_DONE' ? event.prompt : null,
        }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addAudio', event.error, { bookId: context.bookId }) },
      },
    },
  },
});
