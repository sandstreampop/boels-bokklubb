// Adding a book, as a wizard: one thing per screen, so she can focus. A picture first (the camera,
// never the gallery; drawing a cover belongs to the book page), then the title, then the author.
//
//   picture ──PHOTO──▶ picking (camera) ──▶ picture      picture ──NEXT──▶ title (with or without a photo)
//   title ──NEXT (title not empty)──▶ author              title ──BACK──▶ picture
//   author ──NEXT──▶ saving ──▶ saved                      author ──BACK──▶ title
//                      │ error                            CLOSE from any step ──▶ closed
//                      ▼
//                    author
//
// Title required, author and cover optional (product rule). The step is the state; the screen
// renders the one that is active and a progress strip above it.

import { assign, fromPromise, setup } from 'xstate';

import { addBook } from '@/lib/actions';
import { takePhoto } from '@/lib/images';
import { play } from '@/lib/sounds';
import { captureError } from '@/lib/telemetry';
import type { Book } from '@/lib/types';

export const STEPS = ['picture', 'title', 'author'] as const;
export type Step = (typeof STEPS)[number];

type Context = { title: string; author: string; coverUri: string | null; book: Book | null };
type Events =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_AUTHOR'; author: string }
  | { type: 'PHOTO' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'CLOSE' };

export const newBookMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    pick: fromPromise(() => takePhoto()),
    save: fromPromise(({ input }: { input: Context }) =>
      addBook({ title: input.title.trim(), author: input.author.trim() || null, coverUri: input.coverUri }),
    ),
  },
  guards: {
    hasTitle: ({ context }) => context.title.trim().length > 0,
  },
  actions: {
    /** Each step arrives like a screen: the swish. */
    stepIn: () => play('screen-in'),
  },
}).createMachine({
  id: 'newBook',
  context: { title: '', author: '', coverUri: null, book: null },
  initial: 'picture',
  on: { CLOSE: '.closed' },
  states: {
    picture: {
      on: { PHOTO: 'picking', NEXT: 'title' },
    },
    picking: {
      invoke: {
        src: 'pick',
        onDone: { target: 'picture', actions: assign({ coverUri: ({ event, context }) => event.output ?? context.coverUri }) },
        onError: { target: 'picture', actions: ({ event }) => captureError('book.new.pick', event.error) },
      },
    },
    title: {
      entry: 'stepIn',
      on: {
        SET_TITLE: { actions: assign({ title: ({ event }) => event.title }) },
        NEXT: { guard: 'hasTitle', target: 'author' },
        BACK: 'picture',
      },
    },
    author: {
      entry: 'stepIn',
      on: {
        SET_AUTHOR: { actions: assign({ author: ({ event }) => event.author }) },
        NEXT: 'saving',
        BACK: 'title',
      },
    },
    saving: {
      invoke: {
        src: 'save',
        input: ({ context }) => context,
        onDone: { target: 'saved', actions: assign({ book: ({ event }) => event.output }) },
        onError: { target: 'author', actions: ({ event, context }) => captureError('book.new.save', event.error, { hasCover: !!context.coverUri }) },
      },
    },
    saved: { type: 'final' },
    closed: { type: 'final' },
  },
});
