import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { runFixtureSuite } from './fixture-suite.test';
import { runPianoRollUtilsTests } from './piano-roll-utils.test';
import { runPianoRollPipelineTests } from './piano-roll-pipeline.test';

const TIMEOUT_MS = 30_000;
const timer = setTimeout(() => {
    console.error(`Tests timed out after ${TIMEOUT_MS / 1000}s — aborting.`);
    process.exit(1);
}, TIMEOUT_MS);

const snapshotPath = path.join(process.cwd(), 'tests', 'fixtures', 'fixture-suite.snapshot.json');

const actual = runFixtureSuite();
const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
assert.deepStrictEqual(actual, expected);
console.log('Fixture suite snapshot validation passed.');

runPianoRollUtilsTests();
console.log('Piano roll utility tests passed.');

runPianoRollPipelineTests();
console.log('Piano roll pipeline tests passed.');

clearTimeout(timer);
