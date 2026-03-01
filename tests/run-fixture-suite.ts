import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { runFixtureSuite } from './fixture-suite.test';
import { runPianoRollUtilsTests } from './piano-roll-utils.test';
import { runPianoRollPipelineTests } from './piano-roll-pipeline.test';

const TIMEOUT_MS = 30_000;
const timer = setTimeout(() => {
    console.error(`FAIL: Tests timed out after ${TIMEOUT_MS / 1000}s — likely an infinite loop in a service function.`);
    console.error(`Last started: ${currentTest}`);
    process.exit(1);
}, TIMEOUT_MS);

let currentTest = '(none)';
let passed = 0;
let failed = 0;
const failures: string[] = [];

function run(name: string, fn: () => void): void {
    currentTest = name;
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (err: any) {
        failed++;
        const msg = err?.message ?? String(err);
        failures.push(`${name}: ${msg}`);
        console.error(`  FAIL: ${name}`);
        console.error(`        ${msg.split('\n')[0]}`);
    }
}

console.log('Running tests...\n');

run('Fixture suite snapshot', () => {
    const snapshotPath = path.join(process.cwd(), 'tests', 'fixtures', 'fixture-suite.snapshot.json');
    const actual = runFixtureSuite();
    const expected = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    assert.deepStrictEqual(actual, expected);
});

run('Piano roll utilities', () => {
    runPianoRollUtilsTests();
});

run('Piano roll pipeline', () => {
    runPianoRollPipelineTests();
});

clearTimeout(timer);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failures.length > 0) {
    console.error('\nFailures:');
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
}
