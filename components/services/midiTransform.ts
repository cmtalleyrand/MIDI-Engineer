
import { ConversionOptions, InversionMode, MelodicInversionOptions, InversionStats, RawNote } from '../../types';
import { detectAndTagOrnaments, NOTE_NAMES } from './midiCore';
import { applyShadowQuantization } from './shadowQuantizer';

export const getQuantizationTickValue = (quantizationValue: string, ppq: number): number => {
    if (quantizationValue === 'off') return 0;
    const multipliers: { [key: string]: number } = {
        '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125, '1/64': 0.0625,
        '1/2t': 2 * (2/3), '1/4t': 1 * (2/3), '1/8t': 0.5 * (2/3), '1/16t': 0.25 * (2/3), '1/32t': 0.125 * (2/3), '1/64t': 0.0625 * (2/3),
        '1/4q': 4/5, '1/8q': 2/5, '1/16q': 0.2, '1/32q': 0.1, '1/64q': 0.05,
    };
    const multiplier = multipliers[quantizationValue];
    if (!multiplier) return 0;
    return Math.round(ppq * multiplier);
};

export function pruneOverlaps(notes: any[], thresholdTicks: number): any[] {
    if (notes.length === 0) return [];
    
    const sorted = [...notes].sort((a, b) => {
        if (a.midi !== b.midi) return a.midi - b.midi;
        if (a.ticks !== b.ticks) return a.ticks - b.ticks;
        return b.durationTicks - a.durationTicks; 
    });

    const pruned: any[] = [];
    let i = 0;
    
    while (i < sorted.length) {
        let current = { ...sorted[i] };
        let j = i + 1;

        while (j < sorted.length && sorted[j].midi === current.midi) {
            const next = sorted[j];
            const currentEnd = current.ticks + current.durationTicks;
            const overlap = currentEnd > next.ticks;
            if (!overlap) break;
            if (next.ticks === current.ticks) {
                j++;
                continue;
            }
            const nextEnd = next.ticks + next.durationTicks;
            if (currentEnd > nextEnd) {
                const diff = currentEnd - nextEnd;
                if (diff <= thresholdTicks) {
                    j++;
                    continue;
                }
            }
            current.durationTicks = Math.max(0, next.ticks - current.ticks);
            break; 
        }
        if (current.durationTicks > 0) pruned.push(current as any);
        i = j;
    }
    return pruned;
}

export function quantizeNotes(notes: any[], options: ConversionOptions, ppq: number): any[] {
    let notesToProcess = [...notes.map(n => ({...n} as any))];
    
    if (options.detectOrnaments) {
        notesToProcess = detectAndTagOrnaments(notesToProcess, ppq);
    }
    
    if (options.shiftToMeasure && notesToProcess.length > 0) {
        notesToProcess.sort((a,b) => a.ticks - b.ticks);
        const firstNoteTick = notesToProcess[0].ticks;
        const ticksPerMeasure = ppq * options.timeSignature.numerator * (4 / options.timeSignature.denominator);
        const shiftAmount = -(firstNoteTick % ticksPerMeasure);
        if (Math.abs(shiftAmount) > 0) {
           notesToProcess = notesToProcess.map(note => ({ ...note, ticks: note.ticks + shiftAmount }));
        }
    }
    
    if (options.pruneOverlaps) {
        const multipliers: number[] = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
        const pruneThresholdTicks = Math.round(ppq * multipliers[options.pruneThresholdIndex]);
        notesToProcess = pruneOverlaps(notesToProcess, pruneThresholdTicks);
    }
    
    // NEW: Shadow Grid Logic
    if (options.primaryRhythm.enabled) {
        notesToProcess = applyShadowQuantization(notesToProcess, ppq, options.primaryRhythm, options.secondaryRhythm);
        
        // Ensure Min Duration if specified separately (though shadow quantizer handles grid-based min duration)
        if (options.quantizeDurationMin !== 'off') {
             const minTicks = getQuantizationTickValue(options.quantizeDurationMin, ppq);
             if (minTicks > 0) {
                 notesToProcess.forEach(n => {
                     n.durationTicks = Math.max(n.durationTicks, minTicks);
                 });
             }
        }
    } else {
        // Fallback to legacy Simple Quantization if Shadow Grid is disabled (should not happen with new UI, but safe to keep)
        const quantizationTicks = getQuantizationTickValue(options.quantizationValue, ppq);
        let minDurationTicks = 0;
        if (options.quantizeDurationMin !== 'off') {
            minDurationTicks = getQuantizationTickValue(options.quantizeDurationMin, ppq);
        } else if (quantizationTicks > 0) {
            minDurationTicks = quantizationTicks;
        }

        if (quantizationTicks > 0 || minDurationTicks > 0) {
            notesToProcess.forEach(note => {
                // ... legacy logic ...
                if (quantizationTicks > 0) {
                     note.ticks = Math.round(note.ticks / quantizationTicks) * quantizationTicks;
                     note.durationTicks = Math.round(note.durationTicks / quantizationTicks) * quantizationTicks;
                }
                if (minDurationTicks > 0) {
                    note.durationTicks = Math.max(note.durationTicks, minDurationTicks);
                }
                if (note.durationTicks === 0 && quantizationTicks > 0) note.durationTicks = quantizationTicks;
            });
        }
    }
    
    return notesToProcess;
}

