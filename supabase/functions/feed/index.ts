// The read path for the web version (docs/PRD-build-8.md). The page holds no Supabase key: it
// sends the secret link's token and the four-digit PIN once, gets a pass, and from then on asks
// this function for the library and for a book. The function reads with the service role and
// hands out signed URLs that last six hours. Nothing is written for a successful request; a wrong
// PIN counts in feed_attempts, and failures land in app_events (never the PIN).
//
//   { token, pin }                  → { pass, expiresAt }, or 401 { lockedUntil } from the fifth failure
//   { pass, screen: 'library' }     → { books, stats }
//   { pass, screen: 'book', id }    → { book, entries }
//   { pass, error }                 → 204; the error becomes an app_events row, source feed
//
// The pass is `<expiry>.<HMAC-SHA256(expiry, FEED_TOKEN + FEED_PIN)>`: rotating either secret
// (node scripts/setup.mjs feed) invalidates every device with nothing stored here.
// Deno runtime (Supabase Edge Functions). Deployed by scripts/supabase.mjs with verify_jwt false.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FEED_TOKEN = Deno.env.get("FEED_TOKEN") ?? "";
const FEED_PIN = Deno.env.get("FEED_PIN") ?? "";
// The page's origin, and the only one allowed. A domain later is a new value of this secret.
const ORIGIN = Deno.env.get("FEED_ORIGIN") ?? "https://sandstreampop.github.io";

const PASS_DAYS = 365;
const SIGNED_URL_SECONDS = 6 * 60 * 60;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const WRONG_PIN_WAIT_MS = 1000;
const ATTEMPTS_KEY = "link";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type BookRow = {
  id: string;
  created_at: string;
  title: string;
  author: string | null;
  cover_path: string | null;
  rating: number | null;
};
type EntryRow = {
  id: string;
  book_id: string;
  created_at: string;
  kind: "text" | "audio" | "photo" | "drawing";
  text: string | null;
  prompt: string | null;
  media_path: string | null;
  duration_ms: number | null;
  transcript: string | null;
  transcript_status: "none" | "pending" | "done" | "failed";
};
type Stats = { books: number; rainbow: number; audio: number; text: number; photo: number; drawing: number };

const CORS = {
  "access-control-allow-origin": ORIGIN,
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
  vary: "origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const empty = (status: number) => new Response(null, { status, headers: CORS });

// ---- telemetry: failures go to app_events like the app's own, never a successful request ---------

type Level = "warn" | "error";
const requestSession = crypto.randomUUID();
let seq = 0;

async function logEvent(level: Level, event: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  try {
    await admin.from("app_events").insert({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      session_id: typeof extra.session_id === "string" ? extra.session_id : requestSession,
      seq: seq++,
      level,
      event,
      data,
      app: { source: "feed", build: "web", version: "web", ...(extra.app ?? {}) },
    });
  } catch (err) {
    console.error("feed: could not log", event, err);
  }
}

function describeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack?.split("\n").slice(0, 12).join("\n") };
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    return { message: typeof o.message === "string" ? o.message : JSON.stringify(err).slice(0, 1000), code: o.code, details: o.details };
  }
  return { message: String(err) };
}

// ---- secrets, passes, constant-time comparison ----------------------------------------------------

const encoder = new TextEncoder();

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}

