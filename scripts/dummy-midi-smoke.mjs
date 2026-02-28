import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import toneMidiPkg from '@tonejs/midi';
const { Midi } = toneMidiPkg;

const midi = new Midi();
midi.header.setTempo(120);
midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4], measures: 0 });

const track = midi.addTrack();
track.name = 'Dummy Test Track';
track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.8 });
track.addNote({ midi: 64, ticks: 0, durationTicks: 480, velocity: 0.8 });
track.addNote({ midi: 67, ticks: 0, durationTicks: 480, velocity: 0.8 });
track.addNote({ midi: 62, ticks: 960, durationTicks: 240, velocity: 0.7 });
track.addNote({ midi: 74, ticks: 1440, durationTicks: 120, velocity: 0.5 });

const bytes = midi.toArray();
assert.ok(bytes.length > 0, 'Expected serialized MIDI bytes.');

const tempDir = mkdtempSync(join(tmpdir(), 'dummy-midi-smoke-'));
const outPath = join(tempDir, 'dummy-test.mid');

try {
  writeFileSync(outPath, Buffer.from(bytes));

  const reparsed = new Midi(bytes);
  assert.equal(reparsed.tracks.length, 1, 'Expected one track after roundtrip.');
  assert.equal(reparsed.tracks[0].notes.length, 5, 'Expected five notes in dummy test track.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log('Dummy MIDI smoke test passed.');
