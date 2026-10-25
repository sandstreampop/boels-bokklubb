// Adding a book: edit the fields, optionally pick a cover, save once.
//
//   editing ──PICK──▶ picking ──▶ editing     editing ──SAVE (title not empty)──▶ saving ──▶ saved
//   editing ──DRAW──▶ drawing ──DRAWING_DONE(uri)──▶ editing (the drawing is the cover)
//                                                                                   │ error
//                                                                                   ▼
//                                                                                editing

import { assign, fromPromise, setup } from 'xstate';

import { addBook } from '@/lib/actions';
import { pickPhoto } from '@/lib/images';
import { captureError } from '@/lib/telemetry';
import type { Book } from '@/lib/types';

type Context = { title: string; author: string; coverUri: string | null; book: Book | null };
type Events =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_AUTHOR'; author: string }
  | { type: 'PICK'; source: 'camera' | 'library' }
  | { type: 'DRAW' }
  | { type: 'DRAWING_DONE'; uri: string | null }
  | { type: 'SAVE' };

export const newBookMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    pick: fromPromise(({ input }: { input: { source: 'camera' | 'library' } }) => pickPhoto(input.source)),
    save: fromPromise(({ input }: { input: Context }) =>
      addBook({ title: input.title.trim(), author: input.author.trim() || null, coverUri: input.coverUri }),
    ),
  },
  guards: {
    canSave: ({ context }) => context.title.trim().length > 0,
  },
}).createMachine({
  id: 'newBook',
  context: { title: '', author: '', coverUri: null, book: null },
  initial: 'editing',
  states: {
    editing: {
      on: {
        SET_TITLE: { actions: assign({ title: ({ event }) => event.title }) },
        SET_AUTHOR: { actions: assign({ author: ({ event }) => event.author }) },
        PICK: 'picking',
        DRAW: 'drawing',
        SAVE: { guard: 'canSave', target: 'saving' },
      },
    },
    drawing: {
      on: { DRAWING_DONE: { target: 'editing', actions: assign({ coverUri: ({ event, context }) => event.uri ?? context.coverUri }) } },
    },
    picking: {
      invoke: {
        src: 'pick',
        input: ({ event }) => ({ source: event.type === 'PICK' ? event.source : 'library' }),
        onDone: { target: 'editing', actions: assign({ coverUri: ({ event, context }) => event.output ?? context.coverUri }) },
        onError: { target: 'editing', actions: ({ event }) => captureError('book.new.pick', event.error) },
      },
    },
    saving: {
      invoke: {
        src: 'save',
        input: ({ context }) => context,
        onDone: { target: 'saved', actions: assign({ book: ({ event }) => event.output }) },
        onError: { target: 'editing', actions: ({ event, context }) => captureError('book.new.save', event.error, { hasCover: !!context.coverUri }) },
      },
    },
    saved: { type: 'final' },
  },
});
