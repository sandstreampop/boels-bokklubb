#!/usr/bin/env node
// The phone must not move: lib/layout.ts gives every screen its sizes, and for every width a
// phone can have (320 to 599 points) it must return exactly what the screens hard-coded before
// build 9 (docs/PRD-build-9.md, "The invariant: compact is today"). check.yml runs this on every
// push; a layout change that moves a pixel on the phone fails here, not on Viktor's phone.
//
//   node --no-warnings --experimental-strip-types scripts/layout-check.mjs
//
// It also prints the tablet grid for the iPad sizes, so a change there is visible in the log.

import { canvasSide, gridFor, layoutFor, sheetKeyboardOffset, sizeClass } from '../lib/layout.ts';

let failures = 0;
function expect(cond, what) {
  if (!cond) {
    failures++;
    console.error(`  FAIL ${what}`);
  }
}

// ---- the phone, as it was ----------------------------------------------------------------------

for (let width = 320; width < 600; width++) {
  const height = Math.round(width * 2.16);
  expect(sizeClass(width) === 'compact', `${width}: compact`);
  const g = gridFor(width);
  // app/index.tsx before build 9: GUTTER 20, GAP 18, two columns, width capped at 700.
  const oldCard = Math.floor((Math.min(width, 700) - 20 * 2 - 18) / 2);
  expect(g.columns === 2 && g.gutter === 20 && g.gap === 18 && g.cardWidth === oldCard, `${width}: grid ${JSON.stringify(g)} vs card ${oldCard}`);
  const l = layoutFor(width, height);
  expect(l.compact && l.gutter === 20 && l.maxContent === undefined && !l.twoPane && !l.landscape, `${width}: layout ${JSON.stringify(l)}`);
  // components/DrawingOverlay.tsx before build 9: min(width - 32, height * 0.5), floored.
  const oldSide = Math.floor(Math.min(width - 32, height * 0.5));
  expect(canvasSide(width, height, { vertical: 999, horizontal: 999 }) === oldSide, `${width}: canvas`);
}

// ---- the add-book sheet's keyboard offset ---------------------------------------------------------

// An iPhone 15 window is 852 points tall and its page sheet lays out 797: the gap is 55. Before
// layout the height is 0, which must give no offset; a tablet never gets one.
expect(sheetKeyboardOffset(852, 797, true) === 55, 'phone sheet offset');
expect(sheetKeyboardOffset(852, 0, true) === 0, 'no offset before layout');
expect(sheetKeyboardOffset(852, 900, true) === 0, 'never negative');
expect(sheetKeyboardOffset(1180, 620, false) === 0, 'no offset on a tablet');

// ---- the tablets, for the log --------------------------------------------------------------------

const tablets = [
  ['iPad mini portrait', 744, 1133],
  ['iPad portrait', 820, 1180],
  ['iPad Pro 13 portrait', 1032, 1376],
  ['iPad landscape', 1180, 820],
  ['iPad Pro 13 landscape', 1376, 1032],
  ['Split View half', 507, 1180],
  ['Slide Over', 320, 1180],
];
for (const [name, w, h] of tablets) {
  const l = layoutFor(w, h);
  const g = gridFor(w);
  const side = canvasSide(w, h, { vertical: 330, horizontal: l.size === 'wide' && l.landscape ? 64 + 140 : 64 });
  console.log(`  ${name.padEnd(24)} ${String(w).padStart(4)}x${h}  ${l.size.padEnd(7)} ${g.columns} columns of ${g.cardWidth}  canvas ${side}  twoPane ${l.twoPane}`);
  // Slide Over is the phone grid at 320 points, the same 131-point cards as an iPhone SE.
  expect(g.cardWidth >= 120 && g.cardWidth <= 300, `${name}: card width ${g.cardWidth} out of range`);
  expect(side >= 200, `${name}: canvas ${side} too small`);
}

if (failures) {
  console.error(`layout check: ${failures} failure(s)`);
  process.exit(1);
}
console.log('layout check: the phone is unchanged');
