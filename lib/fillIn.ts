// The fill-in blank in write prompts, and how a card renders her words inside it. On its own so the
// web version (web/) can import it without pulling the store or telemetry in; lib/prompts.ts
// re-exports it for the app.

export const BLANK = '___';

export const isFillIn = (prompt: string | null | undefined): prompt is string => !!prompt && prompt.includes(BLANK);

/** A write prompt split around its blank, for rendering her text inside it. */
export function splitFillIn(prompt: string): { before: string; after: string } {
  const i = prompt.indexOf(BLANK);
  if (i < 0) return { before: prompt, after: '' };
  return { before: prompt.slice(0, i), after: prompt.slice(i + BLANK.length) };
}