/** Equal digests, compared in time that does not depend on where they differ. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && given.length === expected.length;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(FEED_TOKEN + FEED_PIN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function issuePass(): Promise<{ pass: string; expiresAt: string }> {
  const expiry = Date.now() + PASS_DAYS * 24 * 60 * 60 * 1000;
  return { pass: `${expiry}.${await hmacHex(String(expiry))}`, expiresAt: new Date(expiry).toISOString() };
}

async function validPass(pass: unknown): Promise<boolean> {
  if (typeof pass !== "string" || pass.length > 200) return false;
  const dot = pass.indexOf(".");
  if (dot < 0) return false;
  const expiry = pass.slice(0, dot);
  const mac = pass.slice(dot + 1);
  if (!/^\d{1,16}$/.test(expiry) || Number(expiry) < Date.now()) return false;
  return sameSecret(mac, await hmacHex(expiry));
}

// ---- the lock: one row, key 'link' ---------------------------------------------------------------

type Attempts = { failures: number; locked_until: string | null };

async function readAttempts(): Promise<Attempts> {
  const { data, error } = await admin.from("feed_attempts").select("failures, locked_until").eq("key", ATTEMPTS_KEY).maybeSingle();
  if (error) throw error;
  return data ?? { failures: 0, locked_until: null };
}

async function writeAttempts(a: Attempts) {
  const { error } = await admin.from("feed_attempts").upsert({ key: ATTEMPTS_KEY, ...a, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const lockedUntil = (a: Attempts): string | null =>
  a.locked_until && new Date(a.locked_until).getTime() > Date.now() ? a.locked_until : null;

async function login(body: { token?: unknown; pin?: unknown }, ua: string | null): Promise<Response> {
  if (!FEED_TOKEN || !FEED_PIN) {
    await logEvent("error", "feed.login.unconfigured", { ua });
    return json({ error: "feed is not set up" }, 503);
  }
  const token = typeof body.token === "string" ? body.token : "";
  const pin = typeof body.pin === "string" ? body.pin : "";

  const attempts = await readAttempts();
  const until = lockedUntil(attempts);
  if (until) return json({ lockedUntil: until }, 401);
  // A lock that has passed starts the count over.
  if (attempts.locked_until && !until && attempts.failures) attempts.failures = 0;

  // A wrong token is not the link; it never counts toward the lock, or anyone could lock the family out.
  if (!(await sameSecret(token, FEED_TOKEN))) {
    await logEvent("warn", "feed.login.token", { ua });
    return json({}, 401);
  }
  if (!(await sameSecret(pin, FEED_PIN))) {
    await new Promise((r) => setTimeout(r, WRONG_PIN_WAIT_MS));
    const failures = attempts.failures + 1;
    const locked = failures >= MAX_FAILURES;
    const next: Attempts = { failures, locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null };
    await writeAttempts(next);
    await logEvent("warn", "feed.login.pin", { failures, locked, ua });
    return json(locked ? { lockedUntil: next.locked_until } : {}, 401);
  }
  if (attempts.failures || attempts.locked_until) await writeAttempts({ failures: 0, locked_until: null });
  return json(await issuePass());
}

// ---- reading: exactly what lib/store.ts computes (isComplete, selectStats); keep them in step ----

function isComplete(book: BookRow, entries: Pick<EntryRow, "kind">[]): boolean {
  if (!book.rating) return false;
  let audio = false;
  let picture = false;
  for (const e of entries) {
    if (e.kind === "audio") audio = true;
    else if (e.kind === "photo" || e.kind === "drawing") picture = true;
    if (audio && picture) return true;
  }
  return false;
}

async function signAll(bucket: "covers" | "media", paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return out;
  const { data, error } = await admin.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
    else await logEvent("warn", "feed.sign", { bucket, path: row.path, error: row.error });
  }
  return out;
}

function publicBook(row: BookRow, complete: boolean, covers: Map<string, string>) {
  return {
    id: row.id,
    created_at: row.created_at,
    title: row.title,
    author: row.author,
    rating: row.rating,
    cover_url: row.cover_path ? (covers.get(row.cover_path) ?? null) : null,
    complete,
  };
}

async function library(): Promise<Response> {
  const [{ data: books, error: e1 }, { data: kinds, error: e2 }] = await Promise.all([
    admin.from("books").select("id, created_at, title, author, cover_path, rating").order("created_at", { ascending: false }),
    admin.from("entries").select("book_id, kind"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byBook = new Map<string, Pick<EntryRow, "kind">[]>();
  for (const k of (kinds ?? []) as Pick<EntryRow, "book_id" | "kind">[]) {
    const list = byBook.get(k.book_id) ?? [];
    list.push(k);
    byBook.set(k.book_id, list);
  }
  const rows = (books ?? []) as BookRow[];
  const covers = await signAll("covers", rows.map((b) => b.cover_path).filter((p): p is string => !!p));
  const stats: Stats = { books: rows.length, rainbow: 0, audio: 0, text: 0, photo: 0, drawing: 0 };
  const out = rows.map((b) => {
    const list = byBook.get(b.id) ?? [];
    const complete = isComplete(b, list);
    if (complete) stats.rainbow++;
    for (const e of list) stats[e.kind]++;
    return publicBook(b, complete, covers);
  });
  return json({ books: out, stats });
}

async function book(id: unknown): Promise<Response> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "bad id" }, 400);
  const [{ data: row, error: e1 }, { data: entries, error: e2 }] = await Promise.all([
    admin.from("books").select("id, created_at, title, author, cover_path, rating").eq("id", id).maybeSingle(),
    admin.from("entries").select("*").eq("book_id", id).order("created_at", { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (!row) return json({ error: "no such book" }, 404);
  const b = row as BookRow;
  const list = (entries ?? []) as EntryRow[];
  const [covers, media] = await Promise.all([
    signAll("covers", b.cover_path ? [b.cover_path] : []),
    signAll("media", list.map((e) => e.media_path).filter((p): p is string => !!p)),
  ]);
  return json({
    book: publicBook(b, isComplete(b, list), covers),
    entries: list.map((e) => ({
      id: e.id,
      book_id: e.book_id,
      created_at: e.created_at,
      kind: e.kind,
      text: e.text,
      prompt: e.prompt,
      media_url: e.media_path ? (media.get(e.media_path) ?? null) : null,
      duration_ms: e.duration_ms,
      transcript: e.transcript,
      transcript_status: e.transcript_status,
    })),
  });
}

// ---- the page's own errors ------------------------------------------------------------------------

async function reportError(error: unknown, ua: string | null): Promise<Response> {
  const e = (error && typeof error === "object" ? error : { message: String(error) }) as Record<string, unknown>;
  const data = { ...e, ua };
  const text = JSON.stringify(data);
  await logEvent("error", typeof e.event === "string" ? e.event.slice(0, 80) : "web.error", text.length > 20_000 ? { message: String(e.message ?? "").slice(0, 2000), truncated: true, ua } : data, {
    session_id: typeof e.session_id === "string" ? e.session_id.slice(0, 64) : undefined,
    app: { ua },
  });
  return empty(204);
}

// ---- requests -------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return empty(204);
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const ua = req.headers.get("user-agent");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const kind = "token" in body || "pin" in body ? "login" : "error" in body ? "error" : `screen:${String(body.screen)}`;
  try {
    if (kind === "login") return await login(body, ua);
    if (!(await validPass(body.pass))) return json({ error: "no pass" }, 401);
    if (kind === "error") return await reportError(body.error, ua);
    if (body.screen === "library") return await library();
    if (body.screen === "book") return await book(body.id);
    return json({ error: "unknown screen" }, 400);
  } catch (err) {
    console.error("feed failed", kind, err);
    await logEvent("error", "feed.request", { kind, error: describeError(err), ua });
    return json({ error: "feed failed" }, 500);
  }
});
