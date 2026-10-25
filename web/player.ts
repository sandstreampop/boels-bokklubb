// Her voice on the web: the browser's Audio element, one at a time, tap to play and tap to pause
// (docs/PRD-build-8.md). The player at rest is drawn by book.ts; this file makes it work. One
// Audio element is made on the first tap, inside the gesture, so iOS Safari lets it play; every
// player on the page shares it, so starting one stops another. A finished recording starts over
// on the next tap, like the app. Plays are breadcrumbs only, never counted.

import { formatDuration } from '../lib/format';
import { icon } from './icons';
import { captureError, crumb } from './telemetry';

type Bound = { el: HTMLElement; button: HTMLButtonElement; bars: HTMLElement[]; time: HTMLElement; src: string; id: string; totalMs: number };

let audio: HTMLAudioElement | null = null;
let current: Bound | null = null;

function paint(b: Bound, playing: boolean, currentMs: number, totalMs: number) {
  const progress = totalMs > 0 ? Math.min(1, currentMs / totalMs) : 0;
  const lit = Math.round(progress * b.bars.length);
  b.bars.forEach((bar, i) => bar.classList.toggle('lit', i < lit));
  b.button.innerHTML = icon(playing ? 'pause' : 'play', 22, 'var(--white)');
  b.button.setAttribute('aria-label', playing ? 'Pausa' : 'Spela');
  b.el.classList.toggle('playing', playing);
  b.time.textContent = formatDuration(playing || progress > 0 ? currentMs : totalMs);
}

function rest(b: Bound) {
  paint(b, false, 0, b.totalMs);
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'metadata';
  const total = () => (audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : (current?.totalMs ?? 0));
  audio.addEventListener('timeupdate', () => {
    if (current && audio) paint(current, !audio.paused, audio.currentTime * 1000, total());
  });
  audio.addEventListener('play', () => {
    if (current && audio) paint(current, true, audio.currentTime * 1000, total());
  });
  audio.addEventListener('pause', () => {
    if (current && audio) paint(current, false, audio.currentTime * 1000, total());
  });
  audio.addEventListener('ended', () => {
    if (current) {
      crumb('play.ended', { id: current.id });
      rest(current);
    }
  });
  audio.addEventListener('error', () => {
    if (current) {
      captureError('play', audio?.error ?? new Error('audio error'), { id: current.id, code: audio?.error?.code });
      rest(current);
    }
  });
  return audio;
}

function toggle(b: Bound) {
  const a = ensureAudio();
  if (current === b) {
    if (!a.paused) {
      crumb('play.pause', { id: b.id });
      a.pause();
      return;
    }
    if (a.ended) a.currentTime = 0;
  } else {
    if (current) {
      a.pause();
      rest(current);
    }
    current = b;
    a.src = b.src;
  }
  crumb('play', { id: b.id });
  a.play().catch((err) => {
    captureError('play', err, { id: b.id });
    rest(b);
  });
}

/** Binds every player in `root`. Called once after the book page is in the document. */
export function mountPlayers(root: HTMLElement) {
  // A new page: whatever was playing on the old one stops.
  if (audio && !audio.paused) audio.pause();
  current = null;
  for (const el of root.querySelectorAll<HTMLElement>('.player[data-src]')) {
    const button = el.querySelector<HTMLButtonElement>('.play');
    const time = el.querySelector<HTMLElement>('.time');
    if (!button || !time) continue;
    const b: Bound = {
      el,
      button,
      bars: [...el.querySelectorAll<HTMLElement>('.bar')],
      time,
      src: el.dataset.src ?? '',
      id: el.dataset.id ?? '',
      totalMs: Number(el.dataset.duration ?? 0),
    };
    button.disabled = false;
    button.addEventListener('click', () => toggle(b));
  }
}
