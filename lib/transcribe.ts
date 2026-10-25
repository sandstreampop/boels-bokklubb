import { patchEntry } from './store';
import { supabase } from './supabase';
import { captureError, info } from './telemetry';

/** Ask the edge function to transcribe one entry, then pull the result into the store. */
export async function requestTranscription(entryId: string, bookId: string): Promise<void> {
  const t0 = Date.now();
  try {
    const { error } = await supabase.functions.invoke('transcribe', { body: { entryId } });
    if (error) throw error;
    info('transcribe.invoke.ok', { entryId, ms: Date.now() - t0 });
  } catch (err) {
    captureError('transcribe.invoke', err, { entryId, ms: Date.now() - t0 }, 'warn');
  }
  await refreshTranscript(entryId, bookId);
}

export async function refreshTranscript(entryId: string, bookId: string): Promise<void> {
  const { data, error } = await supabase
    .from('entries')
    .select('transcript, transcript_status')
    .eq('id', entryId)
    .maybeSingle();
  if (error) captureError('transcribe.refresh', error, { entryId }, 'warn');
  if (data) {
    info('transcribe.result', { entryId, status: data.transcript_status, chars: data.transcript?.length ?? 0 });
    patchEntry(bookId, entryId, { transcript: data.transcript, transcript_status: data.transcript_status });
  }
}

/** Catch anything left half-done, for example if the app was closed mid-upload. Fire and forget. */
export function sweepTranscriptions(): void {
  supabase.functions
    .invoke('transcribe', { body: { sweep: true } })
    .then(({ error }) => {
      if (error) captureError('transcribe.sweep', error, undefined, 'warn');
    })
    .catch((err) => captureError('transcribe.sweep', err, undefined, 'warn'));
}
