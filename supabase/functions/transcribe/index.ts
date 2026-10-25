// Transcribes an audio entry with OpenAI and stores the text on the entry.
// Called by the app right after an audio upload, and again for anything left pending.
// Deno runtime (Supabase Edge Functions).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = Deno.env.get("TRANSCRIBE_MODEL") ?? "gpt-4o-mini-transcribe";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Entry = {
  id: string;
  kind: string;
  media_path: string | null;
  transcript_status: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function requireFamilyUser(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await admin.auth.getUser(token);
  return !error && !!data.user;
}

async function transcribeEntry(entry: Entry): Promise<void> {
  if (entry.kind !== "audio" || !entry.media_path) return;

  await admin
    .from("entries")
    .update({ transcript_status: "pending" })
    .eq("id", entry.id);

  const { data: blob, error: dlError } = await admin.storage
    .from("media")
    .download(entry.media_path);
  if (dlError || !blob) throw new Error(`download failed: ${dlError?.message}`);

  const ext = entry.media_path.split(".").pop() ?? "m4a";
  const form = new FormData();
  form.append("file", blob, `audio.${ext}`);
  form.append("model", MODEL);
  // Hint, not a constraint: biases toward Swedish and a child's vocabulary but lets the model switch language.
  form.append("prompt", "Ett barn berättar om en bok hon har läst.");
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
  }
  const out = (await res.json()) as { text?: string };
  const text = (out.text ?? "").trim();

  await admin
    .from("entries")
    .update({ transcript: text, transcript_status: "done" })
    .eq("id", entry.id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!(await requireFamilyUser(req))) return json({ error: "unauthorized" }, 401);

  let body: { entryId?: string; sweep?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine for a sweep
  }

  const ids: string[] = [];
  if (body.entryId) ids.push(body.entryId);

  if (body.sweep) {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data } = await admin
      .from("entries")
      .select("id")
      .eq("kind", "audio")
      .in("transcript_status", ["none", "pending", "failed"])
      .lt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const row of data ?? []) ids.push(row.id);
  }

  const results: Record<string, string> = {};
  for (const id of [...new Set(ids)]) {
    const { data: entry } = await admin
      .from("entries")
      .select("id, kind, media_path, transcript_status")
      .eq("id", id)
      .maybeSingle();
    if (!entry) {
      results[id] = "missing";
      continue;
    }
    if (entry.transcript_status === "done") {
      results[id] = "done";
      continue;
    }
    try {
      await transcribeEntry(entry as Entry);
      results[id] = "done";
    } catch (err) {
      console.error("transcribe failed", id, err);
      await admin
        .from("entries")
        .update({ transcript_status: "failed" })
        .eq("id", id);
      results[id] = "failed";
    }
  }

  return json({ results });
});
