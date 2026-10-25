// The files lib/telemetry.ts buffers to, on their own so a module that telemetry itself imports
// (lib/supabase.ts) can write a fatal event before throwing at load, without a circular import.
// Sync writes: a crash cannot lose them.

import { File } from 'expo-file-system';

import { dirs } from './files';
import { uuid } from './ids';

export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type AppEvent = {
  id: string;
  at: string;
  session_id: string;
  seq: number;
  level: Level;
  event: string;
  data: Record<string, unknown> | null;
};

export function pendingFile() {
  return new File(dirs.root(), 'telemetry-pending.json');
}
export function markerFile() {
  return new File(dirs.root(), 'launch-marker.json');
}

export function writeJson(f: File, value: unknown) {
  try {
    if (!f.exists) f.create();
    f.writeSync(JSON.stringify(value));
  } catch {
    // The file system is the one thing we cannot report through itself.
  }
}

export function readJson<T>(f: File): T | null {
  try {
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as T;
  } catch {
    return null;
  }
}

/**
 * Appends one fatal event straight to the pending buffer, for the moment before telemetry has
 * started (a module throwing at load). The next launch ships it with the rest.
 */
export function writeFatalNow(event: string, data: Record<string, unknown>) {
  const previous = readJson<AppEvent[]>(pendingFile()) ?? [];
  previous.push({ id: uuid(), at: new Date().toISOString(), session_id: 'load', seq: previous.length, level: 'fatal', event, data });
  writeJson(pendingFile(), previous);
}
