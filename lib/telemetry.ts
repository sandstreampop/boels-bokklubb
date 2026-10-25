// Observability for the whole app. Every screen, action and background job writes events here.
//
// - Events go to a durable local buffer first (a sync file write, so a crash cannot lose them),
//   then to the `app_events` table in Supabase on launch, on foreground, after any error, and every
//   20 seconds while something is pending. Read them with `npm run logs`.
// - Uncaught JS errors, unhandled promise rejections, console.error and console.warn are captured.
// - A launch marker detects exits that were not clean (native crashes, jetsam) and reports the
//   breadcrumbs that led up to them on the next launch.
//
// Never log the password or any token. Book titles and entry text are fine: it is a family diary
// and the table is behind the family login.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { dirs } from './files';
import { uuid } from './ids';
import { supabase } from './supabase';

export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type Data = Record<string, unknown>;

export type AppEvent = {
  id: string;
  at: string;
  session_id: string;
  seq: number;
  level: Level;
  event: string;
  data: Data | null;
};

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const CRUMBS = 40;
const BATCH = 100;
const PENDING_CAP = 2000;
const FLUSH_EVERY_MS = 20_000;

export const sessionId = uuid();
let installId: string | null = null;
let seq = 0;
let pending: AppEvent[] = [];
const crumbs: AppEvent[] = [];
let started = false;
let appState: AppStateStatus = (AppState.currentState as AppStateStatus | null) ?? 'active';
let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// ---- files ---------------------------------------------------------------------------------------

function pendingFile() {
  return new File(dirs.root(), 'telemetry-pending.json');
}
function markerFile() {
  return new File(dirs.root(), 'launch-marker.json');
}

function writeJson(f: File, value: unknown) {
  try {
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(value));
  } catch {
    // The file system is the one thing we cannot report through itself.
  }
}

function readJson<T>(f: File): T | null {
  try {
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as T;
  } catch {
    return null;
  }
}

// ---- context ---------------------------------------------------------------------------------------

/** Static facts about this install, stored on every event so a log line stands on its own. */
export function appContext() {
  return {
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    os: `${Platform.OS} ${Device.osVersion ?? String(Platform.Version)}`,
    device: Device.modelName,
    dev: __DEV__,
  };
}

// ---- recording -------------------------------------------------------------------------------------

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 200);
}

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  writeJson(pendingFile(), pending);
  writeJson(markerFile(), { session_id: sessionId, state: appState, at: new Date().toISOString(), crumbs });
}

function record(level: Level, event: string, data?: Data | null): AppEvent {
  const e: AppEvent = {
    id: uuid(),
    at: new Date().toISOString(),
    session_id: sessionId,
    seq: seq++,
    level,
    event,
    data: data ?? null,
  };
  crumbs.push(e);
  if (crumbs.length > CRUMBS) crumbs.shift();
  pending.push(e);
  if (pending.length > PENDING_CAP) pending = pending.slice(-PENDING_CAP);
  if (level === 'fatal') persistNow();
  else persistSoon();
  if (LEVEL_RANK[level] >= LEVEL_RANK.error) flushSoon(500);
  return e;
}

export function log(level: Level, event: string, data?: Data | null) {
  record(level, event, data);
}
export const debug = (event: string, data?: Data | null) => record('debug', event, data);
export const info = (event: string, data?: Data | null) => record('info', event, data);
export const warn = (event: string, data?: Data | null) => record('warn', event, data);

/** Turn anything thrown into plain data. Supabase errors are objects, not Error instances. */
export function describeError(err: unknown): Data {
  if (err instanceof Error) {
    const extra: Data = {};
    for (const k of ['code', 'status', 'statusCode', 'details', 'hint', 'name'] as const) {
      const v = (err as unknown as Data)[k];
      if (v !== undefined && v !== null && k !== 'name') extra[k] = v;
    }
    return { name: err.name, message: err.message, stack: trimStack(err.stack), ...extra, cause: err.cause ? describeError(err.cause) : undefined };
  }
  if (err && typeof err === 'object') {
    const o = err as Data;
    return {
      message: typeof o.message === 'string' ? o.message : safeJson(err),
      code: o.code,
      status: o.status ?? o.statusCode,
      details: o.details,
      hint: o.hint,
    };
  }
  return { message: String(err) };
}

function trimStack(stack?: string) {
  if (!stack) return undefined;
  return stack.split('\n').slice(0, 25).join('\n');
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v).slice(0, 2000);
  } catch {
    return String(v);
  }
}

