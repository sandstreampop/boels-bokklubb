// What Boel can do on a book page: write, photograph, record, rate. One thing at a time.
//
//   idle ──SEND_TEXT──▶ savingText ──▶ idle
//   idle ──OPEN_PHOTOS──▶ choosingPhoto ──PICK──▶ takingPhoto ──▶ idle
//   idle ──START_RECORDING──▶ recording ──RECORDING_DONE──▶ savingAudio ──▶ idle
//   idle ──RATE──▶ idle (rating is queued immediately)

import { assign, fromPromise, setup } from 'xstate';

import { addAudioEntry, addPhotoEntry, addTextEntry, rateBook } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { captureError } from '@/lib/telemetry';

type Input = { bookId: string };
type Context = Input & { text: string };
type Events =
  | { type: 'SET_TEXT'; text: string }
  | { type: 'SEND_TEXT' }
  | { type: 'OPEN_PHOTOS' }
  | { type: 'CLOSE_PHOTOS' }
  | { type: 'PICK'; source: 'camera' | 'library' }
  | { type: 'START_RECORDING' }
  | { type: 'RECORDING_DONE'; uri: string; durationMs: number }
  | { type: 'RECORDING_UNAVAILABLE' }
  | { type: 'RATE'; rating: number };

export const bookMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    saveText: fromPromise(({ input }: { input: { bookId: string; text: string } }) => addTextEntry(input.bookId, input.text)),
    takePhoto: fromPromise(async ({ input }: { input: { bookId: string; source: 'camera' | 'library' } }) => {
      const uri = await pickPhoto(input.source);
      if (uri) await addPhotoEntry(input.bookId, uri);
      return !!uri;
    }),
    saveAudio: fromPromise(({ input }: { input: { bookId: string; uri: string; durationMs: number } }) =>
      addAudioEntry(input.bookId, input.uri, input.durationMs),
    ),
  },
  guards: {
    hasText: ({ context }) => context.text.trim().length > 0,
  },
}).createMachine({
  id: 'book',
  context: ({ input }) => ({ ...input, text: '' }),
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
      on: {
        SET_TEXT: { actions: assign({ text: ({ event }) => event.text }) },
        SEND_TEXT: { guard: 'hasText', target: 'savingText' },
        OPEN_PHOTOS: 'choosingPhoto',
        START_RECORDING: 'recording',
      },
    },
    savingText: {
      invoke: {
        src: 'saveText',
        input: ({ context }) => ({ bookId: context.bookId, text: context.text.trim() }),
        onDone: { target: 'idle', actions: assign({ text: '' }) },
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.sendText', event.error, { bookId: context.bookId }) },
      },
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
      on: { RECORDING_DONE: 'savingAudio', RECORDING_UNAVAILABLE: 'idle' },
    },
    savingAudio: {
      invoke: {
        src: 'saveAudio',
        input: ({ context, event }) => ({
          bookId: context.bookId,
          uri: event.type === 'RECORDING_DONE' ? event.uri : '',
          durationMs: event.type === 'RECORDING_DONE' ? event.durationMs : 0,
        }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('book.addAudio', event.error, { bookId: context.bookId }) },
      },
    },
  },
});
