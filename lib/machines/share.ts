// Sharing a card as an image. One module-level actor: a share button asks for a card, the hidden
// ShareCard renders it, view-shot captures it, a preview sheet shows the picture with Share and
// Cancel, the iOS share sheet opens on Share, and the file is removed when it all closes.
//
//   idle ──SHARE(target)──▶ rendering ──READY(capture)──▶ capturing ──▶ previewing ──CONFIRM──▶ sharing ──▶ idle
//                              │ 5 s without READY (a missing image, say)  │ error      │ CANCEL              │ error
//                              └──────────────────────────▶ idle ◀─────────┴────────────┴─────────────────────┘
//
// iOS reports the sheet closing but not whether she sent or cancelled, so the breadcrumb is
// `share.closed` for both.

import * as Sharing from 'expo-sharing';
import { assign, createActor, fromPromise, setup } from 'xstate';

import { inspect } from './inspect';
import { deleteFile } from '@/lib/files';
import { captureError, info, traced, warn } from '@/lib/telemetry';

export type ShareTarget = { kind: 'entry'; entryId: string; bookId: string } | { kind: 'stats' };

type Context = { target: ShareTarget | null; capture: (() => Promise<string>) | null; uri: string | null };
type Events =
  | { type: 'SHARE'; target: ShareTarget }
  | { type: 'READY'; capture: () => Promise<string> }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };

export const shareMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    capture: fromPromise(({ input }: { input: { capture: () => Promise<string>; kind: string } }) =>
      traced('share.capture', { kind: input.kind }, input.capture),
    ),
    share: fromPromise(async ({ input }: { input: { uri: string; kind: string } }) => {
      if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
      await Sharing.shareAsync(input.uri, { mimeType: 'image/png', UTI: 'public.png' });
      info('share.closed', { kind: input.kind });
    }),
  },
}).createMachine({
  id: 'share',
  context: { target: null, capture: null, uri: null },
  initial: 'idle',
  states: {
    idle: {
      entry: [({ context }) => context.uri && deleteFile(context.uri), assign({ target: null, capture: null, uri: null })],
      on: { SHARE: { target: 'rendering', actions: assign({ target: ({ event }) => event.target }) } },
    },
    rendering: {
      entry: ({ context }) => info('share.open', { kind: context.target?.kind }),
      on: { READY: { target: 'capturing', actions: assign({ capture: ({ event }) => event.capture }) } },
      after: { 5000: { target: 'idle', actions: ({ context }) => warn('share.render.timeout', { kind: context.target?.kind }) } },
    },
    capturing: {
      invoke: {
        src: 'capture',
        input: ({ context }) => ({ capture: context.capture!, kind: context.target?.kind ?? '' }),
        onDone: { target: 'previewing', actions: assign({ uri: ({ event }) => event.output }) },
        onError: { target: 'idle', actions: ({ event, context }) => captureError('share.capture', event.error, { kind: context.target?.kind }) },
      },
    },
    previewing: {
      entry: ({ context }) => info('share.preview', { kind: context.target?.kind }),
      on: {
        CONFIRM: 'sharing',
        CANCEL: { target: 'idle', actions: ({ context }) => info('share.cancel', { kind: context.target?.kind }) },
      },
    },
    sharing: {
      invoke: {
        src: 'share',
        input: ({ context }) => ({ uri: context.uri!, kind: context.target?.kind ?? '' }),
        onDone: 'idle',
        onError: { target: 'idle', actions: ({ event, context }) => captureError('share', event.error, { kind: context.target?.kind }) },
      },
    },
  },
});

export const shareActor = createActor(shareMachine, { inspect });
let started = false;

/** A share button asked for a card. Ignored while one is already on its way. */
export function startShare(target: ShareTarget) {
  if (!started) {
    started = true;
    shareActor.start();
  }
  shareActor.send({ type: 'SHARE', target });
}
