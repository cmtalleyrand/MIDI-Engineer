import * as assert from 'node:assert/strict';
import type { RawNote, RhythmRule } from '../types';
import { applyShadowQuantization } from '../components/services/shadowQuantizer';
import {
  buildQuantizationTrace,
  serializeQuantizationTrace,
} from '../components/services/quantizationTrace';

const PPQ = 480;
const primarySimple: RhythmRule = { enabled: true, family: 'Simple', minNoteValue: '1/16' };
const secondaryTriple: RhythmRule = { enabled: true, family: 'Triple', minNoteValue: '1/8t' };

function note(midi: number, ticks: number, durationTicks: number): RawNote {
  return { midi, ticks, durationTicks, velocity: 0.8, name: `N${midi}` };
}

/**
 * Confirms the §5 machine-readable trace carries the mandated payload: raw
 * onset/duration, resolved onset/duration, confidence, conflicts and candidates.
 */
export function runQuantizationTraceTests(): void {
  const input = [note(60, 118, 230), note(64, 250, 200)];
  const resolved = applyShadowQuantization(input, PPQ, primarySimple, secondaryTriple);

  // applyShadowQuantization returns RawNotes with shadowDecision; the piano-roll
  // note shape is a superset, so we can build a trace directly from them.
  const trace = buildQuantizationTrace(
    resolved.map((n) => ({
      midi: n.midi,
      ticks: n.ticks,
      durationTicks: n.durationTicks,
      velocity: n.velocity,
      name: n.name,
      shadowDecision: n.shadowDecision,
    })),
    PPQ,
    { numerator: 4, denominator: 4 }
  );

  assert.equal(trace.noteCount, 2, 'trace covers every note');
  assert.equal(trace.ppq, PPQ, 'trace records ppq');

  const first = trace.notes[0];
  assert.ok(first.raw, 'raw onset/duration present');
  assert.equal(first.raw!.onsetTicks, 118, 'raw onset is the pre-quantization value');
  assert.equal(first.raw!.durationTicks, 230, 'raw duration is the pre-quantization value');
  assert.ok(typeof first.resolved.onsetTicks === 'number', 'resolved onset present');
  assert.ok(['Certain', 'Weak_Primary', 'Ambiguous'].includes(first.confidence!), 'confidence');
  assert.ok(Array.isArray(first.candidates), 'candidate list present');

  // Serialization round-trips to valid JSON.
  const json = serializeQuantizationTrace(trace);
  const parsed = JSON.parse(json);
  assert.equal(parsed.noteCount, 2, 'serialized trace parses back');
}
