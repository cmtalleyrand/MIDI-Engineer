import { PianoRollNote } from '../../types';

/**
 * Machine-readable per-note quantization trace (PROJECT_INTENT §5).
 *
 * Each entry contains the minimum trace payload the spec mandates: raw
 * onset/duration, the candidate list, the selected candidate, the confidence
 * class, the conflict checks applied, and the final resolution rationale
 * (objective breakdown).
 */
export interface NoteTraceEntry {
  midi: number;
  name: string;
  voiceIndex?: number;
  isOrnament?: boolean;
  raw: { onsetTicks: number; durationTicks: number } | null;
  resolved: { onsetTicks: number; durationTicks: number };
  confidence?: string;
  selectedFamily?: string;
  selectedNoteValue?: string;
  conflictTypes?: string[];
  accommodationApplied?: unknown;
  objectiveBreakdown?: unknown;
  candidates?: unknown[];
}

export interface QuantizationTrace {
  generatedAt: string;
  ppq: number;
  timeSignature: { numerator: number; denominator: number };
  noteCount: number;
  notes: NoteTraceEntry[];
}

/** Build a structured trace from rendered piano-roll notes. */
export function buildQuantizationTrace(
  notes: PianoRollNote[],
  ppq: number,
  timeSignature: { numerator: number; denominator: number }
): QuantizationTrace {
  return {
    generatedAt: new Date().toISOString(),
    ppq,
    timeSignature,
    noteCount: notes.length,
    notes: notes.map((n) => {
      const d = n.shadowDecision;
      return {
        midi: n.midi,
        name: n.name,
        voiceIndex: n.voiceIndex,
        isOrnament: n.isOrnament,
        raw: d ? { onsetTicks: d.rawOnsetTicks, durationTicks: d.rawDurationTicks } : null,
        resolved: { onsetTicks: n.ticks, durationTicks: n.durationTicks },
        confidence: d?.confidence,
        selectedFamily: d?.selectedFamily,
        selectedNoteValue: d?.selectedNoteValue,
        conflictTypes: d?.conflictTypes,
        accommodationApplied: d?.accommodationApplied,
        objectiveBreakdown: d?.objectiveBreakdown,
        candidates: d?.alternatives,
      };
    }),
  };
}

/** Serialize a trace to a pretty-printed JSON string. */
export function serializeQuantizationTrace(trace: QuantizationTrace): string {
  return JSON.stringify(trace, null, 2);
}
