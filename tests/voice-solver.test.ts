import * as assert from 'node:assert/strict';
import type { ConversionOptions, RawNote } from '../types';
import { distributeToVoices } from '../components/services/midiVoices';

const PPQ = 480;
const MEASURE = PPQ * 4;

function note(midi: number, ticks: number, durationTicks: number): RawNote {
  return { midi, ticks, durationTicks, velocity: 0.8, name: `N${midi}` };
}

function opts(partial: Partial<ConversionOptions> = {}): ConversionOptions {
  return {
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tempoChangeMode: 'speed',
    originalTempo: 120,
    transposition: 0,
    noteTimeScale: 1,
    inversionMode: 'off',
    melodicInversion: { enabled: false, startMeasure: 1, endMeasure: 1 },
    exportRange: { enabled: false, startMeasure: 1, endMeasure: 999 },
    primaryRhythm: { enabled: false, family: 'Simple', minNoteValue: '1/16' },
    secondaryRhythm: { enabled: false, family: 'Triple', minNoteValue: '1/8t' },
    quantizationValue: 'off',
    quantizeDurationMin: 'off',
    shiftToMeasure: false,
    detectOrnaments: false,
    modalConversion: { enabled: false, root: 0, modeName: 'Major', mappings: {} },
    removeShortNotesThreshold: 0,
    pruneOverlaps: false,
    pruneThresholdIndex: 0,
    voiceSeparationOverlapTolerance: 0,
    voiceSeparationPitchBias: 50,
    voiceSeparationMaxVoices: 0,
    voiceSeparationDisableChords: false,
    outputStrategy: 'separate_voices',
    keySignatureSpelling: 'auto',
    abcKeyExport: {
      enabled: false,
      tonicLetter: 'C',
      tonicAccidental: '=',
      mode: 'maj',
      additionalAccidentals: [],
    },
    ...partial,
  };
}

export function runVoiceSolverTests(): void {
  // Empty input → empty result.
  {
    const r = distributeToVoices([], opts(), PPQ);
    assert.deepEqual(r.voices, [], 'empty notes → no voices');
    assert.deepEqual(r.orphans, [], 'empty notes → no orphans');
  }

  // Single note → kept, never dropped.
  {
    const r = distributeToVoices([note(60, 0, MEASURE)], opts(), PPQ);
    const total = r.voices.reduce((s, v) => s + v.length, 0) + r.orphans.length;
    assert.equal(total, 1, 'single note is retained');
  }

  // No note is ever lost (conservation), for a polyphonic block.
  {
    const input = [
      // sustained 4-note chord block for a full measure (establishes 4 voices)
      note(72, 0, MEASURE),
      note(67, 0, MEASURE),
      note(64, 0, MEASURE),
      note(60, 0, MEASURE),
      // a melodic continuation up top
      note(74, MEASURE, PPQ),
      note(76, MEASURE + PPQ, PPQ),
    ];
    const r = distributeToVoices(input, opts(), PPQ);
    const total = r.voices.reduce((s, v) => s + v.length, 0) + r.orphans.length;
    assert.equal(total, input.length, 'all notes conserved across voices + orphans');
  }

  // SATB block: a sustained 4-note chord is split top-down into 4 voices.
  {
    const input = [
      note(72, 0, MEASURE), // S
      note(67, 0, MEASURE), // A
      note(64, 0, MEASURE), // T
      note(60, 0, MEASURE), // B
    ];
    const r = distributeToVoices(input, opts(), PPQ);
    assert.equal(r.voices.length, 4, 'four sustained pitches → four voices');
    // Voice 0 (top) should hold the highest pitch; last voice the lowest.
    const tops = r.voices.map((v) => v[0]?.midi);
    assert.equal(tops[0], 72, 'top voice gets the highest pitch');
    assert.equal(tops[tops.length - 1], 60, 'bottom voice gets the lowest pitch');
    assert.equal(r.orphans.length, 0, 'clean SATB block has no orphans');
  }

  // Monophonic line with a short isolated outlier far away → orphan candidate
  // under strict monophony with a single voice.
  {
    const input = [
      note(60, 0, MEASURE),
      note(64, MEASURE, MEASURE),
      note(67, MEASURE * 4, PPQ / 4),
    ];
    const r = distributeToVoices(
      input,
      opts({ voiceSeparationDisableChords: true, voiceSeparationMaxVoices: 1 }),
      PPQ
    );
    const total = r.voices.reduce((s, v) => s + v.length, 0) + r.orphans.length;
    assert.equal(total, input.length, 'strict-mono conserves all notes');
  }

  // Crossing pressure: two interleaved lines should not collapse into a single
  // voice with wild zig-zag; conservation still holds and at least 2 voices used.
  {
    const input = [
      note(72, 0, PPQ),
      note(48, 0, PPQ),
      note(71, PPQ, PPQ),
      note(50, PPQ, PPQ),
      note(72, 2 * PPQ, PPQ),
      note(48, 2 * PPQ, PPQ),
      note(71, 3 * PPQ, PPQ),
      note(50, 3 * PPQ, PPQ),
    ];
    const r = distributeToVoices(input, opts(), PPQ);
    const total = r.voices.reduce((s, v) => s + v.length, 0) + r.orphans.length;
    assert.equal(total, input.length, 'crossing case conserves all notes');
    const usedVoices = r.voices.filter((v) => v.length > 0).length;
    assert.ok(usedVoices >= 2, 'two interleaved registers use at least two voices');
  }

  // Orphans never overlap-collapse: every assigned voice is internally
  // non-overlapping when strict monophony is on.
  {
    const input = [note(60, 0, MEASURE), note(64, 0, MEASURE), note(67, 0, MEASURE)];
    const r = distributeToVoices(
      input,
      opts({ voiceSeparationDisableChords: true, voiceSeparationMaxVoices: 1 }),
      PPQ
    );
    const v0 = r.voices[0];
    for (let i = 1; i < v0.length; i++) {
      const prev = v0[i - 1];
      assert.ok(
        prev.ticks + prev.durationTicks <= v0[i].ticks,
        'strict-mono voice has no internal overlap'
      );
    }
  }
}
