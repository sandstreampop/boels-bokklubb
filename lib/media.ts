// Resolves a storage path to something <Image> or the audio player can open: the local file if this
// device has it, otherwise a download into the durable media folder via a short-lived signed URL.

import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { dirs, fileExists, rebase } from './files';
import { getState, rememberLocalMedia, useStore } from './store';
import { supabase } from './supabase';
import { captureError, debug } from './telemetry';

const inflight = new Map<string, Promise<string | null>>();

function localNameFor(path: string) {
  return path.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function resolveMedia(bucket: 'covers' | 'media', path: string): Promise<string | null> {
  const known = getState().localMedia[path];
  if (known && fileExists(known)) return rebase(known);

  const dest = new File(dirs.media(), localNameFor(path));
  if (dest.exists && dest.size > 0) {
    rememberLocalMedia(path, dest.uri);
    return dest.uri;
  }

  const existing = inflight.get(path);
  if (existing) return existing;

  const p = (async () => {
    try {
      const t0 = Date.now();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
      if (error) throw error;
      if (!data?.signedUrl) return null;
      if (dest.exists) dest.delete();
      const file = await File.downloadFileAsync(data.signedUrl, dest);
      rememberLocalMedia(path, file.uri);
      debug('media.download.ok', { bucket, path, bytes: file.size, ms: Date.now() - t0 });
      return file.uri;
    } catch (err) {
      captureError('media.download', err, { bucket, path }, 'warn');
      return null;
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, p);
  return p;
}

export function useMediaUri(bucket: 'covers' | 'media', path: string | null): string | null {
  const known = useStore((s) => (path ? s.localMedia[path] : undefined));
  const [uri, setUri] = useState<string | null>(known ? rebase(known) : null);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUri(null);
      return;
    }
    if (known && fileExists(known)) {
      setUri(rebase(known));
      return;
    }
    resolveMedia(bucket, path).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [bucket, path, known]);

  return uri;
}
