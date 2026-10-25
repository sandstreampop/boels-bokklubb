// The library (app/index.tsx without the plus button): the title with the rainbow count beside it
// when there are rainbow books, the rainbow bar, the grid of covers with the title and stars under
// each, the rainbow ring on complete books, the rainbow initial for a book without a cover. The
// title opens the stats, a cover opens the book. The data is fetched every time the screen is shown.

import { rainbow } from '../lib/theme';
import { fetchLibrary, type Book } from './api';
import { crumb } from './telemetry';

const STAR = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8L12 2.5z';

export function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Placeholder cover: a rainbow wash picked from the book id so each book keeps its own colour (components/Rainbow.tsx). */
export function rainbowFill(seed: string): { a: string; b: string } {
  const n = seed.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return { a: rainbow[n % rainbow.length], b: rainbow[(n + 2) % rainbow.length] };
}

export function coverHtml(book: Book, className: string): string {
  const inner = book.cover_url
    ? `<img src="${escape(book.cover_url)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="initial" style="--a:${rainbowFill(book.id).a};--b:${rainbowFill(book.id).b}">${escape(book.title.trim().charAt(0).toUpperCase())}</span>`;
  return `<div class="${className}${book.complete ? ' ring' : ''}"><div class="cover">${inner}</div></div>`;
}

export function starsHtml(rating: number | null, size: number): string {
  if (!rating) return '';
  const star = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="var(--gold)"/></svg>`;
  return `<div class="stars" aria-label="${rating} stjärnor">${star.repeat(rating)}</div>`;
}

export async function renderLibrary(): Promise<HTMLElement> {
  const main = document.createElement('main');
  main.className = 'screen library';
  main.innerHTML = `
    <header class="library-header">
      <a class="title-row" href="#/stats" aria-label="Statistik"><h1 class="title">Boels bokklubb</h1><span class="count" hidden></span></a>
      <div class="rainbow-bar"></div>
    </header>
    <div class="grid" hidden></div>
    <div class="empty" hidden><div class="rainbow-bar faint"></div></div>`;
  const grid = main.querySelector<HTMLElement>('.grid')!;
  const empty = main.querySelector<HTMLElement>('.empty')!;
  const count = main.querySelector<HTMLElement>('.count')!;

  const { books, stats } = await fetchLibrary();
  crumb('library', { books: books.length, rainbow: stats.rainbow });
  if (stats.rainbow > 0) {
    count.textContent = String(stats.rainbow);
    count.hidden = false;
  }
  if (books.length === 0) {
    empty.hidden = false;
    return main;
  }
  grid.innerHTML = books
    .map(
      (b) => `
      <a class="book" href="#/book/${escape(b.id)}" aria-label="${escape(b.title)}">
        ${coverHtml(b, 'cover-wrap')}
        <div class="book-title">${escape(b.title)}</div>
        ${starsHtml(b.rating, 14)}
      </a>`,
    )
    .join('');
  grid.hidden = false;
  return main;
}
