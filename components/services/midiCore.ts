
import { Midi } from '@tonejs/midi';
import { TrackInfo, MidiEventCounts } from '../../types';
import { detectOrnamentHypotheses, getDefaultOrnamentDetectionParams, OrnamentDetectionParams, selectOrnamentHypotheses } from './ornamentDetector';

/**
 * Analyzes a parsed MIDI object to count different types of events.
 */
export function analyzeMidiEvents(midi: Midi): MidiEventCounts {
    const counts: MidiEventCounts = {
        pitchBend: 0,
        controlChange: 0,
        programChange: 0,
    };

    midi.tracks.forEach(track => {
        counts.pitchBend += (track.pitchBends || []).length;
        // FIX: Cast track to any to access potentially hidden programChanges property
        counts.programChange += ((track as any).programChanges || []).length;
        counts.controlChange += Object.values(track.controlChanges || {}).flat().length;
    });

    return counts;
}

export function detectAndTagOrnaments(notes: any[], ppq: number, overrides: Partial<OrnamentDetectionParams> = {}): any[] {
    const sorted = [...notes].sort((a, b) => (a.ticks - b.ticks) || (a.midi - b.midi));
    const params: OrnamentDetectionParams = { ...getDefaultOrnamentDetectionParams(ppq), ...overrides };
    const hypotheses = detectOrnamentHypotheses(sorted, params);
    const selected = selectOrnamentHypotheses(hypotheses);

    const noteById = new Map<string, any>();
    sorted.forEach((n, index) => {
        const id = n.id ?? `n_${n.ticks}_${n.midi}_${index}`;
        n.id = id;
        noteById.set(id, n);
    });

    selected.forEach(h => {
        const principal = noteById.get(h.principalNoteRef);
        if (!principal) return;
        principal._hasOrnaments = true;
        principal._ornamentClass = h.class;
        principal._ornamentHypotheses = hypotheses.filter(c => c.principalNoteRef === h.principalNoteRef);

        h.memberNoteIds.forEach(id => {
            const note = noteById.get(id);
            if (!note) return;
            note.isOrnament = true;
            note._principalMidi = principal.midi;
            note._principalTick = principal.ticks;
            note._ornamentClass = h.class;
            note._ornamentTimingBounds = h.timingBounds;
            note._ornamentConfidence = h.confidence;
            note._ornamentAmbiguityTags = h.ambiguityTags;
            note._ornamentHypotheses = hypotheses.filter(c => c.memberNoteIds.includes(id));
        });
    });

    return sorted;
}

export async function parseMidiFromFile(file: File): Promise<{ midi: Midi; tracks: TrackInfo[]; eventCounts: MidiEventCounts }> {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  // Filter out empty tracks to prevent "Ghost" tracks (Format 1 Conductor tracks)
  // But keep at least one track if all are empty
  let nonBlankTracks = midi.tracks.map((t, i) => ({ t, i })).filter(item => item.t.notes.length > 0);
  
  if (nonBlankTracks.length === 0) {
      nonBlankTracks = midi.tracks.map((t, i) => ({ t, i }));
  }

  const tracks: TrackInfo[] = nonBlankTracks.map(({ t: track, i: index }) => {
    // FIX: Using any for notes as Note is not exported
    const notesCopy = track.notes.map(n => ({...n} as any));
    const taggedNotes = detectAndTagOrnaments(notesCopy, midi.header.ppq);
    const ornamentCount = taggedNotes.filter(n => (n as any).isOrnament).length;

    return {
        id: index, // Keep original index for referencing
        name: track.name || `Track ${index + 1}`,
        instrument: {
        name: track.instrument.name,
        number: track.instrument.number,
        family: track.instrument.family,
        },
        noteCount: (track.notes || []).length,
        ornamentCount: ornamentCount
    };
  });
  
  const eventCounts = analyzeMidiEvents(midi);
  return { midi, tracks, eventCounts };
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