export function performInversion(notes: any[], mode: InversionMode, ppq: number, timeSignature: { numerator: number; denominator: number }, totalDurationTicks: number): any[] {
    if (mode === 'off') return notes;
    if (mode === 'global') {
        return notes.map(n => ({ ...n, ticks: totalDurationTicks - (n.ticks + n.durationTicks) }));
    }
    let intervalTicks = 0;
    const ticksPerMeasure = ppq * 4 * (timeSignature.numerator / timeSignature.denominator);
    switch(mode) {
        case '1beat': intervalTicks = ppq; break;
        case '2beats': intervalTicks = ppq * 2; break;
        case 'measure': intervalTicks = ticksPerMeasure; break;
        case '2measures': intervalTicks = ticksPerMeasure * 2; break;
        case '4measures': intervalTicks = ticksPerMeasure * 4; break;
        case '8measures': intervalTicks = ticksPerMeasure * 8; break;
        default: return notes;
    }
    if (intervalTicks <= 0) return notes;
    return notes.map(note => {
        const segmentIndex = Math.floor(note.ticks / intervalTicks);
        const windowStart = segmentIndex * intervalTicks;
        const windowEnd = (segmentIndex + 1) * intervalTicks;
        const newTicks = windowStart + (windowEnd - (note.ticks + note.durationTicks));
        return { ...note, ticks: newTicks };
    });
}

// Helper to determine range ticks
function getRangeTicks(startMeasure: number, endMeasure: number, ppq: number, timeSignature: { numerator: number; denominator: number }) {
    const ticksPerMeasure = ppq * 4 * (timeSignature.numerator / timeSignature.denominator);
    const startTick = (startMeasure - 1) * ticksPerMeasure;
    const endTick = endMeasure * ticksPerMeasure;
    return { startTick, endTick };
}

// Calculates statistics for UI Feedback
export function calculateInversionStats(notes: any[], options: MelodicInversionOptions, ppq: number, timeSignature: { numerator: number; denominator: number }): InversionStats | null {
    if (!notes || notes.length === 0) return null;
    
    const { startTick, endTick } = getRangeTicks(options.startMeasure, options.endMeasure, ppq, timeSignature);
    const notesInRange = notes.filter(n => n.ticks >= startTick && n.ticks < endTick);
    
    if (notesInRange.length === 0) {
        return { totalNotes: 0, anchorNoteName: 'None', hasPolyphony: false, rangeStartTick: startTick, rangeEndTick: endTick };
    }

    // Sort to find first note
    notesInRange.sort((a, b) => {
        if (a.ticks !== b.ticks) return a.ticks - b.ticks;
        return a.midi - b.midi; // Lowest note first if simultaneous
    });

    const anchorNote = notesInRange[0];
    
    // Check polyphony: Do any two notes overlap?
    let hasPolyphony = false;
    for(let i=0; i<notesInRange.length-1; i++) {
        // Simple check: does start of next note come before end of current note?
        // Note: For true polyphony we might check only if they start at same time or strictly overlap
        // "If the line is monophonic" implies single voice.
        if (notesInRange[i].ticks + notesInRange[i].durationTicks > notesInRange[i+1].ticks) {
            hasPolyphony = true;
            break;
        }
    }

    const noteName = `${NOTE_NAMES[anchorNote.midi % 12]}${Math.floor(anchorNote.midi / 12) - 1}`;

    return {
        totalNotes: notesInRange.length,
        anchorNoteName: noteName,
        hasPolyphony,
        rangeStartTick: startTick,
        rangeEndTick: endTick
    };
}

