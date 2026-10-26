// Recording a voice note. Pit of success: opens with the question and one button, every tap after
// the press stops and saves. Owns the question for the whole session.
//
//   closed ──OPEN──▶ idle ──RECORD──▶ permission ──▶ preparing ──▶ recording ──STOP / AUTO_STOPPED──▶ stopping ──▶ done
//     ▲               │ REROLL (only here)   │ denied        │ error                                                 │
//     │               │ CLOSE                ▼               ▼                                                       │
//     └───────────────┴────────────────── unavailable ◀──────┘                                closed ◀──RESET────────┘
//
// The invariant (docs/PRD-build-9.md §1, same shape as lib/machines/writer.ts): this machine holds
// the only copy of the prompt, picked at OPEN; REROLL is accepted only in `idle`, before the press;
// the crash marker and the answer handed to the book machine both read that copy, so they can never
// name a question she replaced. tests/prompts.test.ts holds the machine to this. The recorder
// object itself comes from expo-audio's hook, so it is passed in as input.

import { AudioModule, type AudioRecorder, setAudioModeAsync } from 'expo-audio';
import { assign, fromPromise, setup, type SnapshotFrom } from 'xstate';

import { pickPrompt } from '@/lib/prompts';
import { clearRecordingMarker, writeRecordingMarker } from '@/lib/recording';
import { effectsAudioMode, micOpen } from '@/lib/sounds';
import { captureError, info } from '@/lib/telemetry';

const MAX_SECONDS = 10 * 60;

type Input = { bookId: string; recorder: AudioRecorder };
type Context = Input & { prompt: string | null; startedAt: number; uri: string | null; durationMs: number };
type Events =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'REROLL' }
  | { type: 'RECORD' }
  | { type: 'STOP' }
  | { type: 'AUTO_STOPPED'; durationMs: number }
  | { type: 'RESET' };

/** What the recorder hands to the book machine: the file, its length and the question it answers. */
export type SpokenAnswer = { uri: string; durationMs: number; prompt: string | null };

export const recorderMachine = setup({
  types: { context: {} as Context, events: {} as Events, input: {} as Input },
  actors: {
    permission: fromPromise(async () => {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) info('recording.denied', { status: perm.status });
      return perm.granted;
    }),
    prepare: fromPromise(async ({ input }: { input: { recorder: AudioRecorder } }) => {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, allowsBackgroundRecording: true });
      await input.recorder.prepareToRecordAsync();
    }),
    stop: fromPromise(async ({ input }: { input: { recorder: AudioRecorder } }) => {
      try {
        if (input.recorder.isRecording) await input.recorder.stop();
      } finally {
        // Back to the resting mode: effects obey the ring switch again (her recordings set their own).
        await setAudioModeAsync(effectsAudioMode).catch(() => {});
      }
      return input.recorder.uri;
    }),
  },
  actions: {
    pick: assign({ prompt: () => pickPrompt('speak') }),
    markStarted: assign({ startedAt: () => Date.now() }),
    record: ({ context }) => {
      context.recorder.record({ forDuration: MAX_SECONDS });
      info('recording.start', { bookId: context.bookId, uri: context.recorder.uri, prompt: context.prompt });
      if (context.recorder.uri) {
        void writeRecordingMarker({
          bookId: context.bookId,
          uri: context.recorder.uri,
          startedAt: new Date(context.startedAt).toISOString(),
          prompt: context.prompt,
        });
      }
    },
    close: assign({ prompt: null, uri: null, durationMs: 0, startedAt: 0 }),
  },
}).createMachine({
  id: 'recorder',
  context: ({ input }) => ({ ...input, prompt: null, startedAt: 0, uri: null, durationMs: 0 }),
  initial: 'closed',
  states: {
    closed: {
      on: { OPEN: { target: 'idle', actions: 'pick' } },
    },
    idle: {
      on: {
        REROLL: { actions: 'pick' },
        RECORD: 'permission',
        CLOSE: { target: 'closed', actions: 'close' },
      },
    },
    permission: {
      // From the press on record until done, no effect plays: a pop would end up in her voice note.
      entry: () => micOpen(true),
      invoke: {
        src: 'permission',
        onDone: [{ guard: ({ event }) => event.output, target: 'preparing' }, { target: 'unavailable' }],
        onError: { target: 'unavailable', actions: ({ event, context }) => captureError('recording.permission', event.error, { bookId: context.bookId }) },
      },
    },
    preparing: {
      invoke: {
        src: 'prepare',
        input: ({ context }) => ({ recorder: context.recorder }),
        onDone: { target: 'recording', actions: ['markStarted', 'record'] },
        onError: { target: 'unavailable', actions: ({ event, context }) => captureError('recording.start', event.error, { bookId: context.bookId }) },
      },
    },
    recording: {
      on: {
        STOP: 'stopping',
        AUTO_STOPPED: { target: 'stopping', actions: assign({ durationMs: ({ event }) => event.durationMs }) },
      },
    },
    stopping: {
      invoke: {
        src: 'stop',
        input: ({ context }) => ({ recorder: context.recorder }),
        onDone: {
          target: 'done',
          actions: assign({
            uri: ({ event }) => event.output,
            durationMs: ({ context }) => Math.max(context.durationMs, Date.now() - context.startedAt),
          }),
        },
        onError: {
          target: 'done',
          actions: [
            ({ event, context }) => captureError('recording.stop', event.error, { bookId: context.bookId }),
            assign({
              uri: ({ context }) => context.recorder.uri,
              durationMs: ({ context }) => Math.max(context.durationMs, Date.now() - context.startedAt),
            }),
          ],
        },
      },
    },
    done: {
      entry: ({ context }) => {
        micOpen(false);
        clearRecordingMarker();
        info('recording.done', { bookId: context.bookId, durationMs: context.durationMs, hasUri: !!context.uri });
      },
      on: { RESET: { target: 'closed', actions: 'close' } },
    },
    unavailable: {
      entry: () => micOpen(false),
      on: { RESET: { target: 'closed', actions: 'close' } },
    },
  },
});

export type RecorderSnapshot = SnapshotFrom<typeof recorderMachine>;

/** The answer as the machine holds it in `done`; null when there is no file (the overlay reports unavailable). */
export const spokenAnswer = (s: RecorderSnapshot): SpokenAnswer | null =>
  s.context.uri ? { uri: s.context.uri, durationMs: s.context.durationMs, prompt: s.context.prompt } : null;

/** Whether the wand is lit: only before the record button is pressed. */
export const canReroll = (s: RecorderSnapshot): boolean => s.can({ type: 'REROLL' });
