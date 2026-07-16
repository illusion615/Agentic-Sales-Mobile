/**
 * Copilot composer sizing — single source for the auto-grow height math so the
 * behaviour is testable and consistent across viewport / keyboard changes.
 *
 * The textarea grows with its content up to a viewport-relative cap (keyboard
 * aware, because callers pass the *visual* viewport height which already shrinks
 * when the on-screen keyboard is up), then scrolls internally.
 */
export interface ComposerHeightInput {
  /** The textarea's natural content height (measured with height:auto). */
  scrollHeight: number;
  /** Computed line-height in px. */
  lineHeight: number;
  /** Computed padding-top in px. */
  padTop: number;
  /** Computed padding-bottom in px. */
  padBottom: number;
  /** Reference viewport height (pass visualViewport.height for keyboard-awareness). */
  viewportHeight: number;
  /** Fraction of the viewport the composer may occupy at most. Default 0.45. */
  maxViewportRatio?: number;
  /** Minimum visible lines. Default 1. */
  minLines?: number;
  /** Absolute px ceiling (guards very tall desktop viewports). Default none. */
  absoluteMaxPx?: number;
}

export interface ComposerHeightResult {
  /** Height in px to apply to the textarea. */
  height: number;
  /** Whether content exceeds the cap (→ enable internal scrolling). */
  scroll: boolean;
}

/**
 * Resolve the textarea height + whether it should scroll internally.
 * Pure: no DOM access, so it can be unit-tested directly.
 */
export function composerHeight(input: ComposerHeightInput): ComposerHeightResult {
  const {
    scrollHeight,
    lineHeight,
    padTop,
    padBottom,
    viewportHeight,
    maxViewportRatio = 0.45,
    minLines = 1,
    absoluteMaxPx = Number.POSITIVE_INFINITY,
  } = input;

  const chrome = padTop + padBottom;
  const minHeight = lineHeight * minLines + chrome;
  const viewportCap = viewportHeight > 0 ? viewportHeight * maxViewportRatio : Number.POSITIVE_INFINITY;
  const cap = Math.max(minHeight, Math.min(viewportCap, absoluteMaxPx));
  const height = Math.max(minHeight, Math.min(scrollHeight, cap));
  const scroll = scrollHeight > cap + 0.5;
  return { height: Math.round(height), scroll };
}

/**
 * Whether the current content spans more than one line — drives the composer's
 * "buttons move below, text goes full-width" layout.
 */
export function isComposerMultiline(input: {
  scrollHeight: number;
  lineHeight: number;
  padTop: number;
  padBottom: number;
}): boolean {
  const singleLine = input.lineHeight + input.padTop + input.padBottom;
  return input.scrollHeight > singleLine + 2;
}
