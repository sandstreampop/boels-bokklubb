// What Boel can do on a book page: write, photograph, record, rate. One thing at a time.
//
//   idle ──SEND_TEXT──▶ savingText ──▶ idle (fresh write prompt)
//   idle ──OPEN_PHOTOS──▶ choosingPhoto ──PICK──▶ takingPhoto ──▶ idle
//   idle ──START_RECORDING──▶ recording (fresh speak prompt) ──RECORDING_DONE──▶ savingAudio ──▶ idle
//   idle ──RATE──▶ idle (rating is queued immediately)
//   REROLL_PROMPT(pool) in any state swaps that pool's prompt; the one on screen at save time is stored.

import { assign, fromPromise, setup } from 'xstate';

import { addAudioEntry, addPhotoEntry, addTextEntry, rateBook } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { pickPrompt } from '@/lib/prompts';
import { captureError, info } from '@/lib/telemetry';
import type { PromptPool } from '@/lib/types';

type Input = { bookId: string };
type Context = Input & {
  text: string;
  /** The question on the recording overlay. Picked when recording starts. */
  speakPrompt: string | null;
  /** The question in the composer. Picked when the page opens and after every saved text. */
  writePrompt: string;
  /** Wand taps per pool on this page visit, for telemetry only. */
  rerolls: Record<PromptPool, number>;
};
type Events =
  | { type: 'SET_TEXT'; text: string }
  | { type: 'SEND_TEXT' }
  | { type: 'OPEN_PHOTOS' }
  | { type: 'CLOSE_PHOTOS' }
  | { type: 'PICK'; source: 'camera' | 'library' }
  | { type: 'START_RECORDING' }
  | { type: 'RECORDING_DONE'; uri: string; durationMs: number }
  | { type: 'RECORDING_UNAVAILABLE' }
  | { type: 'REROLL_PROMPT'; pool: PromptPool }
  | { type: 'RATE'; rating: number };

export const bookMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    saveText: fromPromise(({ input }: { input: { bookId: string; text: string; prompt: string | null } }) =>
      addTextEntry(input.bookId, input.text, input.prompt),
    ),
    takePhoto: fromPromise(async ({ input }: { input: { bookId: string; source: 'camera' | 'library' } }) => {
      const uri = await pickPhoto(input.source);
      if (uri) await addPhotoEntry(input.bookId, uri);
      return !!uri;
    }),
    saveAudio: fromPromise(({ input }: { input: { bookId: string; uri: string; durationMs: number; prompt: string | null } }) =>
      addAudioEntry(input.bookId, input.uri, input.durationMs, input.prompt),
    ),
  },
  actions: {
    reroll: assign(({ context, event }) => {
      if (event.type !== 'REROLL_PROMPT') return {};
      const count = context.rerolls[event.pool] + 1;
      info('prompt.reroll', { pool: event.pool, count, bookId: context.bookId });
      const next = pickPrompt(event.pool);
      return {
        rerolls: { ...context.rerolls, [event.pool]: count },
        ...(event.pool === 'speak' ? { speakPrompt: next } : {}),
        ...(event.pool === 'write' ? { writePrompt: next } : {}),
      };
    }),
  },
  guards: {
    hasText: ({ context }) => context.text.trim().length > 0,
  },
}).createMachine({
  id: 'book',
  context: ({ input }) => ({
    ...input,
    text: '',
    speakPrompt: null,
    writePrompt: pickPrompt('write'),
    rerolls: { speak: 0, write: 0, draw: 0 },
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
        SET_TEXT: { actions: assign({ text: ({ event }) => event.text }) },
        SEND_TEXT: { guard: 'hasText', target: 'savingText' },
        OPEN_PHOTOS: 'choosingPhoto',
        START_RECORDING: 'recording',
      },
    },
    savingText: {
      invoke: {
        src: 'saveText',
        input: ({ context }) => ({ bookId: context.bookId, text: context.text.trim(), prompt: context.writePrompt }),
        onDone: { target: 'idle', actions: assign({ text: '', writePrompt: () => pickPrompt('write') }) },
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
