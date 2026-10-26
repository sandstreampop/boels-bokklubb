// The app's top-level lifecycle: boot the cache and the session, then stay signed in or wait for
// the family password. Started once by app/_layout.tsx through AppActor.Provider.
//
//   booting ──session──▶ signedIn ◀──SIGN_IN ok── signingIn
//      │                    │                         ▲
//      └──no session──▶ signedOut ──SIGN_IN──────────┘
//                           ▲          (fail: loginFailures + 1)
//                           └── SESSION_CHANGED(null) from anywhere

import { createActorContext } from '@xstate/react';
import type { Session } from '@supabase/supabase-js';
import { assign, fromPromise, setup } from 'xstate';

import { inspect } from './inspect';
import { startOutbox, wakeOutbox } from './outbox';
import { features } from '@/lib/features';
import { recoverStrandedRecording } from '@/lib/recording';
import { loadState } from '@/lib/store';
import { FAMILY_EMAIL, serverPassword, supabase } from '@/lib/supabase';
import { captureError, describeError, info, telemetrySignedIn } from '@/lib/telemetry';
import { sweepTranscriptions } from '@/lib/transcribe';

type Context = {
  session: Session | null;
  /** What is typed in the login field. Cleared after a failed attempt. */
  password: string;
  loginFailures: number;
  lastError: string | null;
};

type Events =
  | { type: 'SET_PASSWORD'; password: string }
  | { type: 'SIGN_IN' }
  | { type: 'SESSION_CHANGED'; session: Session | null; event?: string };

export const appMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    boot: fromPromise(async () => {
      await loadState();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    }),
    signIn: fromPromise(async ({ input }: { input: { password: string } }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: FAMILY_EMAIL,
        password: serverPassword(input.password),
      });
      if (error) throw error;
      return data.session;
    }),
  },
  actions: {
    onSignedIn: () => {
      telemetrySignedIn();
      startOutbox();
      wakeOutbox();
      void recoverStrandedRecording();
      if (features.transcription) sweepTranscriptions();
    },
  },
  guards: {
    hasSession: ({ context }) => context.session !== null,
    hasPassword: ({ context }) => context.password.length > 0,
    eventHasSession: ({ event }) => event.type === 'SESSION_CHANGED' && event.session !== null,
  },
}).createMachine({
  id: 'app',
  context: { session: null, password: '', loginFailures: 0, lastError: null },
  initial: 'booting',
  on: {
    SESSION_CHANGED: [
      { guard: 'eventHasSession', target: '.signedIn', actions: assign({ session: ({ event }) => event.session }) },
      { target: '.signedOut', actions: assign({ session: null }) },
    ],
  },
  states: {
    booting: {
      invoke: {
        src: 'boot',
        onDone: [
          { guard: ({ event }) => event.output !== null, target: 'signedIn', actions: assign({ session: ({ event }) => event.output }) },
          { target: 'signedOut' },
        ],
        onError: {
          target: 'signedOut',
          actions: ({ event }) => captureError('app.boot', event.error),
        },
      },
    },
    signedOut: {
      entry: () => info('auth.signedOut'),
      on: {
        SET_PASSWORD: { actions: assign({ password: ({ event }) => event.password }) },
        SIGN_IN: { guard: 'hasPassword', target: 'signingIn' },
      },
    },
    signingIn: {
      invoke: {
        src: 'signIn',
        input: ({ context }) => ({ password: context.password }),
        onDone: {
          target: 'signedIn',
          actions: [assign({ session: ({ event }) => event.output, password: '', loginFailures: 0, lastError: null }), () => info('login.ok')],
        },
        onError: {
          target: 'signedOut',
          actions: [
            assign({
              password: '',
              loginFailures: ({ context }) => context.loginFailures + 1,
              lastError: ({ event }) => String(describeError(event.error).message ?? 'login failed'),
            }),
            ({ event, context }) => captureError('login', event.error, { failures: context.loginFailures + 1 }, 'warn'),
          ],
        },
      },
    },
    signedIn: {
      entry: ['onSignedIn', () => info('auth.signedIn')],
      on: {
        // Token refreshes arrive here too; update the session without re-running the entry actions.
        SESSION_CHANGED: [
          { guard: 'eventHasSession', actions: assign({ session: ({ event }) => event.session }) },
          { target: 'signedOut', actions: assign({ session: null }) },
        ],
      },
    },
  },
});

export const AppActor = createActorContext(appMachine, { inspect });
