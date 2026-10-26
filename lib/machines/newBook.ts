// Adding a book, as a wizard: one thing per screen, so she can focus. A picture first (the camera,
// never the gallery; drawing a cover belongs to the book page), then the title, then the author,
// then the stars.
//
//   picture ──PHOTO──▶ picking (camera) ──▶ picture      picture ──NEXT──▶ title (with or without a photo)
//   title ──NEXT (title not empty)──▶ author              title ──BACK──▶ picture
//   author ──NEXT──▶ rating                               author ──BACK──▶ title
//   rating ──SET_RATING(n)──▶ rating                      rating ──BACK──▶ author
//   rating ──NEXT──▶ saving ──▶ saved                      CLOSE from any step ──▶ closed
//                      │ error
//                      ▼
//                    rating
//
// Title required; author, cover and stars optional (product rule; the stars step is there so she
// remembers, decided 2026-10-26). The step is the state; the screen renders the one that is active
// and a progress strip above it.

import { assign, fromPromise, setup } from 'xstate';

import { addBook } from '@/lib/actions';
import { takePhoto } from '@/lib/images';
import { play } from '@/lib/sounds';
import { captureError } from '@/lib/telemetry';
import type { Book } from '@/lib/types';

export const STEPS = ['picture', 'title', 'author', 'rating'] as const;
export type Step = (typeof STEPS)[number];

type Context = {
  /** The step on screen. Stays put through picking, saving, saved and closed, so nothing flashes on the way out. */
  step: Step;
  title: string;
  author: string;
  coverUri: string | null;
  rating: number | null;
  book: Book | null;
};
type Events =
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_AUTHOR'; author: string }
  | { type: 'SET_RATING'; rating: number }
  | { type: 'PHOTO' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'CLOSE' };

export const newBookMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    pick: fromPromise(() => takePhoto()),
    save: fromPromise(({ input }: { input: Context }) =>
      addBook({ title: input.title.trim(), author: input.author.trim() || null, coverUri: input.coverUri, rating: input.rating }),
    ),
  },
  guards: {
    hasTitle: ({ context }) => context.title.trim().length > 0,
  },
  actions: {
    /** Each step arrives like a screen: the swish. */
    stepIn: () => play('screen-in'),
    setStep: assign((_, params: { step: Step }) => ({ step: params.step })),
  },
}).createMachine({
  id: 'newBook',
  context: { step: 'picture', title: '', author: '', coverUri: null, rating: null, book: null },
  initial: 'picture',
  on: { CLOSE: '.closed' },
  states: {
    picture: {
      entry: { type: 'setStep', params: { step: 'picture' } },
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
      entry: [{ type: 'setStep', params: { step: 'title' } }, 'stepIn'],
      on: {
        SET_TITLE: { actions: assign({ title: ({ event }) => event.title }) },
        NEXT: { guard: 'hasTitle', target: 'author' },
        BACK: 'picture',
      },
    },
    author: {
      entry: [{ type: 'setStep', params: { step: 'author' } }, 'stepIn'],
      on: {
        SET_AUTHOR: { actions: assign({ author: ({ event }) => event.author }) },
        NEXT: 'rating',
        BACK: 'title',
      },
    },
    rating: {
      entry: [{ type: 'setStep', params: { step: 'rating' } }, 'stepIn'],
      on: {
        SET_RATING: { actions: assign({ rating: ({ event }) => event.rating }) },
        NEXT: 'saving',
        BACK: 'author',
      },
    },
    saving: {
      invoke: {
        src: 'save',
        input: ({ context }) => context,
        onDone: { target: 'saved', actions: assign({ book: ({ event }) => event.output }) },
        onError: { target: 'rating', actions: ({ event, context }) => captureError('book.new.save', event.error, { hasCover: !!context.coverUri }) },
      },
    },
    saved: { type: 'final' },
    closed: { type: 'final' },
  },
});
