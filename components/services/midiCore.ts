import { Midi } from '@tonejs/midi';
import { TrackInfo, MidiEventCounts } from '../../types';
import {
  detectOrnamentHypotheses,
  getDefaultOrnamentDetectionParams,
  OrnamentDetectionParams,
  OrnamentAnnotatedNote,
  selectOrnamentHypotheses,
} from './ornamentDetector';

/**
 * Analyzes a parsed MIDI object to count different types of events.
 */
export function analyzeMidiEvents(midi: Midi): MidiEventCounts {
  const counts: MidiEventCounts = {
    pitchBend: 0,
    controlChange: 0,
    programChange: 0,
  };

  midi.tracks.forEach((track) => {
    counts.pitchBend += (track.pitchBends || []).length;
    // programChanges exists at runtime but is absent from the @tonejs/midi Track
    // typings, so read it through a narrow typed view.
    const trackWithPC = track as unknown as { programChanges?: unknown[] };
    counts.programChange += (trackWithPC.programChanges || []).length;
    counts.controlChange += Object.values(track.controlChanges || {}).flat().length;
  });

  return counts;
}

// Minimal note shape detectAndTagOrnaments needs from callers.
type TaggableNote = { ticks: number; midi: number; durationTicks: number; id?: string };

export function detectAndTagOrnaments<T extends TaggableNote>(
  notes: T[],
  ppq: number,
  overrides: Partial<OrnamentDetectionParams> = {},
  familyMNVticks?: number
): T[] {
  const sorted = [...notes].sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
  const params: OrnamentDetectionParams = {
    ...getDefaultOrnamentDetectionParams(ppq, familyMNVticks),
    ...overrides,
  };
  const hypotheses = detectOrnamentHypotheses(sorted as OrnamentAnnotatedNote[], params);
  const selected = selectOrnamentHypotheses(hypotheses);

  // The ornament tags are written through this annotated view (the dynamic
  // `_`-fields live in RawNote-adjacent objects without an index signature).
  const noteById = new Map<string, OrnamentAnnotatedNote>();
  sorted.forEach((n, index) => {
    const annotated = n as unknown as OrnamentAnnotatedNote;
    const id = annotated.id ?? `n_${n.ticks}_${n.midi}_${index}`;
    annotated.id = id;
    noteById.set(id, annotated);
  });

  selected.forEach((h) => {
    const principal = noteById.get(h.principalNoteRef);
    if (!principal) return;
    principal._hasOrnaments = true;
    principal._ornamentClass = h.class;
    principal._ornamentHypotheses = hypotheses.filter(
      (c) => c.principalNoteRef === h.principalNoteRef
    );

    h.memberNoteIds.forEach((id) => {
      const note = noteById.get(id);
      if (!note) return;
      note.isOrnament = true;
      note._principalMidi = principal.midi;
      note._principalTick = principal.ticks;
      note._ornamentClass = h.class;
      note._ornamentTimingBounds = h.timingBounds;
      note._ornamentConfidence = h.confidence;
      note._ornamentAmbiguityTags = h.ambiguityTags;
      note._ornamentHypotheses = hypotheses.filter((c) => c.memberNoteIds.includes(id));
    });
  });

  return sorted;
}

// NOTE(ornament-pipeline): detectAndTagOrnaments runs in two places — during
// file parse (for the ornamentCount shown on TrackInfo) and pre-quantization
// inside quantizeNotes (midiTransform.ts) when ConversionOptions.detectOrnaments
// is on. The export path passes the active primary-rhythm family MNV ticks so
// graceMaxDurTicks is bounded per spec §3.1.1.
//
// Still outstanding (PROJECT_INTENT §2.4 / §3.2 / §3.3): the shadow quantizer
// does not yet *consume* the ornament tags to let sub-MNV ornament notes bypass
// MNV structurally, evaluate the On-Beat vs Pre-Beat hypothesis, or render ABC
// grace notes. Those are larger follow-ons tracked separately.
export async function parseMidiFromFile(
  file: File
): Promise<{ midi: Midi; tracks: TrackInfo[]; eventCounts: MidiEventCounts }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Filter out empty tracks to prevent "Ghost" tracks (Format 1 Conductor tracks)
  // But keep at least one track if all are empty
  let nonBlankTracks = midi.tracks
    .map((t, i) => ({ t, i }))
    .filter((item) => item.t.notes.length > 0);

  if (nonBlankTracks.length === 0) {
    nonBlankTracks = midi.tracks.map((t, i) => ({ t, i }));
  }

  const tracks: TrackInfo[] = nonBlankTracks.map(({ t: track, i: index }) => {
    const notesCopy = track.notes.map((n) => ({
      midi: n.midi,
      ticks: n.ticks,
      durationTicks: n.durationTicks,
    }));
    const taggedNotes = detectAndTagOrnaments(notesCopy, midi.header.ppq);
    const ornamentCount = taggedNotes.filter(
      (n) => (n as { isOrnament?: boolean }).isOrnament
    ).length;

    return {
      id: index, // Keep original index for referencing
      name: track.name || `Track ${index + 1}`,
      instrument: {
        name: track.instrument.name,
        number: track.instrument.number,
        family: track.instrument.family,
      },
      noteCount: (track.notes || []).length,
      ornamentCount: ornamentCount,
    };
  });

  const eventCounts = analyzeMidiEvents(midi);
  return { midi, tracks, eventCounts };
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
