import * as assert from 'node:assert/strict';

import { canSelectPianoRollNote, sortNotesForPianoRollRendering } from '../components/services/pianoRollUtils';

export function runPianoRollUtilsTests() {
  assert.equal(canSelectPianoRollNote(false, false), false, 'Note selection should be disabled when both debug toggles are off.');
  assert.equal(canSelectPianoRollNote(true, false), true, 'Voice debug toggle should enable note selection.');
  assert.equal(canSelectPianoRollNote(false, true), true, 'Quantizer debug toggle should enable note selection.');

  const sourceNotes = [
    { id: 'n1', isOrnament: true },
    { id: 'n2', isOrnament: false },
    { id: 'n3' },
    { id: 'n4', isOrnament: true }
  ];

  const sorted = sortNotesForPianoRollRendering(sourceNotes);
  assert.deepEqual(
    sorted.map(note => note.id),
    ['n2', 'n3', 'n1', 'n4'],
    'Ornaments should render after non-ornaments so they are visible on top.'
  );

  assert.deepEqual(
    sourceNotes.map(note => note.id),
    ['n1', 'n2', 'n3', 'n4'],
    'Sorting helper must not mutate original note order.'
  );
}
