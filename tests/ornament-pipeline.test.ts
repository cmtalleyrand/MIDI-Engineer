import * as assert from 'node:assert/strict';
import type { RawNote } from '../types';
import { detectAndTagOrnaments } from '../components/services/midiCore';

const PPQ = 480;

function note(midi: number, ticks: number, durationTicks: number): RawNote {
  return { midi, ticks, durationTicks, velocity: 0.8, name: `N${midi}` };
}

/**
 * Confirms that the active rhythm family's MNV ticks flow into ornament
 * detection (PROJECT_INTENT §3.1.1), so graceMaxDurTicks = min(Tq/8,
 * 0.5*familyMNV) tracks the chosen grid rather than a fixed default.
 */
export function runOrnamentPipelineTests(): void {
  // A 50-tick grace note before its principal.
  const makeInput = (): RawNote[] => [note(61, 0, 50), note(60, 50, 240)];

  // Default family MNV (Tq/4 = 120): graceMax = min(60, 60) = 60 → 50 qualifies.
  {
    const tagged = detectAndTagOrnaments(makeInput(), PPQ);
    const grace = tagged.find((n) => n.midi === 61) as RawNote & { isOrnament?: boolean };
    assert.equal(grace.isOrnament, true, 'grace qualifies under default family MNV');
  }

  // Fine family MNV (1/32 = 60): graceMax = min(60, 30) = 30 → 50 no longer qualifies.
  {
    const familyMNV = 60;
    const tagged = detectAndTagOrnaments(makeInput(), PPQ, {}, familyMNV);
    const grace = tagged.find((n) => n.midi === 61) as RawNote & { isOrnament?: boolean };
    assert.equal(
      grace.isOrnament,
      undefined,
      'grace no longer qualifies once the family MNV tightens the grace threshold'
    );
  }
}
