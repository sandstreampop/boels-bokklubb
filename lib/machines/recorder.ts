// Recording a voice note. Pit of success: starts the moment it opens, every tap stops and saves.
//
//   idle ──START──▶ permission ──▶ preparing ──▶ recording ──STOP / AUTO_STOPPED──▶ stopping ──▶ done
//                      │ denied        │ error                                                    │
//                      ▼               ▼                                                          │
//                  unavailable ◀───────┘                                       idle ◀──RESET──────┘
//
// The recorder object itself comes from expo-audio's hook, so it is passed in as input.

import { AudioModule, type AudioRecorder, setAudioModeAsync } from 'expo-audio';
import { assign, fromPromise, setup } from 'xstate';

import { clearRecordingMarker, writeRecordingMarker } from '@/lib/recording';
import { captureError, info } from '@/lib/telemetry';

const MAX_SECONDS = 10 * 60;

type Input = { bookId: string; recorder: AudioRecorder };
type Context = Input & { startedAt: number; uri: string | null; durationMs: number; prompt: string | null };
type Events =
  | { type: 'START'; prompt: string | null }
  | { type: 'STOP' }
  | { type: 'AUTO_STOPPED'; durationMs: number }
  | { type: 'RESET' };

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
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      }
      return input.recorder.uri;
    }),
  },
  actions: {
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
  },
}).createMachine({
  id: 'recorder',
  context: ({ input }) => ({ ...input, startedAt: 0, uri: null, durationMs: 0, prompt: null }),
  initial: 'idle',
  states: {
    idle: { on: { START: { target: 'permission', actions: assign({ prompt: ({ event }) => event.prompt }) } } },
    permission: {
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
        clearRecordingMarker();
        info('recording.done', { bookId: context.bookId, durationMs: context.durationMs, hasUri: !!context.uri });
      },
      on: { RESET: { target: 'idle', actions: assign({ uri: null, durationMs: 0, startedAt: 0 }) } },
    },
    unavailable: {
      on: { RESET: 'idle' },
    },
  },
});
