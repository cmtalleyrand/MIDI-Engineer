import * as assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';

import type { ConversionOptions } from '../types';
import { copyAndTransformTrackEvents, getTransformedTrackDataForPianoRoll } from '../components/services/midiPipeline';

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

export function runPianoRollPipelineTests() {
  const midi = new Midi();
  Object.defineProperty(midi.header, 'ppq', { value: 120 }); // low-PPQ source that triggered the regression
  const track = midi.addTrack();
  track.name = 'Short-note threshold scaling regression';
  track.addNote({ midi: 60, ticks: 0, durationTicks: 60, velocity: 0.8 });

  // 1/32-note threshold expressed in source PPQ ticks (120 * 0.125 = 15).
  const options = buildOptions({ removeShortNotesThreshold: 15 });

  const transformed = getTransformedTrackDataForPianoRoll(midi, 0, options);
  assert.equal(transformed.notes.length, 1, 'Piano roll transform should keep notes that are above the configured short-note threshold.');

  // Validate the shared event-copy/transform path used by MIDI/ABC export also retains the note.
  const exportMidi = new Midi();
  const exportTrack = exportMidi.addTrack();
  copyAndTransformTrackEvents(track, exportTrack, options, new Set(), exportMidi.header, midi.header.ppq);
  assert.equal(exportTrack.notes.length, 1, 'Export transform path should keep the same note (prevents empty ABC/MIDI exports).');
}
