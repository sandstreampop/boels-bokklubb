#!/usr/bin/env node
// Builds assets/sounds/*.m4a from CC0 audio packs (Kenney for the UI, rubberduck's creature pack on
// OpenGameArt for the unicorn's voice), so every sound in the app has a known source and licence
// (docs/CREDITS.md) and a swap is one line here, not a file hunt.
//
//   node scripts/sounds.mjs           download the packs, convert the picks, print the credits rows
//   node scripts/sounds.mjs --list    print the picks and do nothing
//
// Needs ffmpeg and unzip on PATH; curl does the downloads (Node's fetch ignores the proxy).
// Output: mono AAC, 44.1 kHz, 96 kb/s, peak-normalised to -3 dBFS. iOS cannot play Kenney's .ogg.
//
// Picks were made by Kenney's own names and measured length, not by ear: the session that made them
// had no speaker. If one sounds wrong on the phone, change the line and rerun.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'sounds');

const PACKS = {
  'interface-sounds': {
    title: 'Interface Sounds',
    page: 'https://kenney.nl/assets/interface-sounds',
    zip: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  },
  'music-jingles': {
    title: 'Music Jingles',
    page: 'https://kenney.nl/assets/music-jingles',
    zip: 'https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip',
  },
  // The unicorn's voice: one synthesised squeaky creature, ten "cute" variants plus a cough and a
  // nose sound in the same voice. Freesound refuses the cloud session; this pack is CC0 on its page.
  'creature-sfx': {
    title: '80 CC0 creature SFX',
    page: 'https://opengameart.org/content/80-cc0-creature-sfx',
    zip: 'https://opengameart.org/sites/default/files/80-CC0-creature-SFX_0.zip',
  },
};

// One row per sound the app plays (lib/sounds.ts). `pitch` is in semitones.
const PICKS = [
  { name: 'tap', pack: 'interface-sounds', file: 'Audio/click_001.ogg', use: 'every tap, a soft pop' },
  { name: 'save', pack: 'interface-sounds', file: 'Audio/confirmation_002.ogg', use: 'entry saved, a chime' },
  { name: 'star-1', pack: 'interface-sounds', file: 'Audio/tick_004.ogg', pitch: 0, use: 'one star' },
  { name: 'star-2', pack: 'interface-sounds', file: 'Audio/tick_004.ogg', pitch: 2, use: 'two stars' },
  { name: 'star-3', pack: 'interface-sounds', file: 'Audio/tick_004.ogg', pitch: 4, use: 'three stars' },
  { name: 'star-4', pack: 'interface-sounds', file: 'Audio/tick_004.ogg', pitch: 7, use: 'four stars' },
  { name: 'star-5', pack: 'interface-sounds', file: 'Audio/tick_004.ogg', pitch: 9, use: 'five stars' },
  { name: 'rainbow', pack: 'music-jingles', file: 'Audio/Steel jingles/jingles_STEEL07.ogg', use: 'book goes rainbow, a fanfare' },
  { name: 'screen-in', pack: 'interface-sounds', file: 'Audio/maximize_006.ogg', use: 'screen enters, a swish' },
  { name: 'screen-out', pack: 'interface-sounds', file: 'Audio/minimize_006.ogg', use: 'screen leaves, a swish' },
  { name: 'crayon', pack: 'interface-sounds', file: 'Audio/scratch_003.ogg', use: 'crayon stroke starts, a tiny scratch' },
  { name: 'wand', pack: 'interface-sounds', file: 'Audio/glass_001.ogg', use: 'wand reroll, a twinkle' },
  { name: 'unicorn-chirp', pack: 'creature-sfx', file: 'cute_02.ogg', use: 'the unicorn appears, a chirp' },
  { name: 'unicorn-trill', pack: 'creature-sfx', file: 'cute_05.ogg', use: 'the unicorn is happy, a trill' },
  { name: 'unicorn-yawn', pack: 'creature-sfx', file: 'cute_10.ogg', use: 'the unicorn yawns' },
  { name: 'unicorn-sneeze', pack: 'creature-sfx', file: 'cough_02.ogg', use: 'the unicorn sneezes' },
  { name: 'unicorn-hm', pack: 'creature-sfx', file: 'cute_08.ogg', use: 'the unicorn wonders, "hm?"' },
];

const PEAK_DB = -3;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return r;
}

function peakDb(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return m ? Number(m[1]) : 0;
}

function sampleRate(file) {
  const r = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', file]);
  return Number(r.stdout.trim()) || 44100;
}

function convert(input, output, pitch) {
  const filters = [];
  if (pitch) {
    const sr = sampleRate(input);
    filters.push(`asetrate=${sr}*${Math.pow(2, pitch / 12).toFixed(6)}`, `aresample=${sr}`);
  }
  filters.push(`volume=${(PEAK_DB - peakDb(input)).toFixed(2)}dB`);
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', filters.join(','), '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', output]);
}

function main() {
  if (process.argv.includes('--list')) {
    for (const p of PICKS) console.log(`${p.name.padEnd(11)} ${p.pack}/${p.file}${p.pitch ? ` (+${p.pitch} st)` : ''}  ${p.use}`);
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'kenney-'));
  for (const [id, pack] of Object.entries(PACKS)) {
    const zip = join(tmp, `${id}.zip`);
    console.log(`downloading ${pack.title}`);
    run('curl', ['-sSL', '--retry', '3', '-A', 'Mozilla/5.0', pack.zip, '-o', zip]);
    mkdirSync(join(tmp, id));
    run('unzip', ['-oq', zip, '-d', join(tmp, id)]);
  }
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const p of PICKS) {
    const input = join(tmp, p.pack, p.file);
    if (!existsSync(input)) throw new Error(`missing in pack: ${p.pack}/${p.file}`);
    const output = join(OUT, `${p.name}.m4a`);
    convert(input, output, p.pitch);
    const pack = PACKS[p.pack];
    rows.push(`| \`assets/sounds/${p.name}.m4a\` | ${p.use} | [${pack.title}](${pack.page}) \`${p.file}\`${p.pitch ? `, pitched +${p.pitch} semitones` : ''} | CC0 |`);
    console.log(`wrote ${p.name}.m4a`);
  }
  console.log('\nRows for docs/CREDITS.md:\n');
  console.log(rows.join('\n'));
}

main();
