import * as assert from 'node:assert/strict';
import type { RawNote, RhythmRule } from '../types';
import { applyShadowQuantization } from '../components/services/shadowQuantizer';

const PPQ = 480;
const primarySimple: RhythmRule = { enabled: true, family: 'Simple', minNoteValue: '1/16' };
const secondaryTriple: RhythmRule = { enabled: true, family: 'Triple', minNoteValue: '1/8t' };

function note(midi: number, ticks: number, durationTicks: number): RawNote {
  return { midi, ticks, durationTicks, velocity: 0.8, name: `N${midi}` };
}

/**
 * These tests pin the Pass 2 contextual conflict solver (PROJECT_INTENT §2.5)
 * behavior independently of the broad fixture snapshot, so regressions surface
 * with a precise message.
 */
export function runShadowPass2Tests(): void {
  // Pass 2 never deletes notes (§2.5.2 principle #1: keep every note).
  {
    const input = [note(60, 0, 360), note(60, 240, 360), note(64, 250, 40), note(67, 470, 500)];
    const out = applyShadowQuantization(input, PPQ, primarySimple, secondaryTriple);
    assert.equal(out.length, input.length, 'Pass 2 preserves note count');
  }

  // Every note carries a shadowDecision trace with the spec-mandated fields.
  {
    const out = applyShadowQuantization([note(60, 130, 250)], PPQ, primarySimple, secondaryTriple);
    const d = out[0].shadowDecision;
    assert.ok(d, 'note has a shadowDecision');
    assert.ok(['Certain', 'Weak_Primary', 'Ambiguous'].includes(d!.confidence), 'confidence class');
    assert.ok(typeof d!.selectedOnsetTicks === 'number', 'selected onset present');
    assert.ok(typeof d!.selectedDurationTicks === 'number', 'selected duration present');
    assert.ok(Array.isArray(d!.alternatives), 'alternatives present');
    assert.ok(typeof d!.objectiveBreakdown.total === 'number', 'objective total present');
  }

  // Type 1: overlapping unison notes are flagged and accommodated (shortened),
  // never truncated below the family MNV (1/16 = 120 ticks here).
  {
    const out = applyShadowQuantization(
      [note(60, 0, 360), note(60, 240, 360)],
      PPQ,
      primarySimple,
      secondaryTriple
    );
    const MNV = 120;
    out.forEach((n) => assert.ok(n.durationTicks >= MNV, 'duration never below family MNV'));
    const flaggedOrAccommodated = out.some(
      (n) =>
        (n.shadowDecision?.conflictTypes ?? []).includes('type1_unison_overlap') ||
        n.shadowDecision?.accommodationApplied
    );
    assert.ok(flaggedOrAccommodated, 'unison overlap is detected/accommodated');
  }

  // Onsets are snapped onto the grid (within a tolerance), satisfying §2.3
  // (quantize onsets, not only durations).
  {
    const out = applyShadowQuantization([note(60, 118, 230)], PPQ, primarySimple, secondaryTriple);
    // 118 is ~1/16 grid (120); resolved onset should land on a grid multiple.
    const onset = out[0].ticks;
    const nearestGridDelta = Math.min(
      onset % 120,
      120 - (onset % 120),
      onset % 160,
      160 - (onset % 160)
    );
    assert.ok(nearestGridDelta <= 1, `onset ${onset} snapped to a grid point`);
  }

  // Disabled primary rhythm is a no-op (timing preserved).
  {
    const input = [note(60, 117, 233)];
    const out = applyShadowQuantization(
      input,
      PPQ,
      { ...primarySimple, enabled: false },
      {
        ...secondaryTriple,
        enabled: false,
      }
    );
    assert.equal(out[0].ticks, 117, 'disabled quantization preserves onset');
    assert.equal(out[0].durationTicks, 233, 'disabled quantization preserves duration');
  }
}