export function performMelodicInversion(notes: any[], options: MelodicInversionOptions, ppq: number, timeSignature: { numerator: number; denominator: number }): any[] {
    if (!options.enabled) return notes;
    
    const { startTick, endTick } = getRangeTicks(options.startMeasure, options.endMeasure, ppq, timeSignature);
    
    // Identify notes in range
    const notesInRange = notes.filter(n => n.ticks >= startTick && n.ticks < endTick);
    if (notesInRange.length === 0) return notes;

    // Determine Anchor: First note chronologically. If chord, lowest pitch.
    const sortedForAnchor = [...notesInRange].sort((a, b) => {
        if (a.ticks !== b.ticks) return a.ticks - b.ticks;
        return a.midi - b.midi; 
    });
    const anchorPitch = sortedForAnchor[0].midi;

    // Apply Inversion: New = Anchor - (Old - Anchor) = 2*Anchor - Old
    return notes.map(note => {
        if (note.ticks >= startTick && note.ticks < endTick) {
            const interval = note.midi - anchorPitch;
            let newMidi = anchorPitch - interval;
            // Clamp to valid MIDI range
            newMidi = Math.max(0, Math.min(127, newMidi));
            return { ...note, midi: newMidi };
        }
        return note;
    });
}

export function performModalConversion(notes: any[], options: ConversionOptions): any[] {
    if (!options.modalConversion.enabled) return notes;
    const { root, mappings } = options.modalConversion;
    return notes.map(note => {
        const pitchClass = note.midi % 12;
        const sourceInterval = (pitchClass - root + 12) % 12;
        const targetInterval = mappings[sourceInterval];
        if (targetInterval === undefined) return note;
        let newMidi = note.midi - sourceInterval + targetInterval;
        newMidi = Math.max(0, Math.min(127, newMidi));
        return { ...note, midi: newMidi };
    });
}

export function cropToRange(notes: any[], options: ConversionOptions, ppq: number): any[] {
    if (!options.exportRange.enabled) return notes;
    
    const { startMeasure, endMeasure } = options.exportRange;
    const ticksPerMeasure = ppq * 4 * (options.timeSignature.numerator / options.timeSignature.denominator);
    
    const startTick = (startMeasure - 1) * ticksPerMeasure;
    const endTick = endMeasure * ticksPerMeasure;

    // Filter notes
    let cropped = notes.filter(n => {
        const noteEnd = n.ticks + n.durationTicks;
        // Keep note if it overlaps the range
        return noteEnd > startTick && n.ticks < endTick;
    });

    // Shift notes to start at 0
    cropped = cropped.map(n => {
        let newTick = n.ticks - startTick;
        return { ...n, ticks: newTick };
    });

    return cropped;
}

export function getTransformedNotes(notes: any[], options: ConversionOptions, ppq: number): any[] {
    // 1. Filter Short (Unscaled)
    // Filter first so we don't process noise. Note: RemoveShortNotesThreshold is in original PPQ ticks.
    let processed = notes.map(n => ({...n}));
    if (options.removeShortNotesThreshold > 0) {
        processed = processed.filter(n => n.durationTicks >= options.removeShortNotesThreshold);
    }

    // 2. Quantize (Unscaled)
    // Align input to the grid BEFORE stretching. This prevents duration/onset mismatch during scaling.
    processed = quantizeNotes(processed, options, ppq);

    // 3. Scale (Apply Time Stretch)
    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }
    
    if (timeScale !== 1) {
        processed = processed.map(n => ({
            ...n,
            ticks: Math.round(n.ticks * timeScale),
            durationTicks: Math.round(n.durationTicks * timeScale)
        }));
    }
    
    // 4. Inversion (Retrograde)
    // Depends on total length, so must happen after scaling.
    const maxTick = processed.length > 0 ? Math.max(...processed.map(n => n.ticks + n.durationTicks)) : 0;
    processed = performInversion(processed, options.inversionMode, ppq, options.timeSignature, maxTick);

    // 5. Melodic Inversion (New)
    processed = performMelodicInversion(processed, options.melodicInversion, ppq, options.timeSignature);

    // 6. Modal Conversion
    processed = performModalConversion(processed, options);

    // 7. Range Cropping
    processed = cropToRange(processed, options, ppq);

    return processed;
}
