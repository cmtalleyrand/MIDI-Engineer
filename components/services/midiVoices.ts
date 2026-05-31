import { RawNote, ConversionOptions, VoiceExplanation } from '../../types';
import { ticksPerMeasure } from './timeUtils';
import { columnizeByOnset, maxColumnDensity, VoiceNoteLike } from './voiceColumns';
import {
  pitchLeapCost,
  registerCenterCost,
  gapOpenCost,
  defaultVoiceCenter,
  VOICE_COST,
} from './voiceCosts';

const getMidi = (n: VoiceNoteLike) => n.midi;
const getTicks = (n: VoiceNoteLike) => n.ticks;
const getDuration = (n: VoiceNoteLike) => n.durationTicks;
const getEnd = (n: VoiceNoteLike) => n.ticks + n.durationTicks;

export function getVoiceLabel(index: number, total: number): string {
  if (index === -1) return 'Orph';
  if (total === 1) return 'Melody';
  if (total === 2) return index === 0 ? 'S' : 'B';
  if (total === 3) return ['S', 'T', 'B'][index] || `V${index}`;
  if (total === 4) return ['S', 'A', 'T', 'B'][index] || `V${index}`;
  return `V${index}`;
}

export interface VoiceDistributionResult {
  voices: RawNote[][];
  orphans: RawNote[];
}

// Notes carry voice assignment + an explanation bag in place; this view exposes
// those mutable fields without resorting to `any`.
type AssignableNote = RawNote & {
  voiceIndex?: number;
  explanation?: VoiceExplanation;
};

interface VoiceState {
  notes: AssignableNote[];
  /** Recent pitch center (EMA-ish: last note pitch), seeded from default range. */
  center: number;
  /** End tick of the most recent note, for gap-open detection. */
  lastEnd: number;
  /** Onset of the most recent note, for crossing checks. */
  lastTicks: number;
  lastMidi: number;
  seeded: boolean;
}

interface DensityArea {
  startTick: number;
  endTick: number;
  slices: { start: number; end: number; activeNotes: AssignableNote[] }[];
}

/**
 * Constraint-based voice distribution (PROJECT_INTENT §4).
 *
 * Stages:
 *   1. Determine voice count from sustained vertical density.
 *   2. Columnize by grid onset and assign anchors at the densest sustained
 *      columns, top-down by pitch.
 *   3. Fill remaining notes by minimizing a weighted path cost (pitch leap with
 *      octave/>octave/15st discontinuities, register-center, gap-open, chord
 *      fragmentation), treating voice crossing as a near-hard constraint.
 *   4. Notes whose cheapest placement is still disproportionate become orphans
 *      (no path dependency; exported on a dedicated lane; never deleted).
 */
