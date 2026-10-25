// Crash insurance for recordings. Before recording starts we write a marker naming the book and the
// file. If the app dies mid-ramble, the next launch finds the marker and saves the file as an entry.

import { File } from 'expo-file-system';

import { addAudioEntry } from './actions';
import { dirs, fileExists, fileSize } from './files';

type Marker = { bookId: string; uri: string; startedAt: string };

function markerFile() {
  return new File(dirs.root(), 'recording-in-progress.json');
}

export async function writeRecordingMarker(m: Marker): Promise<void> {
  try {
    const f = markerFile();
    if (!f.exists) f.create();
    await f.write(JSON.stringify(m));
  } catch (err) {
    console.warn('marker write failed', err);
  }
}

export function clearRecordingMarker(): void {
  try {
    const f = markerFile();
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

/** Called once at startup. Returns true if a stranded recording was rescued. */
export async function recoverStrandedRecording(): Promise<boolean> {
  try {
    const f = markerFile();
    if (!f.exists) return false;
    const m = JSON.parse(await f.text()) as Marker;
    f.delete();
    if (!m.uri || !fileExists(m.uri) || fileSize(m.uri) < 2048) return false;
    const startedAt = new Date(m.startedAt).getTime();
    const durationMs = Math.max(1000, Math.min(Date.now() - startedAt, 15 * 60 * 1000));
    await addAudioEntry(m.bookId, m.uri, durationMs, m.startedAt);
    return true;
  } catch {
    return false;
  }
}
