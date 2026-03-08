
import { ScaleNoteMap } from './musicTheory';

// Fallback for chromatic notes
export const CHROMATIC_SPELLING_SHARP: Record<number, string> = {
    0: 'C', 1: '^C', 2: 'D', 3: '^D', 4: 'E', 5: 'F', 6: '^F', 7: 'G', 8: '^G', 9: 'A', 10: '^A', 11: 'B'
};

export const CHROMATIC_SPELLING_FLAT: Record<number, string> = {
    0: 'C', 1: '_D', 2: 'D', 3: '_E', 4: 'E', 5: 'F', 6: '_G', 7: 'G', 8: '_A', 9: 'A', 10: '_B', 11: 'B'
};

export function getAbcPitch(midi: number, scaleMap: Record<number, ScaleNoteMap>, preferFlats: boolean): string {
    const pc = midi % 12;
    const baseOctave = Math.floor(midi / 12) - 1; 
    
    let letter = '';
    let accPrefix = ''; 
    let octaveOffset = 0;

    if (scaleMap[pc]) {
        letter = scaleMap[pc].letter;
        octaveOffset = scaleMap[pc].octaveOffset;
    } else {
        // Chromatic Fallback
        const spelling = preferFlats ? CHROMATIC_SPELLING_FLAT[pc] : CHROMATIC_SPELLING_SHARP[pc];
        letter = spelling.charAt(spelling.length - 1);
        const accChar = spelling.length > 1 ? spelling.charAt(0) : '';
        
        if (accChar === '^') accPrefix = '^';
        else if (accChar === '_') accPrefix = '_';
        else if (accChar === '') accPrefix = '=';
        
        octaveOffset = 0; 
    }

    const finalOctave = baseOctave + octaveOffset;
    let pitchChar = letter;
    if (finalOctave >= 5) {
        pitchChar = pitchChar.toLowerCase();
        if (finalOctave > 5) pitchChar += "'".repeat(finalOctave - 5);
    } else {
        if (finalOctave < 4) pitchChar += ",".repeat(4 - finalOctave);
    }

    return accPrefix + pitchChar;
}

export function formatFraction(num: number, den: number): string {
    if (num === 0 || num === den) return '';
    const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
    const common = gcd(num, den);
    const n = num / common; const d = den / common;
    if (d === 1) return n.toString();
    if (n === 1) return `/${d}`;
    return `${n}/${d}`;
}

export interface AbcNoteInfo {
    midi: number;
    tied: boolean;
}

export interface AbcEvent {
    type: 'note' | 'rest';
    ticks: number;
    durationTicks: number;
    notes?: AbcNoteInfo[];
}

export function flattenPolyphonyToChords(notes: any[]): AbcEvent[] {
    if (notes.length === 0) return [];
    const boundaries = new Set<number>();
    // Ensure the timeline always starts at 0 to capture initial rests
    boundaries.add(0); 
    
    notes.forEach(n => {
        boundaries.add(n.ticks);
        boundaries.add(n.ticks + n.durationTicks);
    });
    const sortedPoints = Array.from(boundaries).sort((a,b) => a-b);
    const events: AbcEvent[] = [];
    
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i+1];
        const duration = end - start;
        if (duration <= 0) continue; 

        const activeNotes = notes.filter(n => n.ticks <= start && (n.ticks + n.durationTicks) > start);
        
        if (activeNotes.length === 0) {
            events.push({ type: 'rest', ticks: start, durationTicks: duration });
        } else {
            const dedupedByMidi = new Map<number, boolean>();
            activeNotes.forEach((n) => {
                const isTied = (n.ticks + n.durationTicks) > end;
                dedupedByMidi.set(n.midi, Boolean(dedupedByMidi.get(n.midi)) || isTied);
            });

            const noteData: AbcNoteInfo[] = Array.from(dedupedByMidi.entries()).map(([midi, tied]) => ({ midi, tied }));
            noteData.sort((a,b) => a.midi - b.midi);
            events.push({ type: 'note', ticks: start, durationTicks: duration, notes: noteData });
        }
    }
    return events;
}

export function segmentEventsByMeasure(events: AbcEvent[], ticksPerMeasure: number): Map<number, AbcEvent[]> {
    const measureMap = new Map<number, AbcEvent[]>();
    for (const event of events) {
        let currentTick = event.ticks;
        let remainingDuration = event.durationTicks;
        while (remainingDuration > 0) {
            const measureIndex = Math.floor(currentTick / ticksPerMeasure);
            const measureStart = measureIndex * ticksPerMeasure;
            const measureEnd = (measureIndex + 1) * ticksPerMeasure;
            const eventEndInMeasure = Math.min(currentTick + remainingDuration, measureEnd);
            const durationInMeasure = eventEndInMeasure - currentTick;
            
            if (!measureMap.has(measureIndex)) measureMap.set(measureIndex, []);
            const isSplitAtMeasure = (currentTick + remainingDuration) > measureEnd;
            const notes = event.notes ? event.notes.map(n => ({
                midi: n.midi,
                tied: n.tied || isSplitAtMeasure 
            })) : undefined;

            measureMap.get(measureIndex)!.push({
                type: event.type,
                ticks: currentTick - measureStart,
                durationTicks: durationInMeasure,
                notes: notes
            });
            currentTick += durationInMeasure;
            remainingDuration -= durationInMeasure;
        }
    }
    return measureMap;
}

const CANDIDATE_L_RATIOS = [
    { num: 1, den: 1 }, { num: 1, den: 2 }, { num: 1, den: 3 }, { num: 1, den: 4 },
    { num: 1, den: 6 }, { num: 1, den: 8 }, { num: 1, den: 12 }, { num: 1, den: 16 }, { num: 1, den: 24 },
];

export function determineBestLUnit(notes: any[], ppq: number): { str: string, ticks: number } {
    const counts = new Map<number, number>();
    notes.forEach(n => counts.set(n.durationTicks, (counts.get(n.durationTicks) || 0) + 1));
    let dominantTicks = 0; let maxCount = 0;
    counts.forEach((c, t) => { if (c > maxCount) { maxCount = c; dominantTicks = t; } });
    const whole = ppq * 4;
    let bestL = CANDIDATE_L_RATIOS[5];
    let bestScore = -Infinity;
    for (const ratio of CANDIDATE_L_RATIOS) {
        const lTicks = Math.round(whole * (ratio.num / ratio.den));
        if (lTicks <= 0) continue;
        let score = 0;
        if (dominantTicks % lTicks === 0) {
            const mult = dominantTicks / lTicks;
            if (mult === 1) score += 3000; else if (mult === 2) score += 1500; else if (mult === 4) score += 800; else score -= mult * 20;
        } else { score -= 2000; }
        let fractionCount = 0;
        notes.forEach(n => { if (n.durationTicks % lTicks !== 0) fractionCount++; });
        score -= (fractionCount / notes.length * 1500);
        if (ratio.den === 4 || ratio.den === 8) score += 50;
        if (score > bestScore) { bestScore = score; bestL = ratio; }
    }
    return { str: bestL.num === 1 ? `1/${bestL.den}` : `${bestL.num}/${bestL.den}`, ticks: Math.round(whole * (bestL.num / bestL.den)) };
}
