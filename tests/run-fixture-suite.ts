import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { runFixtureSuite } from './fixture-suite.test';

const snapshotPath = path.join(process.cwd(), 'tests', 'fixtures', 'fixture-suite.snapshot.json');

const actual = runFixtureSuite();
const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
assert.deepStrictEqual(actual, expected);
console.log('Fixture suite snapshot validation passed.');
