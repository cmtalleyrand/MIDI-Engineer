
import { Midi } from '@tonejs/midi';
import { TrackInfo, MidiEventCounts } from '../../types';

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

export function detectAndTagOrnaments(notes: any[], ppq: number): any[] {
    const sorted = [...notes].sort((a, b) => a.ticks - b.ticks);
    const taggedNotes: any[] = [];
    
    const EIGHTH_TICKS = ppq / 2;
    const TRIPLET_EIGHTH_TICKS = (ppq * 2) / 3 / 2;
    const MAX_GAP = ppq / 16; 

    let i = 0;
    while (i < sorted.length) {
        const chain: any[] = [];
        let j = i;
        
        while (j < sorted.length) {
            const n = sorted[j];
            // Basic candidate check: Must be shorter than 8th note triplet to be part of rapid ornament
            if (n.durationTicks < TRIPLET_EIGHTH_TICKS) {
                if (chain.length > 0) {
                    const prev = chain[chain.length - 1];
                    if (n.ticks - (prev.ticks + prev.durationTicks) > MAX_GAP) break; 
                }
                chain.push(n);
                j++;
            } else {
                break;
            }
        }
        
        if (chain.length > 0 && j < sorted.length) {
            const principal = sorted[j];
            const lastOrnament = chain[chain.length - 1];
            
            if (principal.ticks - (lastOrnament.ticks + lastOrnament.durationTicks) <= MAX_GAP) {
                let isOrnamentGroup = false;
                const P = principal.midi;

                // 1. TRILL (Alternating neighbors, count > 3)
                if (chain.length >= 3) {
                    let alternating = true;
                    const neighborPitch = chain[0].midi;
                    if (Math.abs(neighborPitch - P) <= 2 && neighborPitch !== P) {
                         for (let k = 0; k < chain.length; k++) {
                             const target = (k % 2 === 0) ? neighborPitch : P;
                             if (chain[k].midi !== target) {
                                 alternating = false;
                                 break;
                             }
                         }
                         if (alternating) isOrnamentGroup = true;
                    }
                }

                // 2. TURN (4 notes)
                if (!isOrnamentGroup && chain.length === 3) {
                    const [n1, n2, n3] = chain;
                    const isStandard = (n1.midi > P && n2.midi === P && n3.midi < P);
                    const isInverted = (n1.midi < P && n2.midi === P && n3.midi > P);
                    if ((isStandard || isInverted) && Math.abs(n1.midi - P) <= 2 && Math.abs(n3.midi - P) <= 2) {
                        isOrnamentGroup = true;
                    }
                }

                // 3. MORDENT (2 notes + Principal = 3 total)
                if (!isOrnamentGroup && chain.length === 2) {
                    const [n1, n2] = chain;
                    if (n1.midi === P && Math.abs(n2.midi - P) <= 2 && n2.midi !== P) {
                        isOrnamentGroup = true;
                    }
                }

                // 4. GRACE NOTE (1 note)
                if (!isOrnamentGroup && chain.length === 1) {
                    const n1 = chain[0];
                    if (Math.abs(n1.midi - P) <= 2 && n1.durationTicks <= principal.durationTicks / 4) {
                        isOrnamentGroup = true;
                    }
                }
                
                if (isOrnamentGroup) {
                     const groupHeadTick = chain[0].ticks;
                     chain.forEach(n => {
                         (n as any).isOrnament = true;
                         (n as any)._principalMidi = P;
                         (n as any)._principalTick = principal.ticks;
                     });
                     (principal as any)._hasOrnaments = true;
                     taggedNotes.push(...chain);
                     taggedNotes.push(principal);
                     i = j + 1;
                     continue;
                }
            }
        }
        
        taggedNotes.push(sorted[i]);
        i++;
    }
    
    return taggedNotes.sort((a,b) => a.ticks - b.ticks);
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
