import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { runFixtureSuite } from './fixture-suite.test';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');

function loadSnapshot<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, fileName), 'utf8')) as T;
}

const actual = runFixtureSuite();

const expectedShadow = loadSnapshot<Pick<typeof actual, 'tripletOutlier' | 'contextualTriplet' | 'overlapConflict' | 'densityBlip'>>(
  'shadow-quantization.snapshot.json'
);
const expectedOrnaments = loadSnapshot<typeof actual.ornaments>('ornaments.snapshot.json');
const expectedVoices = loadSnapshot<typeof actual.orphanBehavior>('voice-orphan-behavior.snapshot.json');
const expectedQuantization = loadSnapshot<typeof actual.quantSplit>('quantization-policy.snapshot.json');
const expectedAbcKeyOverrides = loadSnapshot<typeof actual.abcKeyOverrides>('abc-key-overrides.snapshot.json');

assert.deepStrictEqual(
  {
    tripletOutlier: actual.tripletOutlier,
    contextualTriplet: actual.contextualTriplet,
    overlapConflict: actual.overlapConflict,
    densityBlip: actual.densityBlip
  },
  expectedShadow
);

assert.deepStrictEqual(actual.ornaments, expectedOrnaments);
assert.deepStrictEqual(actual.orphanBehavior, expectedVoices);
assert.deepStrictEqual(actual.quantSplit, expectedQuantization);
assert.deepStrictEqual(actual.abcKeyOverrides, expectedAbcKeyOverrides);

// Focused invariants to make failures easier to diagnose than a broad snapshot mismatch.
assert.equal(actual.orphanBehavior.orphanCount, 1, 'Expected exactly one orphan note in orphan fixture');
assert.deepStrictEqual(actual.orphanBehavior.voiceSizes, [2], 'Expected orphan fixture to keep 2 notes in the surviving voice lane');
assert.equal(
  actual.quantSplit.midiDefault.quantizationPath,
  'bypass',
  'Expected MIDI default export to bypass quantization unless explicitly enabled'
);
assert.equal(
  actual.quantSplit.abcDefault.quantizationPath,
  'resolved_shadow',
  'Expected ABC default export to use resolved shadow quantization'
);

console.log('Fixture suite snapshot validation passed.');
