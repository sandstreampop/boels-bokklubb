// Errors only (docs/PRD-build-8.md): a ring of breadcrumbs (route, fetch, play) that is sent with
// an error to the feed function, which files it in app_events with source feed. No page loads,
// no plays, nothing on its own.

import { report } from './api';

type Data = Record<string, unknown>;
type Crumb = { at: string; event: string; data: Data | null };

const CRUMBS = 40;
const MAX_REPORTS = 10;
const crumbs: Crumb[] = [];
const sessionId = `web-${Math.random().toString(36).slice(2, 10)}`;
let reports = 0;

export function crumb(event: string, data?: Data | null) {
  crumbs.push({ at: new Date().toISOString(), event, data: data ?? null });
  if (crumbs.length > CRUMBS) crumbs.shift();
}

export function describeError(err: unknown): Data {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 15).join('\n'), ...('status' in err ? { status: (err as { status: unknown }).status } : {}) };
  }
  if (err && typeof err === 'object') {
    const o = err as Data;
    return { message: typeof o.message === 'string' ? o.message : safeJson(err) };
  }
  return { message: String(err) };
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v).slice(0, 2000);
  } catch {
    return String(v);
  }
}

/** A caught error with the breadcrumbs before it. Reports to the function at most ten times per page load. */
export function captureError(scope: string, err: unknown, data?: Data) {
  const error = describeError(err);
  crumb(`${scope}.error`, { message: error.message });
  if (reports >= MAX_REPORTS) return;
  reports++;
  void report({
    event: `${scope}.error`,
    ...data,
    error,
    route: location.hash,
    crumbs: crumbs.slice(-12).map((c) => `${c.at.slice(11, 23)} ${c.event}`),
    session_id: sessionId,
  }).catch(() => {});
}

/** Call once. Uncaught errors and unhandled rejections are reported like caught ones. */
export function startTelemetry() {
  window.addEventListener('error', (e) => captureError('js.uncaught', e.error ?? e.message, { source: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => captureError('promise.unhandled', e.reason));
}
