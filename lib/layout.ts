// Layout rules for every window size, as pure functions (docs/PRD-build-9.md §2). No imports and
// no React Native here: scripts/layout-check.mjs runs this file under Node and refuses a push
// that changes what a phone sees. The hook that feeds these the window is lib/useLayout.ts.
//
// Three size classes by window width. `compact` is every iPhone (and Slide Over on an iPad), and
// in `compact` every function returns exactly the constants the screens used before build 9. That
// is the invariant the check asserts. `regular` is an iPad portrait (or half a Split View); `wide`
// is an iPad landscape.

export type SizeClass = 'compact' | 'regular' | 'wide';

export const BREAKPOINTS = { regular: 600, wide: 900 } as const;

export function sizeClass(width: number): SizeClass {
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.regular) return 'regular';
  return 'compact';
}

export type Layout = {
  width: number;
  height: number;
  size: SizeClass;
  compact: boolean;
  landscape: boolean;
  /** Side padding of a screen. */
  gutter: number;
  /** Width cap of a text column (the stream, the stats, the writer); none on a phone. */
  maxContent: number | undefined;
  /** The book page shows its header beside the stream instead of above it. */
  twoPane: boolean;
  /** Width of that header column when twoPane. */
  paneWidth: number;
};

/** Before build 9 the phone screens used these; they still do, through this module. */
export const PHONE = { gutter: 20, gap: 18, columns: 2, maxGridWidth: 700 } as const;
const TABLET = { gutter: 32, gap: 24, minCard: 190, maxContent: 720, paneWidth: 400 } as const;

export function layoutFor(width: number, height: number): Layout {
  const size = sizeClass(width);
  const compact = size === 'compact';
  return {
    width,
    height,
    size,
    compact,
    landscape: width > height,
    gutter: compact ? PHONE.gutter : TABLET.gutter,
    maxContent: compact ? undefined : TABLET.maxContent,
    twoPane: size === 'wide',
    paneWidth: TABLET.paneWidth,
  };
}

export type Grid = { columns: number; cardWidth: number; gutter: number; gap: number };

/** The library shelf: how many covers across and how wide each one is. */
export function gridFor(width: number): Grid {
  if (sizeClass(width) === 'compact') {
    // The formula app/index.tsx had before build 9, to the pixel.
    const cardWidth = Math.floor((Math.min(width, PHONE.maxGridWidth) - PHONE.gutter * 2 - PHONE.gap) / PHONE.columns);
    return { columns: PHONE.columns, cardWidth, gutter: PHONE.gutter, gap: PHONE.gap };
  }
  const { gutter, gap, minCard } = TABLET;
  const inner = width - gutter * 2;
  const columns = Math.max(2, Math.floor((inner + gap) / (minCard + gap)));
  const cardWidth = Math.floor((inner - gap * (columns - 1)) / columns);
  return { columns, cardWidth, gutter, gap };
}

/**
 * The drawing canvas, a square. On a phone: the old rule, half the height at most. On a tablet:
 * as big as the height leaves after the chrome around it (prompt row, crayons, buttons, insets),
 * capped by the width left after the gutters and, in a wide landscape, the crayon column.
 */
export function canvasSide(width: number, height: number, chrome: { vertical: number; horizontal: number }): number {
  if (sizeClass(width) === 'compact') return Math.floor(Math.min(width - 32, height * 0.5));
  return Math.max(200, Math.floor(Math.min(width - chrome.horizontal, height - chrome.vertical)));
}

/**
 * The add-book screen is a page sheet. On a phone it is anchored to the bottom of the window and
 * starts a gap below the top (about 55 points), and KeyboardAvoidingView pads from its own frame,
 * which React Native believes starts at 0: measureInWindow says so too under the new architecture,
 * because UIKit applies the sheet's offset outside the layout tree. So the keyboard covered the gap's
 * worth of the done bar (updates 01a1798b and 01a17995, 2026-10-26). The gap is the window height
 * minus the sheet's laid-out height, two numbers that are reliable; it is the keyboardVerticalOffset.
 * On a tablet the sheet floats and UIKit moves it clear of the keyboard itself, so no offset there.
 */
export function sheetKeyboardOffset(windowHeight: number, sheetHeight: number, compact: boolean): number {
  if (!compact || sheetHeight <= 0) return 0;
  return Math.max(0, Math.round(windowHeight - sheetHeight));
}

/** In a wide landscape the crayons stand beside the canvas instead of under it. */
export function crayonsBeside(layout: Layout): boolean {
  return layout.size === 'wide' && layout.landscape;
}
