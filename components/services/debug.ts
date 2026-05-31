/**
 * Lightweight, flag-gated logging for the service layer.
 *
 * Service modules previously called `console.debug`/`console.warn` directly,
 * which made it impossible to silence diagnostic chatter or trace where a
 * message originated. Routing through these helpers gives a single switch.
 *
 * Verbose (debug) logging is off by default. Enable it at runtime in a browser
 * console with `window.__MIDI_ENGINEER_DEBUG__ = true`, or in Node/tests with
 * the `MIDI_ENGINEER_DEBUG` environment variable.
 */

function debugEnabled(): boolean {
  if (typeof globalThis !== 'undefined') {
    const flag = (globalThis as Record<string, unknown>).__MIDI_ENGINEER_DEBUG__;
    if (flag === true) return true;
  }
  if (typeof process !== 'undefined' && process.env && process.env.MIDI_ENGINEER_DEBUG) {
    return true;
  }
  return false;
}

/** Verbose diagnostic message; suppressed unless debugging is explicitly enabled. */
export function debugLog(...args: unknown[]): void {
  if (debugEnabled()) {
    console.debug(...args);
  }
}

/** Warning the user/maintainer should generally see; always emitted. */
export function debugWarn(...args: unknown[]): void {
  console.warn(...args);
}
