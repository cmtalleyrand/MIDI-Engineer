# Testing Guide and Coverage Assessment

This document describes the current state of tests in `MIDI-Engineer`, assesses correctness/comprehensiveness, and proposes an actionable improvement plan for future contributors.

## Current Test Implementation

The repository currently has one automated test flow:

- `npm test` → `npm run test:fixtures`
- `test:fixtures` compiles a TypeScript fixture harness and runs `tests/run-fixture-suite.ts`.
- `run-fixture-suite.ts` executes `runFixtureSuite()` and compares themed result slices to dedicated snapshots in `tests/fixtures/*.snapshot.json` using `assert.deepStrictEqual`.
- The runner also performs focused invariant assertions (for orphan handling and default quantization policy) to produce clearer failures.

### What the fixture suite currently covers

The fixture snapshot validates behavior for:

1. Shadow quantization conflict handling and rhythm-family selection.
2. Ornament tagging for grace/mordent/turn/trill patterns.
3. Voice distribution orphan behavior in a constrained setup.
4. ABC export key override formatting.
5. Export-option defaults and MIDI/ABC quantization policy split.

## Assessment: Are the existing tests correctly implemented?

**Short answer: Mostly yes, with caveats.**

### Strengths

- The snapshot test is deterministic and easy to run in CI/local.
- It checks multiple high-risk musical transformations in a single fixture pass.
- It verifies policy-level expectations (e.g., default quantization split across export targets), which protects product intent.

### Caveats / risks in correctness

1. **Snapshot-heavy approach can still hide some root causes.**
   - Thematic snapshots improve diagnosis, but a failure can still require manual fixture analysis.
2. **Limited targeted assertion-level unit tests.**
   - Edge-case logic (threshold boundaries, tie-breaking, ambiguous ornaments) is not isolated.
3. **Snapshot update risk.**
   - Contributors could re-baseline snapshot output without validating whether behavior change is intended.
4. **No explicit negative/error-path validation.**
   - Invalid inputs and defensive handling are not exercised.

## Assessment: Are tests comprehensive?

**No, not yet.** Coverage is meaningful but narrow relative to the codebase surface.

### Coverage gap summary (high level)

- **Well covered:** selected transformation internals via fixture output.
- **Under-covered:** UI components, hooks, input parsing failures, and broader pipeline permutations.

## Recent Improvements Implemented

The fixture harness has now been hardened with two P0 actions:

- Snapshot data was split into thematic files (`shadow-quantization`, `ornaments`, `voice-orphan-behavior`, `quantization-policy`, `abc-key-overrides`) to reduce diff noise and speed up root-cause diagnosis.
- `tests/run-fixture-suite.ts` now includes focused invariant assertions (orphan count/lane size and default export quantization paths) in addition to snapshot comparisons.

## Proposed Solutions (Prioritized)

## P0 — Improve confidence without major tooling change

- ✅ Implemented: Split fixture snapshot into thematic snapshots.
- ✅ Implemented: Added explicit, focused assertions in `run-fixture-suite.ts`.
- ⏭️ Remaining: Document snapshot update protocol in PRs (require “what changed and why” notes whenever snapshot files are modified).

## P1 — Add isolated unit tests for core algorithm modules

Introduce a lightweight unit test runner (e.g., Vitest) and start with pure functions:

- `components/services/shadowQuantizer.ts`
- `components/services/midiCore.ts` (ornament detection)
- `components/services/midiVoices.ts`
- `components/services/midiPipeline.ts`
- `components/services/midiAbc.ts`

Suggested first cases:

- Boundary values around quantization thresholds.
- Ornament classification ambiguity cases.
- Voice-crossing penalties and orphan routing behavior.
- ABC key-signature custom override variants.

## P2 — Add component/hook tests for interaction correctness

Target representative workflows:

- `hooks/useMidiAppController.ts`
- `hooks/useConversionSettings.ts`
- `components/ConversionSettings.tsx`
- `components/PianoRoll.tsx`

Goals:

- Validate state transitions when settings change.
- Ensure UI controls map correctly to pipeline options.

## P3 — Add end-to-end smoke tests for core user journeys

Using Playwright (or equivalent), add a small smoke suite:

1. Upload fixture MIDI.
2. Enable/disable key settings.
3. Export MIDI/ABC.
4. Assert output artifacts exist and contain expected markers.

This catches integration issues not visible in isolated fixtures.

## Contributor Testing Workflow

### Current required checks

```bash
npm test
npm run build
```

### Recommended checks once unit test runner is added

```bash
npm run test:unit
npm run test:fixtures
npm run test:e2e
npm run build
```

## Definition of Done for Future Test Contributions

A test contribution should:

1. State what behavior/bug it protects.
2. Fail before the fix (or be impossible to represent before scaffold exists).
3. Pass after the fix.
4. Avoid broad snapshot churn unless intentionally required.
5. Include fixture rationale when musical edge cases are encoded.

## Practical next step

Start by implementing **P0** in the existing fixture harness before introducing new frameworks. This gives immediate reliability gains with minimal disruption.
