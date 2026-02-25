import * as assert from 'node:assert/strict';

import type { PianoRollTrackData } from '../types';
import { canSelectPianoRollNote, sortNotesForPianoRollRendering } from '../components/services/pianoRollUtils';

type PianoRollNote = PianoRollTrackData['notes'][number];

function buildNote(partial: Partial<PianoRollNote> & Pick<PianoRollNote, 'name' | 'midi' | 'ticks' | 'durationTicks' | 'velocity'>): PianoRollNote {
  return {
    name: partial.name,
    midi: partial.midi,
    ticks: partial.ticks,
    durationTicks: partial.durationTicks,
    velocity: partial.velocity,
    voiceIndex: partial.voiceIndex,
    isOrnament: partial.isOrnament,
    explanation: partial.explanation,
    shadowDecision: partial.shadowDecision
  };
}

export function runPianoRollUtilsTests() {
  assert.equal(canSelectPianoRollNote(false, false), false, 'Note selection should be disabled when both debug toggles are off.');
  assert.equal(canSelectPianoRollNote(true, false), true, 'Voice debug toggle should enable note selection.');
  assert.equal(canSelectPianoRollNote(false, true), true, 'Quantizer debug toggle should enable note selection.');

  const sourceNotes: PianoRollNote[] = [
    buildNote({ name: 'n1', midi: 60, ticks: 0, durationTicks: 120, velocity: 0.8, isOrnament: true }),
    buildNote({ name: 'n2', midi: 62, ticks: 120, durationTicks: 120, velocity: 0.8, isOrnament: false }),
    buildNote({ name: 'n3', midi: 64, ticks: 240, durationTicks: 120, velocity: 0.8 }),
    buildNote({ name: 'n4', midi: 65, ticks: 360, durationTicks: 120, velocity: 0.8, isOrnament: true })
  ];

  const sorted = sortNotesForPianoRollRendering(sourceNotes);
  assert.deepEqual(
    sorted.map(note => note.name),
    ['n2', 'n3', 'n1', 'n4'],
    'Ornaments should render after non-ornaments so they are visible on top.'
  );

  assert.deepEqual(
    sourceNotes.map(note => note.name),
    ['n1', 'n2', 'n3', 'n4'],
    'Sorting helper must not mutate original note order.'
  );
}
