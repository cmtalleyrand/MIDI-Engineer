import { Midi } from '@tonejs/midi';

import type { ConversionOptions, RawNote, RhythmRule } from '../types';
import { applyShadowQuantization } from '../components/services/shadowQuantizer';
import { detectAndTagOrnaments } from '../components/services/midiCore';
import { distributeToVoices } from '../components/services/midiVoices';
import { resolveExportOptions } from '../components/services/midiPipeline';
import { renderMidiToAbc } from '../components/services/midiAbc';

const PPQ = 480;
const primarySimple: RhythmRule = { enabled: true, family: 'Simple', minNoteValue: '1/16' };
const secondaryTriple: RhythmRule = { enabled: true, family: 'Triple', minNoteValue: '1/8t' };

function note(midi: number, ticks: number, durationTicks: number): RawNote {
  return { midi, ticks, durationTicks, velocity: 0.8, name: `N${midi}` };
}

function withBaseOptions(partial: Partial<ConversionOptions> = {}): ConversionOptions {
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
    detectOrnaments: true,
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
    abcKeyExport: { enabled: false, tonicLetter: 'C', tonicAccidental: '=', mode: 'maj', additionalAccidentals: [] },
    ...partial
  };
}

export function runFixtureSuite() {
  const tripletOutlierInput = [note(60, 0, 120), note(62, 120, 120), note(64, 240, 120), note(65, 320, 110), note(67, 480, 120)];
  const tripletOutlier = applyShadowQuantization(tripletOutlierInput, PPQ, primarySimple, secondaryTriple).map(n => ({
    midi: n.midi,
    ticks: n.ticks,
    selectedFamily: n.shadowDecision?.selectedFamily,
    conflictTypes: n.shadowDecision?.conflictTypes ?? []
  }));

  const contextualTripletInput = [note(70, 0, 160), note(72, 160, 160), note(74, 320, 160), note(76, 500, 170)];
  const contextualTriplet = applyShadowQuantization(contextualTripletInput, PPQ, primarySimple, secondaryTriple).map(n => ({
    midi: n.midi,
    ticks: n.ticks,
    selectedFamily: n.shadowDecision?.selectedFamily
  }));

  const overlapConflict = applyShadowQuantization([note(60, 0, 360), note(60, 240, 360)], PPQ, primarySimple, secondaryTriple).map(n => ({
    midi: n.midi,
    ticks: n.ticks,
    durationTicks: n.durationTicks,
    conflictTypes: n.shadowDecision?.conflictTypes ?? [],
    accommodationApplied: n.shadowDecision?.accommodationApplied ?? null
  }));

  const densityBlip = applyShadowQuantization([note(60, 0, 480), note(64, 240, 40), note(67, 480, 480)], PPQ, primarySimple, secondaryTriple).map(n => ({
    midi: n.midi,
    ticks: n.ticks,
    durationTicks: n.durationTicks,
    conflictTypes: n.shadowDecision?.conflictTypes ?? []
  }));

  const ornaments = {
    grace: detectAndTagOrnaments([note(61, 0, 40), note(60, 40, 240)], PPQ).map(n => ({ midi: n.midi, isOrnament: !!n.isOrnament })),
    mordent: detectAndTagOrnaments([note(60, 0, 40), note(62, 40, 40), note(60, 80, 300)], PPQ).map(n => ({ midi: n.midi, isOrnament: !!n.isOrnament })),
    turn: detectAndTagOrnaments([note(62, 0, 40), note(60, 40, 40), note(58, 80, 40), note(60, 120, 300)], PPQ).map(n => ({ midi: n.midi, isOrnament: !!n.isOrnament })),
    trill: detectAndTagOrnaments([note(61, 0, 40), note(60, 40, 40), note(61, 80, 40), note(60, 120, 40), note(60, 160, 300)], PPQ).map(n => ({ midi: n.midi, isOrnament: !!n.isOrnament }))
  };

  const orphanNotes = [note(60, 0, 480), note(64, 240, 480), note(67, 960, 240)];
  const orphanDistribution = distributeToVoices(orphanNotes, withBaseOptions({ voiceSeparationDisableChords: true, voiceSeparationMaxVoices: 1 }), PPQ);

  const midi = new Midi();
  midi.header.setTempo(120);
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
  const track = midi.addTrack();
  track.name = 'Fixture';
  orphanNotes.forEach(n => track.addNote({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, velocity: 0.8 }));

  const abc = renderMidiToAbc(midi, 'orphan-suite.abc', withBaseOptions({ outputStrategy: 'separate_voices' }), 120);

  const abcCustomPhr = renderMidiToAbc(midi, 'custom-phr.abc', withBaseOptions({
    abcKeyExport: {
      enabled: true,
      tonicLetter: 'D',
      tonicAccidental: '=',
      mode: 'phr',
      additionalAccidentals: [{ accidental: '^', letter: 'f' }]
    }
  }), 120);

  const abcCustomMix = renderMidiToAbc(midi, 'custom-mix.abc', withBaseOptions({
    abcKeyExport: {
      enabled: true,
      tonicLetter: 'D',
      tonicAccidental: '=',
      mode: 'maj',
      additionalAccidentals: [{ accidental: '=', letter: 'c' }]
    }
  }), 120);

  const duplicateMidi = new Midi();
  duplicateMidi.header.setTempo(91);
  duplicateMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
  const dupTrack = duplicateMidi.addTrack();
  dupTrack.name = 'Dup';
  dupTrack.addNote({ midi: 71, ticks: 0, durationTicks: 240, velocity: 0.8 });
  dupTrack.addNote({ midi: 71, ticks: 120, durationTicks: 240, velocity: 0.8 });
  const duplicateAbc = renderMidiToAbc(duplicateMidi, 'duplicate.abc', withBaseOptions({
    outputStrategy: 'combine',
    modalConversion: { enabled: false, root: 10, modeName: 'Natural Minor', mappings: {} },
    abcKeyExport: {
      enabled: true,
      tonicLetter: 'B',
      tonicAccidental: '_',
      mode: 'min',
      additionalAccidentals: [{ accidental: '=', letter: 'A' }, { accidental: '=', letter: 'E' }]
    }
  }), 120);


  const customKeyScaleMidi = new Midi();
  customKeyScaleMidi.header.setTempo(120);
  customKeyScaleMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4] }];
  const customKeyTrack = customKeyScaleMidi.addTrack();
  customKeyTrack.name = 'CustomKeyScale';
  customKeyTrack.addNote({ midi: 70, ticks: 0, durationTicks: 240, velocity: 0.8 });
  const customKeyScaleAbc = renderMidiToAbc(customKeyScaleMidi, 'custom-key-scale.abc', withBaseOptions({
    outputStrategy: 'combine',
    abcKeyExport: {
      enabled: true,
      tonicLetter: 'D',
      tonicAccidental: '=',
      mode: 'phr',
      additionalAccidentals: []
    }
  }), 120);

  const defaultScaleAbc = renderMidiToAbc(customKeyScaleMidi, 'default-key-scale.abc', withBaseOptions({
    outputStrategy: 'combine',
    abcKeyExport: { enabled: false, tonicLetter: 'C', tonicAccidental: '=', mode: 'maj', additionalAccidentals: [] }
  }), 120);

  const quantSplit = {
    midiDefault: resolveExportOptions(withBaseOptions(), 'midi').debug,
    abcDefault: resolveExportOptions(withBaseOptions(), 'abc').debug,
    explicitQuant: resolveExportOptions(withBaseOptions({
      primaryRhythm: { enabled: true, family: 'Simple', minNoteValue: '1/8' },
      secondaryRhythm: { enabled: true, family: 'Triple', minNoteValue: '1/8t' },
      quantizationValue: '1/8'
    }), 'midi').debug
  };

  return {
    tripletOutlier,
    contextualTriplet,
    overlapConflict,
    densityBlip,
    ornaments,
    orphanBehavior: {
      voiceSizes: orphanDistribution.voices.map(v => v.length),
      orphanCount: orphanDistribution.orphans.length,
      orphanTicks: orphanDistribution.orphans.map(n => n.ticks),
      abcVoiceHeaders: abc.split('\n').filter(line => line.startsWith('V:')),
      abcIncludesOrphanPitch: abc.includes('E')
    },
    quantSplit,
    abcKeyOverrides: {
      phr: abcCustomPhr.split('\n').find(line => line.startsWith('K:')) || '',
      mixolydian: abcCustomMix.split('\n').find(line => line.startsWith('K:')) || ''
    },
    duplicatePitchHandling: {
      keyLine: duplicateAbc.split('\n').find(line => line.startsWith('K:')) || '',
      containsDuplicatedChordPitch: duplicateAbc.includes('[B-B]')
    },
    customKeyAffectsPitchSpelling: {
      keyLine: customKeyScaleAbc.split('\n').find(line => line.startsWith('K:')) || '',
      bodyLineWithCustomKey: customKeyScaleAbc.split('\n').find(line => line.includes('|') && !line.startsWith('%')) || '',
      bodyLineWithDefaultKey: defaultScaleAbc.split('\n').find(line => line.includes('|') && !line.startsWith('%')) || ''
    }
  };
}