/** Log a caught error with the breadcrumbs that preceded it. */
export function captureError(scope: string, err: unknown, data?: Data, level: Level = 'error') {
  record(level, `${scope}.error`, { ...data, error: describeError(err), crumbs: crumbs.slice(-12).map(brief) });
}

function brief(e: AppEvent) {
  return `${e.at.slice(11, 23)} ${e.level} ${e.event}`;
}

/** Wrap an async operation: logs start, ok with duration, or the error (which is rethrown). */
export async function traced<T>(name: string, data: Data | null, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  debug(`${name}.start`, data);
  try {
    const out = await fn();
    info(`${name}.ok`, { ...data, ms: Date.now() - t0 });
    return out;
  } catch (err) {
    captureError(name, err, { ...data, ms: Date.now() - t0 });
    throw err;
  }
}

// ---- shipping --------------------------------------------------------------------------------------

function flushSoon(ms = FLUSH_EVERY_MS) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), ms);
}

export async function flush(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (flushing) return;
  if (pending.length === 0) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const ctx = { ...appContext(), install_id: installId };
    while (pending.length > 0) {
      const batch = pending.slice(0, BATCH);
      const rows = batch.map((e) => ({ ...e, install_id: installId, app: ctx }));
      const { error } = await supabase.from('app_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        // Keep the buffer; try again on the next trigger. Do not log the failure as an event or we
        // would grow the buffer with every failed flush.
        console.log('telemetry flush failed', error.message);
        return;
      }
      const sent = new Set(batch.map((e) => e.id));
      pending = pending.filter((e) => !sent.has(e.id));
      persistNow();
    }
  } catch (err) {
    console.log('telemetry flush threw', (err as Error)?.message);
  } finally {
    flushing = false;
    if (pending.length > 0) flushSoon();
  }
}

// ---- startup --------------------------------------------------------------------------------------

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = { getGlobalHandler?: () => GlobalErrorHandler; setGlobalHandler?: (h: GlobalErrorHandler) => void };
type HermesLike = {
  enablePromiseRejectionTracker?: (o: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
};

/** Call once, as early as possible. Safe to call again. */
export function startTelemetry() {
  if (started) return;
  started = true;

  // Buffered events from an earlier launch, then this launch's own marker.
  const previous = readJson<AppEvent[]>(pendingFile());
  if (previous?.length) pending = previous.concat(pending);
  const marker = readJson<{ session_id: string; state: AppStateStatus; at: string; crumbs: AppEvent[] }>(markerFile());

  const g = globalThis as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesLike };
  const previousHandler = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
    record(isFatal ? 'fatal' : 'error', 'js.uncaught', { fatal: !!isFatal, error: describeError(error), crumbs: crumbs.slice(-12).map(brief) });
    previousHandler?.(error, isFatal);
  });
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (id, rejection) => captureError('promise.unhandled', rejection, { id }),
    onHandled: () => {},
  });

  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    record('error', 'console.error', { args: args.map(describeArg) });
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    record('warn', 'console.warn', { args: args.map(describeArg) });
    origWarn(...args);
  };

  AppState.addEventListener('change', (s) => {
    appState = s;
    info('app.state', { state: s });
    persistNow();
    if (s === 'active') void flush();
    if (s === 'background') void flush();
  });

  void AsyncStorage.getItem('bokklubb.install_id')
    .then(async (v) => {
      installId = v ?? uuid();
      if (!v) await AsyncStorage.setItem('bokklubb.install_id', installId);
    })
    .catch(() => {
      installId = installId ?? 'unknown';
    })
    .finally(() => {
      info('app.launch', { ...appContext(), buffered: previous?.length ?? 0 });
      if (marker && marker.session_id !== sessionId) {
        const abnormal = marker.state === 'active';
        record(abnormal ? 'error' : 'info', abnormal ? 'app.abnormal_exit' : 'app.previous_exit', {
          previous_session: marker.session_id,
          last_seen: marker.at,
          state: marker.state,
          crumbs: (marker.crumbs ?? []).slice(-15).map(brief),
        });
      }
      persistNow();
      void flush();
    });
}

function describeArg(a: unknown) {
  if (a instanceof Error) return describeError(a);
  if (typeof a === 'string') return a.slice(0, 2000);
  return safeJson(a);
}

/** Called when the user is signed in (or signs in): the buffer can now be shipped. */
export function telemetrySignedIn() {
  void flush();
}
