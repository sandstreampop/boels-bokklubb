// The stats (app/stats.tsx without the share button): the six tiles of components/StatTiles.tsx,
// an icon and a number each, rainbow books big with the ring. Totals only, no time axis. The
// numbers come with the library answer. Back goes to the library.

import { fetchLibrary, type Stats } from './api';
import { icon, type IconName } from './icons';
import { crumb } from './telemetry';

const TILES: { key: keyof Stats; icon: IconName; label: string }[] = [
  { key: 'books', icon: 'book', label: 'Böcker' },
  { key: 'audio', icon: 'mic', label: 'Röster' },
  { key: 'text', icon: 'pencil', label: 'Tankar' },
  { key: 'photo', icon: 'camera', label: 'Foton' },
  { key: 'drawing', icon: 'brush', label: 'Teckningar' },
];

function tileHtml(key: keyof Stats, value: number, label: string, inner: string, big = false): string {
  return `<div class="tile${big ? ' big' : ''}" data-key="${key}" role="img" aria-label="${value} ${label}">${inner}<span class="number">${value}</span></div>`;
}

export async function renderStats(): Promise<HTMLElement> {
  const { stats } = await fetchLibrary();
  crumb('stats', stats);
  const main = document.createElement('main');
  main.className = 'screen stats-page';
  const rainbow = `<span class="ring-icon">${icon('book', 30, 'var(--pinkDeep)')}</span>`;
  main.innerHTML = `
    <a class="back" href="#/" aria-label="Tillbaka">${icon('back', 24, 'var(--text)')}</a>
    <div class="tiles">
      ${tileHtml('rainbow', stats.rainbow, 'Regnbågsböcker', rainbow, true)}
      ${TILES.map((t) => tileHtml(t.key, stats[t.key], t.label, icon(t.icon, 34, 'var(--pinkDeep)', 2.2))).join('')}
    </div>`;
  return main;
}
