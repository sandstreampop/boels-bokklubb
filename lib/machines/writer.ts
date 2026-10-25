// Writing a thought, full screen, like recording. Opens with the prompt, saves on done.
//
//   idle ──START(prompt)──▶ writing ──DONE (text)──▶ saving ──▶ done ──RESET──▶ idle
//                              │ DONE (empty)                                   ▲
//                              └────────────────────────────────────────────────┘
//
// There is no cancel: done with nothing typed just closes, done with text saves it. The prompt
// is owned by the book machine (it is also what the wand rerolls) and passed in with START; the
// one on screen at DONE is the one stored with the entry.

import { assign, fromPromise, setup } from 'xstate';

import { addTextEntry } from '@/lib/actions';
import { unicornTouched } from '@/lib/machines/unicorn';
import { captureError } from '@/lib/telemetry';

type Input = { bookId: string };
type Context = Input & { text: string; prompt: string | null };
type Events = { type: 'START'; prompt: string | null } | { type: 'SET_TEXT'; text: string } | { type: 'DONE' } | { type: 'RESET' };

export const writerMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    save: fromPromise(({ input }: { input: { bookId: string; text: string; prompt: string | null } }) =>
      addTextEntry(input.bookId, input.text, input.prompt),
    ),
  },
  guards: {
    hasText: ({ context }) => context.text.trim().length > 0,
  },
}).createMachine({
  id: 'writer',
  context: ({ input }) => ({ ...input, text: '', prompt: null }),
  initial: 'idle',
  states: {
    idle: {
      on: { START: { target: 'writing', actions: assign({ prompt: ({ event }) => event.prompt, text: '' }) } },
    },
    writing: {
      on: {
        // Typing counts as a touch: the unicorn does not yawn at her mid-sentence.
        SET_TEXT: { actions: [assign({ text: ({ event }) => event.text }), () => unicornTouched()] },
        DONE: [{ guard: 'hasText', target: 'saving' }, { target: 'done' }],
      },
    },
    saving: {
      invoke: {
        src: 'save',
        input: ({ context }) => ({ bookId: context.bookId, text: context.text.trim(), prompt: context.prompt }),
        onDone: 'done',
        onError: { target: 'done', actions: ({ event, context }) => captureError('writer.save', event.error, { bookId: context.bookId }) },
      },
    },
    done: {
      on: { RESET: { target: 'idle', actions: assign({ text: '', prompt: null }) } },
    },
  },
});
