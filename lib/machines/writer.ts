// Writing a thought, full screen, like recording. Owns the question for the whole session.
//
//   idle ──START──▶ writing.blank ──(text typed)──▶ writing.answering ──(text cleared)──▶ writing.blank
//                      │ REROLL: a new question         REROLL is not accepted here
//                      └──── DONE from either ────▶ done ──RESET──▶ idle
//
// The invariant (docs/PRD-build-9.md §1): the question stored with her words is the one on screen
// when she pressed done, and it cannot change once she has started. Both follow from the shape,
// not from the screen: this machine holds the only copy of the prompt (picked at START, replaced
// only by REROLL, which only `blank` accepts), the overlay asks `canReroll` to know whether to show
// the wand lit, and the answer handed to the book machine is read from that copy at done. The
// blank/answering pair is derived from the text by eventless transitions, so the lock can never
// disagree with what she typed. tests/prompts.test.ts holds the machine to this.
//
// There is no cancel: done with nothing typed hands over empty text, which saves nothing.

import { assign, not, setup, type SnapshotFrom } from 'xstate';

import { pickPrompt } from '@/lib/prompts';

type Input = { bookId: string };
type Context = Input & { text: string; prompt: string | null };
type Events = { type: 'START' } | { type: 'REROLL' } | { type: 'SET_TEXT'; text: string } | { type: 'DONE' } | { type: 'RESET' };

/** What the writer hands to the book machine: her words and the question they answer. */
export type WrittenAnswer = { text: string; prompt: string | null };

export const writerMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  guards: {
    hasText: ({ context }) => context.text.length > 0,
  },
  actions: {
    pick: assign({ prompt: () => pickPrompt('write') }),
  },
}).createMachine({
  id: 'writer',
  context: ({ input }) => ({ ...input, text: '', prompt: null }),
  initial: 'idle',
  states: {
    idle: {
      on: { START: { target: 'writing', actions: ['pick', assign({ text: '' })] } },
    },
    writing: {
      initial: 'blank',
      on: {
        SET_TEXT: { actions: assign({ text: ({ event }) => event.text }) },
        DONE: 'done',
      },
      states: {
        blank: {
          on: { REROLL: { actions: 'pick' } },
          always: { guard: 'hasText', target: 'answering' },
        },
        answering: {
          always: { guard: not('hasText'), target: 'blank' },
        },
      },
    },
    done: {
      on: { RESET: { target: 'idle', actions: assign({ text: '', prompt: null }) } },
    },
  },
});

export type WriterSnapshot = SnapshotFrom<typeof writerMachine>;

/** The answer as the machine holds it: read in `done`, handed to the book machine as WRITING_DONE. */
export const writtenAnswer = (s: WriterSnapshot): WrittenAnswer => ({ text: s.context.text.trim(), prompt: s.context.prompt });

/** Whether the wand is lit: true only while the field is blank. The machine decides, the wand shows. */
export const canReroll = (s: WriterSnapshot): boolean => s.can({ type: 'REROLL' });
