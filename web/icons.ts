// The app's line icons (components/Icon.tsx), drawn to a 24-box, as SVG strings. Rounded joins so
// they feel soft. Only the ones the web screens use.

export type IconName = 'back' | 'play' | 'pause' | 'book' | 'mic' | 'pencil' | 'camera' | 'brush';

const BODY: Record<IconName, (c: string, w: number) => string> = {
  back: (c, w) => `<polyline points="14,5 7,12 14,19" ${line(c, w)}/>`,
  play: (c) => `<path d="M8 5.5v13l10-6.5z" fill="${c}" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/>`,
  pause: (c) => `<rect x="6.5" y="5" width="4" height="14" rx="1.5" fill="${c}"/><rect x="13.5" y="5" width="4" height="14" rx="1.5" fill="${c}"/>`,
  book: (c, w) => `<path d="M4 5a2 2 0 0 1 2-2h12.5v15H6a2 2 0 0 0-2 2z" ${line(c, w)}/><path d="M4 20a2 2 0 0 1 2-2h12.5v3H6a2 2 0 0 1-2-2z" ${line(c, w)}/>`,
  mic: (c, w) => `<rect x="9" y="3" width="6" height="11" rx="3" ${line(c, w)}/><path d="M5 11a7 7 0 0 0 14 0" ${line(c, w)}/><line x1="12" y1="18" x2="12" y2="21" ${line(c, w)}/>`,
  pencil: (c, w) => `<path d="M4 20l4-1 11-11-3-3L5 16z" ${line(c, w)}/><line x1="13" y1="8" x2="16" y2="11" ${line(c, w)}/>`,
  camera: (c, w) => `<path d="M4 8h3l2-3h6l2 3h3v11H4z" ${line(c, w)}/><circle cx="12" cy="13" r="3.5" ${line(c, w)}/>`,
  brush: (c, w) =>
    `<line x1="4" y1="20" x2="11" y2="13" ${line(c, w + 0.8)}/><path d="M11 13l7-7a2.3 2.3 0 0 1 3.2 3.2l-7 7z" ${line(c, w)}/><path d="M8.5 15.5c-2 .5-3 2-2.5 4.5 2.5.5 4-.5 4.5-2.5" ${line(c, w)}/>`,
};

const line = (c: string, w: number) => `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

export function icon(name: IconName, size: number, color: string, strokeWidth = 2.4): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${BODY[name](color, strokeWidth)}</svg>`;
}
