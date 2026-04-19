import * as assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';

import type { ConversionOptions } from '../types';
import { generateTrackAbcPreviews } from '../components/services/midiAbc';

function buildOptions(partial: Partial<ConversionOptions> = {}): ConversionOptions {
  return {
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tempoChangeMode: 'speed',
    originalTempo: 120,
    transposition: 0,
    noteTimeScale: 1,
    inversionMode: 'off',
    melodicInversion: { enabled: false, startMeasure: 1, endMeasure: 4 },
    exportRange: { enabled: false, startMeasure: 1, endMeasure: 8 },
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
    outputStrategy: 'combine',
    keySignatureSpelling: 'auto',
    abcKeyExport: { enabled: false, tonicLetter: 'C', tonicAccidental: '=', mode: 'maj', additionalAccidentals: [] },
    ...partial
  };
}

export function runMidiAbcPreviewTests() {
  const midi = new Midi();
  const track1 = midi.addTrack();
  track1.name = 'Lead';
  track1.addNote({ midi: 60, ticks: 0, durationTicks: 240, velocity: 0.8 });

  const track2 = midi.addTrack();
  track2.name = 'Bass';
  track2.addNote({ midi: 48, ticks: 0, durationTicks: 480, velocity: 0.8 });

  const previews = generateTrackAbcPreviews(midi, [0, 1], 'song_export.abc', new Set(), buildOptions());

  assert.equal(previews.length, 2, 'Track-level ABC preview generation should produce one preview per selected track.');
  assert.equal(previews[0].fileName, 'song_export_track1.abc', 'Track-level ABC preview file naming should encode 1-indexed track ordinal.');
  assert.equal(previews[1].fileName, 'song_export_track2.abc', 'Track-level ABC preview file naming should encode each selected track ordinal independently.');
  assert.match(previews[0].abc, /V:1 name="Lead"/, 'Preview output should preserve the source track label in ABC voice metadata.');
  assert.match(previews[1].abc, /V:1 name="Bass"/, 'Each preview should contain only the corresponding single-track voice declaration.');
}
