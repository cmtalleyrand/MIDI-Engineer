import { DrumGenerationOptions, RhythmSkeletonEvent } from '../../../types';

interface DrumNote {
  midi: number;
  ticks: number;
  durationTicks: number;
  velocity: number;
}

const DRUMS = {
  kick: 36,
  snare: 38,
  clap: 39,
  hatClosed: 42,
  lowTom: 41,
  midTom: 45,
  highTom: 48,
  crash: 49
};

/**
 * Fixed velocity formula. At intensity=0: range ≈ 0.08–0.30 (ghost to pp).
 * At intensity=1: range ≈ 0.23–0.95 (p to ff). `base` is a per-note weight 0–1.
 */
function vel(base: number, intensity: number): number {
  const lo = 0.08 + intensity * 0.15;
  const hi = 0.30 + intensity * 0.65;
  return Math.max(0.05, Math.min(1.0, lo + base * (hi - lo)));
}

/**
 * Rhythmic alignment gate: decides whether a drum hit fires at this tick.
 * Positive align → fires when this voice IS playing (drums lock to voice).
 * Negative align → fires when this voice is NOT playing (counter-rhythm).
 */
function rhythmGate(
  ticks: number,
  bassTickSet: Set<number>,
  melodyTickSet: Set<number>,
  alignBass: number,
  alignMelody: number
): boolean {
  if (alignBass === 0 && alignMelody === 0) return true;
  const isBass   = bassTickSet.has(ticks);
  const isMelody = melodyTickSet.has(ticks);
  const bassScore   = alignBass   * (isBass   ? 1 : -1);
  const melodyScore = alignMelody * (isMelody ? 1 : -1);
  // Threshold -0.6 means both alignments must push hard against an event to suppress it
  return (bassScore + melodyScore) > -0.6;
}

/**
 * Local density ratio: how busy `voiceSkeleton` is near `ticks`, relative to `fullSkeleton`.
 * Returns 0 (voice is sparse here) to 1 (voice accounts for all events here).
 */
function localDensityRatio(
  ticks: number,
  voiceSkeleton: RhythmSkeletonEvent[],
  fullSkeleton: RhythmSkeletonEvent[],
  ppq: number
): number {
  const window = ppq * 4;
  const voiceCount = voiceSkeleton.filter(e => Math.abs(e.ticks - ticks) <= window).length;
  const fullCount  = fullSkeleton.filter(e => Math.abs(e.ticks - ticks) <= window).length;
  if (fullCount === 0) return 0;
  return Math.min(1, voiceCount / fullCount);
}

/**
 * Density alignment gate: skips hits based on local voice busyness.
 * align > 0 → fire more when voice is busy (skip when sparse).
 * align < 0 → fire more when voice is sparse (skip when busy).
 */
function densityGate(ratio: number, align: number): boolean {
  if (align === 0) return true;
  if (align > 0) {
    return ratio >= (1 - align) * 0.65;
  } else {
    return ratio <= 1.0 - Math.abs(align) * 0.65;
  }
}