export function distributeToVoices(
  notes: RawNote[],
  options?: ConversionOptions,
  ppq: number = 480
): VoiceDistributionResult {
  if (notes.length === 0) return { voices: [], orphans: [] };

  const TS_NUM = options?.timeSignature?.numerator || 4;
  const TS_DEN = options?.timeSignature?.denominator || 4;
  const TICKS_PER_MEASURE = ticksPerMeasure(ppq, { numerator: TS_NUM, denominator: TS_DEN });
  const EIGHTH_GAP = ppq / 2;

  const strictMonophony = options?.voiceSeparationDisableChords === true;
  const overlapTolerance = options?.voiceSeparationOverlapTolerance || 0;

  const sortedNotes = [...(notes as AssignableNote[])].sort((a, b) => getTicks(a) - getTicks(b));

  // --- Timeline slices for vertical density ---
  const allEvents = new Set<number>();
  sortedNotes.forEach((n) => {
    allEvents.add(getTicks(n));
    allEvents.add(getEnd(n));
  });
  const sortedTimeline = Array.from(allEvents).sort((a, b) => a - b);

  const slices: { start: number; end: number; activeNotes: AssignableNote[] }[] = [];
  let maxGlobalDensity = 0;
  for (let i = 0; i < sortedTimeline.length - 1; i++) {
    const start = sortedTimeline[i];
    const end = sortedTimeline[i + 1];
    const mid = (start + end) / 2;
    const active = sortedNotes.filter((n) => getTicks(n) <= mid && getEnd(n) > mid);
    if (active.length > maxGlobalDensity) maxGlobalDensity = active.length;
    slices.push({ start, end, activeNotes: active });
  }

  if (maxGlobalDensity === 0) return { voices: [sortedNotes], orphans: [] };

  const findAreasAtDensity = (targetDensity: number): DensityArea[] => {
    const areas: DensityArea[] = [];
    let current: DensityArea | null = null;
    slices.forEach((slice) => {
      if (slice.activeNotes.length >= targetDensity) {
        if (!current) {
          current = { startTick: slice.start, endTick: slice.end, slices: [slice] };
        } else if (slice.start - current.endTick <= EIGHTH_GAP) {
          current.endTick = slice.end;
          current.slices.push(slice);
        } else {
          areas.push(current);
          current = { startTick: slice.start, endTick: slice.end, slices: [slice] };
        }
      }
    });
    if (current) areas.push(current);
    return areas;
  };

  const isSustained = (area: DensityArea) => area.endTick - area.startTick >= TICKS_PER_MEASURE;

  // --- Stage 1: voice count from sustained density ---
  let ceilingDensity = maxGlobalDensity;
  while (ceilingDensity >= 1) {
    if (findAreasAtDensity(ceilingDensity).some(isSustained)) break;
    ceilingDensity--;
  }
  let finalPolyphony = ceilingDensity > 0 ? ceilingDensity : Math.max(1, maxGlobalDensity - 1);
  if (options?.voiceSeparationMaxVoices && options.voiceSeparationMaxVoices > 0) {
    finalPolyphony = options.voiceSeparationMaxVoices;
  }

  const voices: VoiceState[] = Array.from({ length: finalPolyphony }, (_, v) => ({
    notes: [],
    center: defaultVoiceCenter(v, finalPolyphony),
    lastEnd: -Infinity,
    lastTicks: -Infinity,
    lastMidi: defaultVoiceCenter(v, finalPolyphony),
    seeded: false,
  }));
  const orphans: AssignableNote[] = [];
  const assigned = new Set<AssignableNote>();

  const assignToVoice = (note: AssignableNote, v: number, explanation: VoiceExplanation) => {
    const state = voices[v];
    state.notes.push(note);
    state.center = state.seeded ? (state.center + getMidi(note)) / 2 : getMidi(note);
    state.lastEnd = getEnd(note);
    state.lastTicks = getTicks(note);
    state.lastMidi = getMidi(note);
    state.seeded = true;
    assigned.add(note);
    note.voiceIndex = v;
    note.explanation = explanation;
  };

  // --- Stage 2: anchor assignment at sustained dense columns (top-down) ---
  // Iterate densities from the chosen polyphony downward so that the strongest
  // vertical structure is anchored first.
  for (let d = Math.min(finalPolyphony, maxGlobalDensity); d >= 1; d--) {
    const sustained = findAreasAtDensity(d).filter(isSustained);
    if (sustained.length === 0) continue;
    for (const area of sustained) {
      for (const slice of area.slices) {
        const colNotes = slice.activeNotes
          .filter((n) => !assigned.has(n))
          .sort((a, b) => getMidi(b) - getMidi(a)); // high → low
        if (colNotes.length === 0) continue;
        // Assign top-down into the highest still-empty voices first.
        let voiceCursor = 0;
        for (const note of colNotes) {
          while (voiceCursor < finalPolyphony && voices[voiceCursor].notes.includes(note)) {
            voiceCursor++;
          }
          if (voiceCursor >= finalPolyphony) break;
          assignToVoice(note, voiceCursor, {
            phase: '1 - Anchor',
            text: `Sustained density-${d} column; assigned ${getVoiceLabel(
              voiceCursor,
              finalPolyphony
            )} top-down (rank ${voiceCursor}).`,
            assignedVoice: voiceCursor,
          });
          voiceCursor++;
        }
      }
    }
  }

  // --- Stage 3: gap-fill remaining notes by weighted path cost ---
  const remaining = sortedNotes.filter((n) => !assigned.has(n));

  for (const note of remaining) {
    const nMidi = getMidi(note);
    const nStart = getTicks(note);
    const nEnd = getEnd(note);

    let bestV = -1;
    let bestCost = Infinity;
    const costLog: { voice: string; cost: string; details: string }[] = [];

    for (let v = 0; v < finalPolyphony; v++) {
      const state = voices[v];
      const voiceName = getVoiceLabel(v, finalPolyphony);

      // Overlap with an existing note in this voice (respecting tolerance).
      const overlaps = state.notes.some((existing) => {
        const eStart = getTicks(existing);
        const eEnd = Math.max(eStart, getEnd(existing) - overlapTolerance);
        const aEnd = Math.max(nStart, nEnd - overlapTolerance);
        return nStart < eEnd && aEnd > eStart;
      });
      if (overlaps && strictMonophony) {
        costLog.push({ voice: voiceName, cost: 'N/A', details: 'overlap (strict mono)' });
        continue;
      }

      const details: string[] = [];
      let cost = 0;

      // Pitch-leap continuity from this voice's most recent note.
      if (state.seeded) {
        const leap = pitchLeapCost(state.lastMidi, nMidi);
        cost += leap;
        details.push(`leap ${leap.toFixed(0)}`);
      }

      // Register-center continuity.
      const reg = registerCenterCost(state.center, nMidi);
      cost += reg;
      details.push(`reg ${reg.toFixed(1)}`);

      // Gap-open (waking a voice after a rest).
      if (state.seeded && nStart > state.lastEnd) {
        const g = gapOpenCost(nStart - state.lastEnd, TICKS_PER_MEASURE);
        cost += g;
        if (g > 0) details.push(`gap ${g.toFixed(0)}`);
      }

      // Chord fragmentation: adding to a voice that already sounds at this onset
      // (i.e. a simultaneous note) fragments a chord across voices.
      const isChordAddition =
        !strictMonophony && state.notes.some((e) => getTicks(e) === nStart);
      if (isChordAddition) {
        cost += VOICE_COST.CHORD_FRAGMENTATION;
        details.push(`chord ${VOICE_COST.CHORD_FRAGMENTATION}`);
      }

      // Near-hard crossing constraint: penalize placements that would invert the
      // pitch order versus an adjacent voice at the same time.
      const above = v > 0 ? voices[v - 1] : undefined;
      const below = v < finalPolyphony - 1 ? voices[v + 1] : undefined;
      const crossesAbove = above?.seeded && above.lastTicks <= nStart && nMidi > above.lastMidi;
      const crossesBelow = below?.seeded && below.lastTicks <= nStart && nMidi < below.lastMidi;
      if (crossesAbove || crossesBelow) {
        cost += 60;
        details.push('cross 60');
      }

      costLog.push({ voice: voiceName, cost: cost.toFixed(1), details: details.join(', ') });
      if (cost < bestCost) {
        bestCost = cost;
        bestV = v;
      }
    }

    if (bestV !== -1 && bestCost <= VOICE_COST.ORPHAN_THRESHOLD) {
      assignToVoice(note, bestV, {
        phase: '2 - Gap Fill',
        winner: bestV,
        text: 'Weighted path-cost minimization.',
        costs: costLog,
      });
    } else {
      orphans.push(note);
      assigned.add(note);
      note.voiceIndex = -1;
      note.explanation = {
        phase: '3 - Orphan',
        reason:
          bestV === -1
            ? 'No voice could accept the note (overlap in all voices).'
            : `Cheapest placement cost ${bestCost.toFixed(1)} exceeded orphan threshold ${VOICE_COST.ORPHAN_THRESHOLD}.`,
        costs: costLog,
      };
    }
  }

  voices.forEach((s) => s.notes.sort((a, b) => getTicks(a) - getTicks(b)));
  orphans.sort((a, b) => getTicks(a) - getTicks(b));

  return { voices: voices.map((s) => s.notes), orphans };
}
