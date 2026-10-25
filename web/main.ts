// The web version of Boels bokklubb for relatives (docs/PRD-build-8.md): the app without the
// create actions, read only. This file is the router. Hash routes `#/` (the library), `#/book/<id>`
// and `#/stats`; the secret link is `#t=<token>`. Without a token or a stored pass the page shows
// the title and nothing else; with a token and no pass, the PIN screen. Screens fade in, nothing
// else moves. No unicorn, no sounds, no usage telemetry.

import './app.css';
import favicon from '../assets/favicon.png';
import icon from '../assets/icon.png';
import { colors, radius, rainbow } from '../lib/theme';
import { FeedError, getPass, getToken, rememberToken } from './api';
import { renderBook } from './book';
import { renderLibrary } from './library';
import { renderPin, renderTitleOnly } from './pin';
import { captureError, crumb, startTelemetry } from './telemetry';

type Route = { screen: 'library' } | { screen: 'book'; id: string } | { screen: 'stats' };

const root = document.getElementById('app') as HTMLElement;
let shown: string | null = null;

/** The design tokens from lib/theme.ts as CSS variables; the fonts come from Google Fonts. */
function applyTheme() {
  const s = document.documentElement.style;
  for (const [name, value] of Object.entries(colors)) s.setProperty(`--${name}`, value);
  for (const [name, value] of Object.entries(radius)) s.setProperty(`--radius-${name}`, `${value}px`);
  s.setProperty('--rainbow', rainbow.join(', '));
  s.setProperty('--rainbow-first', rainbow[0]);
  s.setProperty('--rainbow-last', rainbow[rainbow.length - 1]);
}

function link(rel: string, href: string) {
  const el = document.createElement('link');
  el.rel = rel;
  el.href = href;
  document.head.append(el);
}

/** `#t=<token>` is the link: the token is kept, the page then shows the library. Anything unknown is the library. */
function parse(hash: string): Route {
  const token = /^#t=([A-Za-z0-9_-]{16,})$/.exec(hash);
  if (token) {
    rememberToken(token[1]);
    return { screen: 'library' };
  }
  const book = /^#\/book\/([0-9a-f-]{36})$/i.exec(hash);
  if (book) return { screen: 'book', id: book[1] };
  if (hash === '#/stats') return { screen: 'stats' };
  return { screen: 'library' };
}

function show(key: string, el: HTMLElement) {
  shown = key;
  root.replaceChildren(el);
  window.scrollTo(0, 0);
}

async function render() {
  const route = parse(location.hash);
  if (!getPass()) {
    const token = getToken();
    crumb('route', { screen: token ? 'pin' : 'title' });
    if (shown === 'pin' || shown === 'title') return;
    show(token ? 'pin' : 'title', token ? renderPin(token, () => void render()) : renderTitleOnly());
    return;
  }
  // The stats ship next; until then that route shows the library.
  const key = route.screen === 'book' ? `book:${route.id}` : 'library';
  if (shown === key) return;
  crumb('route', route);
  try {
    show(key, route.screen === 'book' ? await renderBook(route.id) : await renderLibrary());
  } catch (err) {
    if (err instanceof FeedError && err.status === 401) {
      // The pass is gone (expired, or the secrets were rotated): the PIN screen again.
      shown = null;
      void render();
      return;
    }
    captureError('render', err, { route });
    // A book that is not there (a stale link) goes back to the shelf.
    if (route.screen !== 'library') location.replace('#/');
  }
}

applyTheme();
link('icon', favicon);
link('apple-touch-icon', icon);
startTelemetry();
window.addEventListener('hashchange', () => void render());
void render();
