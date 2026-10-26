// Feature flags. Plain constants and no imports: the web version reads this file too
// (scripts/web.mjs allows it next to theme, format and fillIn).

export const features: {
  /**
   * Transcribing recordings with OpenAI. Off since 2026-10-26 (docs/PRD-build-9.md §3): the text
   * was often wrong, so her voice is the answer. Off means no call to the function, no sweep,
   * new recordings stored as `transcript_status: 'none'`, and no transcript shown anywhere, old
   * ones included. The function, the columns and the code stay; flipping this brings it back.
   */
  transcription: boolean;
} = {
  transcription: false,
};