export function generateDrumNotesFromRhythm(
  skeleton: RhythmSkeletonEvent[],
  bassSkeleton: RhythmSkeletonEvent[],
  melodySkeleton: RhythmSkeletonEvent[],
  options: DrumGenerationOptions,
  ppq: number
): DrumNote[] {
  const notes: DrumNote[] = [];
  if (!options.enabled || skeleton.length === 0) return notes;

  const bassTickSet   = new Set(bassSkeleton.map(e => e.ticks));
  const melodyTickSet = new Set(melodySkeleton.map(e => e.ticks));
  const fl = options.fillLevel;

  /**
   * add(midi, ticks, dur, base, tier)
   * tier: instrument priority 1–5; skipped if tier > options.parts.
   * hatClosed notes are skipped if hatEnabled is false.
   */
  const add = (midi: number, ticks: number, dur: number, base: number, tier: number) => {
    if (tier > options.parts) return;
    if (midi === DRUMS.hatClosed && !options.hatEnabled) return;
    notes.push({
      midi,
      ticks: Math.max(0, Math.round(ticks)),
      durationTicks: Math.max(1, Math.round(dur)),
      velocity: vel(base, options.intensity)
    });
  };

  skeleton.forEach((e, i) => {
    // --- Rhythm alignment gate ---
    if (!rhythmGate(e.ticks, bassTickSet, melodyTickSet, options.rhythmAlignBass, options.rhythmAlignMelody)) return;

    // --- Density alignment gates ---
    if (options.densityAlignBass !== 0) {
      const ratio = localDensityRatio(e.ticks, bassSkeleton, skeleton, ppq);
      if (!densityGate(ratio, options.densityAlignBass)) return;
    }
    if (options.densityAlignMelody !== 0) {
      const ratio = localDensityRatio(e.ticks, melodySkeleton, skeleton, ppq);
      if (!densityGate(ratio, options.densityAlignMelody)) return;
    }

    const pulseDur = Math.max(Math.round(ppq / 8), Math.min(e.durationTicks, Math.round(ppq / 2)));

    switch (options.style) {

      case 'four_on_floor':
        // Tier 1: Kick on every event
        add(DRUMS.kick,      e.ticks,                                    pulseDur,                   0.95 * e.strength, 1);
        // Tier 2: Clap on alternating events (beat 2 / 4 analog)
        if ((i % 2) === 1)
          add(DRUMS.clap,    e.ticks,                                    Math.round(ppq / 10),        0.75,              2);
        // Tier 3: Off-beat hi-hat pulse
        add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 12),        0.55,              3);
        // Tier 4 + fillLevel ≥ 2: Off-beat kick fill
        if (fl >= 2)
          add(DRUMS.kick,    e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 10),        0.60,              4);
        // Tier 5 + fillLevel ≥ 3: 16th-note hat subdivision
        if (fl >= 3)
          add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.75), Math.round(ppq / 12),  0.40,              5);
        break;

      case 'martial':
        // Tier 1: Snare on every event
        add(DRUMS.snare,     e.ticks,                                    pulseDur,                   0.92 * e.strength, 1);
        // Tier 2: Kick on every 4th event
        if (i % 4 === 0)
          add(DRUMS.kick,    e.ticks,                                    pulseDur,                   0.80,              2);
        // Tier 3: Off-beat hi-hat
        add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 12),        0.50,              3);
        // Tier 4 + fillLevel ≥ 1: Ghost snare
        if (fl >= 1)
          add(DRUMS.snare,   e.ticks + Math.round(e.durationTicks * 0.5), Math.round(ppq / 12),     0.38,              4);
        // Tier 5 + fillLevel ≥ 2: Fill kick on off-beats
        if (fl >= 2 && (i % 2) === 1)
          add(DRUMS.kick,    e.ticks + Math.round(e.durationTicks * 0.75), Math.round(ppq / 10),    0.60,              5);
        break;

      case 'timpani_melodic': {
        const toms = [DRUMS.lowTom, DRUMS.midTom, DRUMS.highTom];
        const idx  = Math.max(0, Math.min(2, Math.floor(((e.sourceNoteMidi % 12) / 12) * 3)));
        // Tier 1: Tom chosen by source pitch
        add(toms[idx],       e.ticks,                                    Math.max(pulseDur, Math.round(ppq / 4)), 0.86 * e.strength, 1);
        // Tier 2: Bass-tom accent every 4th event
        if (i % 4 === 0 && idx !== 0)
          add(DRUMS.lowTom,  e.ticks,                                    Math.round(ppq / 6),        0.70,              2);
        // Tier 3: Subtle off-beat hi-hat
        add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.5), Math.round(ppq / 12),    0.40,              3);
        // Tier 4 + fillLevel ≥ 1: Adjacent-pitch echo tom
        if (fl >= 1)
          add(toms[Math.max(0, idx - 1)], e.ticks + Math.round(e.durationTicks * 0.66), Math.round(ppq / 8), 0.42, 4);
        // Tier 5 + fillLevel ≥ 2: High-tom roll at phrase boundaries
        if (fl >= 2 && i % 8 === 7)
          add(DRUMS.highTom, e.ticks,                                    Math.round(ppq / 6),        0.65,              5);
        break;
      }

      case 'cinematic_toms':
        // Tier 1: Low tom on every event
        add(DRUMS.lowTom,    e.ticks,                                    Math.max(pulseDur, Math.round(ppq / 3)), 0.92 * e.strength, 1);
        // Tier 2: Mid tom every 3rd event
        if (i % 3 === 2)
          add(DRUMS.midTom,  e.ticks,                                    Math.round(ppq / 6),        0.68,              2);
        // Tier 3: High tom every 5th event
        if (i % 5 === 4)
          add(DRUMS.highTom, e.ticks,                                    Math.round(ppq / 6),        0.60,              3);
        // Tier 4 + fillLevel ≥ 2: Crash at phrase peaks
        if (fl >= 2 && i % 8 === 7)
          add(DRUMS.crash,   e.ticks,                                    Math.round(ppq / 2),        0.82,              4);
        // Tier 5 + fillLevel ≥ 3: Hi-hat for tension
        if (fl >= 3)
          add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.5), Math.round(ppq / 12),  0.45,              5);
        break;

      case 'electro_pulse':
        // Tier 1: Kick on every event
        add(DRUMS.kick,      e.ticks,                                    pulseDur,                   0.90 * e.strength, 1);
        // Tier 2: Off-beat hi-hat
        add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks / 2), Math.round(ppq / 12),        0.62,              2);
        // Tier 3: Clap every 4th event
        if (i % 4 === 1)
          add(DRUMS.clap,    e.ticks,                                    Math.round(ppq / 10),        0.70,              3);
        // Tier 4 + fillLevel ≥ 1: Extra hi-hat subdivision
        if (fl >= 1)
          add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.75), Math.round(ppq / 12), 0.45,              4);
        // Tier 5 + fillLevel ≥ 2: Rapid hat at quarter-point
        if (fl >= 2)
          add(DRUMS.hatClosed, e.ticks + Math.round(e.durationTicks * 0.25), Math.round(ppq / 12), 0.38,              5);
        break;
    }
  });

  return notes.sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
}
