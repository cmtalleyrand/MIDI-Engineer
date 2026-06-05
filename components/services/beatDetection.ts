import { Midi } from '@tonejs/midi';
import { predictKey } from './analysis/keyPrediction';
import { ticksPerMeasure as measureTicks } from './timeUtils';
import { BeatWeightProfile, SUBDIVISIONS_PER_MEASURE, STRONG_BEAT_THRESHOLD } from './drumKit';

/**
 * Build a normalized per-subdivision weight profile from the selected tracks,
 * emphasizing lower (bass) notes, and detect swing feel.
 */
export function detectBeatProfile(
  midi: Midi,
  trackIds: number[],
  timeSignature: { numerator: number; denominator: number },
  ppq: number
): BeatWeightProfile {
  const subdivisions = SUBDIVISIONS_PER_MEASURE;
  const ticksPerMeasure = measureTicks(ppq, timeSignature);
  const ticksPerSub = ticksPerMeasure / subdivisions;

  const weights = new Array(subdivisions).fill(0);

  for (const id of trackIds) {
    const track = midi.tracks[id];
    if (!track) continue;
    for (const note of track.notes) {
      const pos = note.ticks % ticksPerMeasure;
      const idx = Math.round(pos / ticksPerSub) % subdivisions;
      const bassWeight = (128 - note.midi) / 128;
      weights[idx] += bassWeight;
    }
  }

  // Normalize to [0, 1]
  const max = Math.max(...weights);
  if (max > 0) {
    for (let i = 0; i < subdivisions; i++) weights[i] /= max;
  }

  const strongBeats = weights
    .map((w, i) => ({ w, i }))
    .filter((x) => x.w > STRONG_BEAT_THRESHOLD)
    .map((x) => x.i);

  // Detect swing: compare even offbeats (straight) vs odd offbeats (swung)
  let straightW = 0,
    swungW = 0;
  for (let i = 0; i < subdivisions; i += 4) {
    if (i + 2 < subdivisions) straightW += weights[i + 2];
    if (i + 3 < subdivisions) swungW += weights[i + 3];
  }
  const isSwing = swungW > straightW * 1.5;

  return { weights, subdivisionsPerMeasure: subdivisions, isSwing, strongBeats };
}

/** Pick root + dominant timpani pitches from the pitch-class histogram. */
export function detectTimpaniPitches(
  midi: Midi,
  trackIds: number[]
): { root: number; dominant: number } {
  const hist: Record<number, number> = {};
  let total = 0;
  for (let i = 0; i < 12; i++) hist[i] = 0;
  for (const id of trackIds) {
    const track = midi.tracks[id];
    if (!track) continue;
    for (const note of track.notes) {
      hist[note.midi % 12]++;
      total++;
    }
  }

  if (total === 0) return { root: 36, dominant: 43 }; // C2, G2

  const predictions = predictKey(hist, total);
  const rootPC = predictions.length > 0 ? predictions[0].winner.root : 0;
  const root = 36 + rootPC; // C2 range
  const dominant = root + 7 <= 60 ? root + 7 : root - 5; // fifth above, clamp to timpani range

  return { root, dominant };
}
