import { Directory, File, Paths } from 'expo-file-system';

/** Durable folders under the app's document directory. Nothing here is evicted by iOS. */
export const dirs = {
  root: () => ensureDir(new Directory(Paths.document, 'bokklubb')),
  queue: () => ensureDir(new Directory(Paths.document, 'bokklubb', 'queue')),
  media: () => ensureDir(new Directory(Paths.document, 'bokklubb', 'media')),
};

export function ensureDir(d: Directory): Directory {
  try {
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  } catch {
    // Already exists or race; fine.
  }
  return d;
}

export function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function fileSize(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** Move a temp file (camera roll copy, recorder output) into our durable folder and return its new uri. */
export async function keepFile(srcUri: string, dir: Directory, name: string): Promise<string> {
  const src = new File(srcUri);
  const dest = new File(dir, name);
  if (dest.exists) dest.delete();
  try {
    await src.move(dest);
  } catch {
    await src.copy(dest);
  }
  return dest.uri;
}

export function deleteFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

export function extensionOf(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const m = /\.([a-zA-Z0-9]+)$/.exec(clean);
  return (m ? m[1] : fallback).toLowerCase();
}

export function mimeFor(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'm4a':
    case 'mp4':
    case 'aac':
      return 'audio/mp4';
    case 'caf':
      return 'audio/x-caf';
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    default:
      return 'application/octet-stream';
  }
}
