import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { runFixtureSuite } from './fixture-suite.test';
import { runPianoRollUtilsTests } from './piano-roll-utils.test';
import { runPianoRollPipelineTests } from './piano-roll-pipeline.test';

const snapshotPath = path.join(process.cwd(), 'tests', 'fixtures', 'fixture-suite.snapshot.json');

const actual = runFixtureSuite();
const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
assert.deepStrictEqual(actual, expected);
runPianoRollUtilsTests();
runPianoRollPipelineTests();
console.log('Fixture suite snapshot validation passed.');
console.log('Piano roll utility tests passed.');
console.log('Piano roll pipeline tests passed.');
