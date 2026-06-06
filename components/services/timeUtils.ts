/**
 * Shared musical-time helpers.
 *
 * Centralizes calculations that were previously duplicated (with subtly
 * different operand orderings) across the transform, pipeline, voice and drum
 * modules. Keeping a single source of truth avoids drift between paths.
 */

export interface TimeSignatureLike {
  numerator: number;
  denominator: number;
}

/**
 * Ticks spanned by a single measure.
 *
 * `ppq` is ticks per quarter note, so a whole measure is
 * `ppq * 4 * (numerator / denominator)`. This is algebraically identical to the
 * `ppq * numerator * (4 / denominator)` ordering that also appeared in the
 * codebase; both reduce to `ppq * 4 * numerator / denominator`.
 */
export function ticksPerMeasure(ppq: number, timeSignature: TimeSignatureLike): number {
  return ppq * 4 * (timeSignature.numerator / timeSignature.denominator);
}

/**
 * Multipliers (in quarter-note units) indexed by the "overlap prune / short
 * note" threshold slider. Index 0 is "off". Mirrors the value ladder in
 * `MUSICAL_TIME_OPTIONS` (constants.ts).
 */
export const PRUNE_THRESHOLD_MULTIPLIERS: readonly number[] = [
  0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0,
];

/** Convert a prune-threshold slider index into ticks for the given ppq. */
export function pruneThresholdTicks(ppq: number, index: number): number {
  const multiplier = PRUNE_THRESHOLD_MULTIPLIERS[index] ?? 0;
  return Math.round(ppq * multiplier);
}
