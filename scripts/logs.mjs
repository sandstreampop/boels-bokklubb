#!/usr/bin/env node
// Reads the app's telemetry (the app_events table) through the Supabase Management API.
// Needs SUPABASE_URL and SUPABASE_ACCESS_TOKEN. Run with NODE_USE_ENV_PROXY=1 in the cloud.
//
//   npm run logs                       last 24h, info and up
//   npm run logs -- --since 2h         window: 30m, 2h, 3d
//   npm run logs -- --level warn       minimum level: debug, info, warn, error, fatal
//   npm run logs -- --event outbox     events whose name starts with this
//   npm run logs -- --session <id>     one launch, every level
//   npm run logs -- --sessions         one line per launch: device, build, errors, how it ended
//   npm run logs -- --follow           keep polling
//   npm run logs -- --json             raw rows

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? true) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const RANK = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const since = parseSince(opt('since', '24h'));
const level = opt('session', null) ? 'debug' : opt('level', 'info');
const eventPrefix = opt('event', null);
const session = opt('session', null);
const limit = Number(opt('limit', 500));

function parseSince(s) {
  const m = /^(\d+)([mhd])$/.exec(String(s));
  if (!m) throw new Error(`--since wants 30m, 2h or 3d, got ${s}`);
  const ms = { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]] * Number(m[1]);
  return new Date(Date.now() - ms);
}

const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function sessions() {
  const rows = await sql(`
    select session_id,
           min(at) as started, max(at) as last_seen, count(*) as events,
           count(*) filter (where level in ('error','fatal')) as errors,
           max(app->>'build') as build, max(app->>'version') as version, max(app->>'device') as device, max(app->>'os') as os,
           bool_or(event = 'app.abnormal_exit') as reported_abnormal_prev,
           (array_agg(event order by seq desc))[1] as last_event
    from public.app_events
    where at >= ${q(since.toISOString())}
    group by session_id order by started desc limit ${limit}`);
  for (const r of rows) {
    console.log(
      `${r.started.slice(0, 19).replace('T', ' ')}  ${r.session_id.slice(0, 8)}  v${r.version}(${r.build})  ${r.device} ${r.os}  ` +
        `${String(r.events).padStart(4)} ev  ${String(r.errors).padStart(3)} err  last: ${r.last_event}`,
    );
  }
}

let lastAt = since.toISOString();
async function events() {
  const where = [`at > ${q(lastAt)}`];
  if (session) where.push(`session_id like ${q(session + '%')}`);
  else where.push(`level in (${Object.keys(RANK).filter((l) => RANK[l] >= RANK[level]).map(q).join(',')})`);
  if (eventPrefix) where.push(`event like ${q(eventPrefix + '%')}`);
  const rows = await sql(
    `select at, session_id, seq, level, event, data, app->>'build' as build from public.app_events where ${where.join(' and ')} order by at asc, seq asc limit ${limit}`,
  );
  for (const r of rows) {
    lastAt = r.at > lastAt ? r.at : lastAt;
    if (flag('json')) {
      console.log(JSON.stringify(r));
      continue;
    }
    const t = r.at.slice(0, 19).replace('T', ' ');
    const tag = { debug: '  ', info: '  ', warn: 'W ', error: 'E ', fatal: 'F ' }[r.level];
    console.log(`${t} ${tag}${r.session_id.slice(0, 6)} b${r.build ?? '?'}  ${r.event}  ${formatData(r.data)}`);
  }
}

function formatData(d) {
  if (!d) return '';
  const { error, crumbs, ...rest } = d;
  let out = Object.keys(rest).length ? JSON.stringify(rest) : '';
  if (error) {
    out += `\n      ${error.name ?? 'Error'}: ${error.message}${error.code ? ` [${error.code}]` : ''}`;
    if (error.stack) out += '\n      ' + String(error.stack).split('\n').slice(1, 6).join('\n      ');
  }
  if (crumbs?.length) out += '\n      crumbs: ' + crumbs.join(' | ');
  if (d.componentStack) out += '\n      ' + String(d.componentStack).split('\n').slice(0, 6).join('\n      ');
  return out;
}

if (flag('sessions')) await sessions();
else {
  await events();
  while (flag('follow')) {
    await new Promise((r) => setTimeout(r, 5000));
    await events();
  }
}
