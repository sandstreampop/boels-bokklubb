// Every machine in the app is created with this inspector, so each state transition becomes a
// telemetry breadcrumb and every failed actor is reported. Pass `{ inspect }` to useMachine,
// createActor and createActorContext.

import type { InspectionEvent } from 'xstate';

import { captureError, debug } from '@/lib/telemetry';

type Snap = { status?: string; value?: unknown; error?: unknown; context?: Record<string, unknown> };

function stateName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}.${stateName(v)}`)
      .join('|');
  }
  return String(value);
}

export function inspect(ev: InspectionEvent) {
  if (ev.type !== '@xstate.snapshot') return;
  // Only the root machine of each actor system. Promise actors inside it also emit snapshots.
  if (ev.actorRef.sessionId !== ev.rootId) return;
  const snap = ev.snapshot as Snap;
  const id = (ev.actorRef as { id?: string }).id ?? 'machine';
  if (snap.status === 'error') {
    captureError(`machine.${id}`, snap.error, { event: ev.event.type, state: stateName(snap.value) });
    return;
  }
  if (ev.event.type === 'xstate.init') return;
  // Typing is not a transition worth a row per keystroke.
  if (ev.event.type.startsWith('SET_')) return;
  debug('machine', { id, event: ev.event.type, state: stateName(snap.value) });
}
