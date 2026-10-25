// The book page (app/book/[id].tsx without mic, pencil, camera, crayon, and with the stars read
// only): the cover with its ring, the title and author, the stars as given, then the stream of
// entries newest first. Each entry is components/EntryCard.tsx without the share button: the
// prompt in muted type (a fill-in prompt wraps her words), her words verbatim, photos and drawings
// as in the app, the date. Audio entries show the round play button with the duration and the
// transcript under it; a pending transcript shows the two grey bars, a failed one nothing.
// Playback is player.ts. Back goes to the library. The empty cover is not tappable.

import { isFillIn, splitFillIn } from '../lib/fillIn';
import { formatDate, formatDuration } from '../lib/format';
import { fetchBook, type Entry } from './api';
import { icon } from './icons';
import { coverHtml, escape } from './library';
import { mountPlayers } from './player';
import { crumb } from './telemetry';

const STAR = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';
const BAR_HEIGHTS = [10, 16, 22, 14, 26, 18, 12, 24, 16, 20, 10, 18, 26, 14, 22, 12, 18, 24, 14, 10];

/** Five stars, filled up to the rating, as the app's StarRating shows them. Read only here. */
function ratingHtml(rating: number | null, size: number): string {
  const star = (filled: boolean) =>
    `<span class="star${filled ? ' filled' : ''}"><svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${filled ? 'var(--gold)' : 'var(--goldSoft)'}" stroke="${filled ? '#F0A500' : 'var(--gold)'}" stroke-width="1.2" stroke-linejoin="round"/></svg></span>`;
  return `<div class="rating" aria-label="${rating ?? 0} stjärnor">${[1, 2, 3, 4, 5].map((n) => star(!!rating && n <= rating)).join('')}</div>`;
}

function textHtml(e: Entry): string {
  const text = escape(e.text ?? '');
  if (isFillIn(e.prompt)) {
    const { before, after } = splitFillIn(e.prompt);
    return `<p class="body"><span class="prompt-inline">${escape(before)}</span>${text}<span class="prompt-inline">${escape(after)}</span></p>`;
  }
  return `${e.prompt ? `<p class="prompt">${escape(e.prompt)}</p>` : ''}<p class="body">${text}</p>`;
}

function pictureHtml(e: Entry): string {
  const img = e.media_url ? `<img src="${escape(e.media_url)}" alt="" loading="lazy" decoding="async" />` : '';
  return `<div class="picture${e.kind === 'drawing' ? ' drawing' : ''}">${img}</div>`;
}

/** The player at rest: the button, the bars, the duration. player.ts makes it play once the page is shown. */
export function playerHtml(e: Entry): string {
  const bars = BAR_HEIGHTS.map((h) => `<span class="bar" style="height:${h}px"></span>`).join('');
  const src = e.media_url ? ` data-src="${escape(e.media_url)}"` : '';
  return `<div class="player" data-id="${escape(e.id)}"${src} data-duration="${e.duration_ms ?? 0}">
      <button type="button" class="play" disabled aria-label="Spela">${icon('play', 22, 'var(--white)')}</button>
      <div class="bars">${bars}</div>
      <span class="time">${formatDuration(e.duration_ms ?? 0)}</span>
    </div>`;
}

function audioHtml(e: Entry): string {
  const transcript = e.transcript
    ? `<p class="transcript">${escape(e.transcript)}</p>`
    : e.transcript_status === 'failed'
      ? ''
      : `<div class="transcript-pending"><span style="width:72%"></span><span style="width:48%"></span></div>`;
  return `<div class="audio">${playerHtml(e)}${transcript}</div>`;
}

export function entryHtml(e: Entry): string {
  const prompt = e.kind !== 'text' && e.prompt ? `<p class="prompt">${escape(e.prompt)}</p>` : '';
  const body =
    e.kind === 'text' ? textHtml(e) : e.kind === 'audio' ? audioHtml(e) : pictureHtml(e);
  return `<article class="entry ${e.kind}" data-id="${escape(e.id)}">${prompt}${body}<footer class="entry-footer"><time datetime="${escape(e.created_at)}">${escape(formatDate(e.created_at))}</time></footer></article>`;
}

export async function renderBook(id: string): Promise<HTMLElement> {
  const { book, entries } = await fetchBook(id);
  crumb('book', { id, entries: entries.length, complete: book.complete });
  const main = document.createElement('main');
  main.className = 'screen book-page';
  main.innerHTML = `
    <a class="back" href="#/" aria-label="Tillbaka">${icon('back', 24, 'var(--text)')}</a>
    <header class="book-header">
      <div class="cover-row">
        ${coverHtml(book, 'cover-wrap big')}
        <div class="title-block">
          <h1 class="book-name">${escape(book.title)}</h1>
          ${book.author ? `<p class="author">${escape(book.author)}</p>` : ''}
        </div>
      </div>
      ${ratingHtml(book.rating, 52)}
    </header>
    <div class="entries">${entries.map(entryHtml).join('')}</div>`;
  mountPlayers(main);
  return main;
}
