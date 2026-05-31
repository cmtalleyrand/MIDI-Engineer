// Cost terms for the constraint-based voice solver (PROJECT_INTENT §4.4).
//
// All weights are named here so the solver's behavior is tunable in one place.
// The model deliberately has NO generic near-crossing proximity penalty (§4.4);
// crossing is handled as a near-hard ordering constraint by the assignment step.

export const VOICE_COST = {
  /** Per-semitone baseline leap penalty. */
  LEAP_PER_SEMITONE: 1,
  /** Extra penalty once a leap reaches a full octave (still plausibly same voice). */
  OCTAVE_DISCONTINUITY: 4,
  /** Larger extra penalty for leaps beyond an octave (often a voice handoff). */
  BEYOND_OCTAVE_DISCONTINUITY: 10,
  /** Additional smaller bump around the ~15-semitone region. */
  FIFTEENTH_DISCONTINUITY: 4,
  /** Weight pulling a note toward its voice's recent register center. */
  REGISTER_CENTER: 0.08,
  /** Penalty for opening a voice with a short wake-up (< 1 measure gap). */
  GAP_OPEN_SHORT: 30,
  /** Reduced penalty for an extended (>= 1 measure) re-entry. */
  GAP_OPEN_EXTENDED: 6,
  /** Penalty contribution for fragmenting a chord across extra voices. */
  CHORD_FRAGMENTATION: 8,
  /**
   * Marginal-cost ceiling above which placing a note into any voice is treated
   * as disproportionate, so the note is sent to the orphan lane (§4.4.1).
   */
  ORPHAN_THRESHOLD: 140,
} as const;

/**
 * Pitch-leap cost with the discontinuities described in §4.4: a baseline linear
 * term, a small bump at the octave, a larger one beyond the octave, and an extra
 * bump around 15 semitones.
 */
export function pitchLeapCost(prevMidi: number, midi: number): number {
  const leap = Math.abs(midi - prevMidi);
  let cost = leap * VOICE_COST.LEAP_PER_SEMITONE;
  if (leap >= 12) cost += VOICE_COST.OCTAVE_DISCONTINUITY;
  if (leap > 12) cost += VOICE_COST.BEYOND_OCTAVE_DISCONTINUITY;
  if (leap >= 15) cost += VOICE_COST.FIFTEENTH_DISCONTINUITY;
  return cost;
}

/** Keep a voice near its recent pitch center; avoids sustained register drift. */
export function registerCenterCost(center: number, midi: number): number {
  return Math.abs(center - midi) * VOICE_COST.REGISTER_CENTER;
}

/**
 * Penalty for re-opening a voice after a rest. Short wake-ups (< 1 measure) are
 * discouraged; extended re-entries are cheap.
 */
export function gapOpenCost(gapTicks: number, ticksPerMeasure: number): number {
  if (gapTicks <= 0) return 0;
  return gapTicks < ticksPerMeasure ? VOICE_COST.GAP_OPEN_SHORT : VOICE_COST.GAP_OPEN_EXTENDED;
}

/**
 * Default register target (MIDI) for voice `index` of `total`, spanning a broad
 * choir range from ~C6 (top) down. Used as the seed center for an empty voice.
 */
export function defaultVoiceCenter(index: number, total: number): number {
  const TOP = 84; // ~C6
  const SPAN = 48; // four octaves down to ~C2
  if (total <= 1) return TOP - SPAN / 2;
  return TOP - index * (SPAN / (total - 1));
}
