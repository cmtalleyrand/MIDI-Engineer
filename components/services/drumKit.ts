// Shared types, GM drum map and low-level helpers used across the drum
// generation modules (beat detection, pattern generators, orchestrator).

// --- GM Drum Map (Channel 9) ---
export const GM = {
  KICK: 36,
  SNARE: 38,
  SIDE_STICK: 37,
  RIDE: 51,
  RIDE_BELL: 53,
  CRASH: 49,
} as const;

export type DrumPattern = 'four_on_floor' | 'orchestral_timpani' | 'brushes_ride';

export interface DrumGeneratorOptions {
  pattern: DrumPattern;
  density: number; // 0–100
  swing: number; // 0–100
  dynamicsRange: number; // 0–100
}

export interface BeatWeightProfile {
  weights: number[]; // Normalized [0,1] per subdivision
  subdivisionsPerMeasure: number;
  isSwing: boolean;
  strongBeats: number[]; // Subdivision indices with weight > 0.3
}

export interface DrumNote {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

/** Number of subdivisions analyzed per measure when building a beat profile. */
export const SUBDIVISIONS_PER_MEASURE = 16;
/** Weight above which a subdivision is treated as a "strong" beat. */
export const STRONG_BEAT_THRESHOLD = 0.3;

export function applySwing(ticks: number, ppq: number, swingAmount: number): number {
  if (swingAmount === 0) return ticks;
  const eighthTicks = ppq / 2;
  const posInPair = ticks % (eighthTicks * 2);
  if (posInPair >= eighthTicks) {
    const shift = (swingAmount / 100) * (eighthTicks / 3);
    return ticks + Math.round(shift);
  }
  return ticks;
}

export function calcVelocity(base: number, accent: number, dynamicsRange: number): number {
  const range = (dynamicsRange / 100) * 60;
  return Math.max(1, Math.min(127, Math.round(base + accent * range)));
}

export function subdivisionWeight(
  profile: BeatWeightProfile,
  tick: number,
  ticksPerMeasure: number
): number {
  const pos = tick % ticksPerMeasure;
  const idx =
    Math.round(pos / (ticksPerMeasure / profile.subdivisionsPerMeasure)) %
    profile.subdivisionsPerMeasure;
  return profile.weights[idx] ?? 0;
}
