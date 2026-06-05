import { ChordMatch, ChordEvent, RawNote } from '../../types';
import { NOTE_NAMES } from './midiCore';

export const CHORD_SHAPES = [
    { name: '13', intervals: [0, 4, 7, 10, 2, 5, 9], optional5th: true },
    { name: '11', intervals: [0, 4, 7, 10, 2, 5], optional5th: true },
    { name: 'Maj9', intervals: [0, 4, 7, 11, 2], optional5th: true },
    { name: 'm9', intervals: [0, 3, 7, 10, 2], optional5th: true },
    { name: '9', intervals: [0, 4, 7, 10, 2], optional5th: true },
    { name: 'add9', intervals: [0, 4, 7, 2], optional5th: true },
    { name: 'Maj7', intervals: [0, 4, 7, 11], optional5th: true },
    { name: 'm7', intervals: [0, 3, 7, 10], optional5th: true },
    { name: '7', intervals: [0, 4, 7, 10], optional5th: true },
    { name: '6', intervals: [0, 4, 7, 9], optional5th: true },
    { name: 'm6', intervals: [0, 3, 7, 9], optional5th: true },
    { name: 'mM7', intervals: [0, 3, 7, 11], optional5th: true },
    { name: 'm7b5', intervals: [0, 3, 6, 10], optional5th: false },
    { name: 'aug7', intervals: [0, 4, 8, 10], optional5th: false },
    { name: 'Dim7', intervals: [0, 3, 6, 9], optional5th: false }, 
    { name: 'Aug', intervals: [0, 4, 8], optional5th: false },     
    { name: 'Dim', intervals: [0, 3, 6], optional5th: false },
    { name: 'sus4', intervals: [0, 5, 7], optional5th: true },
    { name: 'sus2', intervals: [0, 2, 7], optional5th: true },
    { name: '5', intervals: [0, 7], optional5th: false },
    { name: 'Maj', intervals: [0, 4, 7], optional5th: true },
    { name: 'Min', intervals: [0, 3, 7], optional5th: true },
];

export function identifyChord(pitches: number[]): { match: ChordMatch, alternatives: ChordMatch[] } | null {
    if (pitches.length < 2) return null;
    const sortedPitches = [...pitches].sort((a,b) => a - b);
    const bassPC = sortedPitches[0] % 12;
    const uniquePCs = Array.from(new Set(pitches.map(p => p % 12))).sort((a,b) => a-b);
    const candidates: ChordMatch[] = [];

    for (const root of uniquePCs) {
        const inputIntervals = uniquePCs.map(p => (p - root + 12) % 12);
        for (const shape of CHORD_SHAPES) {
            const req = shape.intervals;
            const missing = req.filter(i => !inputIntervals.includes(i));
            const isOmitted5th = missing.length === 1 && missing[0] === 7 && shape.optional5th;

            if (missing.length === 0 || isOmitted5th) {
                let score = (req.length - missing.length) * 10;
                const extraNotes = inputIntervals.filter(i => !req.includes(i)).length;
                score -= extraNotes * 20;
                score -= missing.length * 5;

                let inversionStr: string | undefined = undefined;
                if (root !== bassPC) {
                    inversionStr = `/${NOTE_NAMES[bassPC]}`;
                } else { score += 1; }

                candidates.push({
                    name: `${NOTE_NAMES[root]} ${shape.name}${inversionStr || ''}`,
                    root: NOTE_NAMES[root],
                    quality: shape.name,
                    bass: inversionStr ? NOTE_NAMES[bassPC] : undefined,
                    inversion: inversionStr,
                    score,
                    missingNotes: missing.map(interval => NOTE_NAMES[(root + interval) % 12])
                });
            }
        }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a,b) => b.score - a.score);
    return { match: candidates[0], alternatives: candidates.slice(1, 6) };
}

export function getFormattedTime(ticks: number, ppq: number, tsNum: number, tsDenom: number): string {
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
    const ticksPerBeat = ppq * (4 / tsDenom);
    const measure = Math.floor(ticks / ticksPerMeasure) + 1;
    const ticksInMeasure = ticks % ticksPerMeasure;
    const beat = Math.floor(ticksInMeasure / ticksPerBeat) + 1;
    const sub = ((ticksInMeasure % ticksPerBeat) / ticksPerBeat).toFixed(2).substring(1); 
    return `Meas ${measure} | Beat ${beat}${sub}`;
}

/**
 * Adjusts notes for chord detection: Ornaments are treated as sounding at their Principal's onset.
 */
function prepareNotesForChordDetection(notes: (any | RawNote)[]): (any | RawNote)[] {
    return notes.map(n => {
        const principalTick = (n as any)._principalTick;
        if (principalTick !== undefined) {
            // Treat ornament as principal for chord detection timing
            return { ...n, ticks: principalTick };
        }
        return n;
    });
}

export function detectChordsSustain(notes: any[] | RawNote[], ppq: number, tsNum: number, tsDenom: number, minDurationTicks: number = 0): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes);
    const validNotes = prepared.filter(n => (n.durationTicks || 0) >= minDurationTicks);
    const points = new Set<number>();
    validNotes.forEach(n => { points.add(n.ticks); points.add(n.ticks + n.durationTicks); });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    const chords: ChordEvent[] = [];
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const t = sortedPoints[i];
        const activeNotes = validNotes.filter(n => n.ticks <= t && (n.ticks + n.durationTicks) > t);
        if (activeNotes.length >= 2) {
            const result = identifyChord(activeNotes.map(n => n.midi));
            if (result) {
                const { match, alternatives } = result;
                const measure = Math.floor(t / ticksPerMeasure) + 1;
                const constituentNotes = Array.from(new Set(activeNotes.map((n: any) => n.name)));
                const lastChord = chords[chords.length - 1];
                if (!lastChord || lastChord.name !== match.name || lastChord.measure !== measure) {
                     chords.push({
                        timestamp: t / ppq,
                        measure,
                        formattedTime: getFormattedTime(t, ppq, tsNum, tsDenom),
                        name: match.name,
                        root: match.root,
                        quality: match.quality,
                        bass: match.bass,
                        inversion: match.inversion,
                        ticks: t,
                        constituentNotes,
                        missingNotes: match.missingNotes,
                        alternatives: alternatives
                    });
                }
            }
        }
    }
    return chords;
}

export function detectChordsAttack(notes: any[] | RawNote[], ppq: number, tsNum: number, tsDenom: number, toleranceTicks: number = 0, minDurationTicks: number = 0): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes);
    const validNotes = prepared.filter(n => (n.durationTicks || 0) >= minDurationTicks);
    const sorted = [...validNotes].sort((a, b) => a.ticks - b.ticks);
    const chords: ChordEvent[] = [];
    const ticksPerMeasure = ppq * tsNum * (4 / tsDenom);
    const window = Math.max(1, toleranceTicks > 0 ? toleranceTicks : ppq / 3); 

    let i = 0;
    while (i < sorted.length) {
        const startTick = sorted[i].ticks;
        const group = [sorted[i]];
        let j = i + 1;
        while (j < sorted.length && (sorted[j].ticks - startTick) < window) {
            group.push(sorted[j]);
            j++;
        }
        const uniqueNotes = Array.from(new Map(group.map(n => [n.midi, n])).values());
        if (uniqueNotes.length >= 2) {
            const result = identifyChord(uniqueNotes.map(n => n.midi));
            if (result) {
                const { match, alternatives } = result;
                const measure = Math.floor(startTick / ticksPerMeasure) + 1;
                const constituentNotes = Array.from(new Set(uniqueNotes.map(n => n.name)));
                const lastChord = chords[chords.length - 1];
                if (!lastChord || lastChord.name !== match.name || lastChord.measure !== measure) {
                    chords.push({
                        timestamp: startTick / ppq,
                        measure,
                        formattedTime: getFormattedTime(startTick, ppq, tsNum, tsDenom),
                        name: match.name,
                        root: match.root,
                        quality: match.quality,
                        bass: match.bass,
                        inversion: match.inversion,
                        ticks: startTick,
                        constituentNotes,
                        missingNotes: match.missingNotes,
                        alternatives: alternatives
                    });
                }
            }
        }
        i = j;
    }
    return chords;
}

export function detectChordsBucketed(notes: RawNote[], ppq: number, tsNum: number, tsDenom: number, bucketSizeBeats: number): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes) as RawNote[];
    const ticksPerBeat = ppq * (4 / tsDenom);
    const bucketTicks = ticksPerBeat * bucketSizeBeats;
    const buckets: Map<number, RawNote[]> = new Map();

    prepared.forEach(n => {
        const bucketIndex = Math.floor(n.ticks / bucketTicks);
        if (!buckets.has(bucketIndex)) buckets.set(bucketIndex, []);
        buckets.get(bucketIndex)!.push(n);
    });

    const chords: ChordEvent[] = [];
    const bucketIndices = Array.from(buckets.keys()).sort((a,b) => a-b);

    for (const idx of bucketIndices) {
        const bucketNotes = buckets.get(idx)!;
        const startTick = idx * bucketTicks;
        const uniqueNotes = Array.from(new Map(bucketNotes.map(n => [n.midi, n])).values());
        if (uniqueNotes.length >= 2) {
             const result = identifyChord(uniqueNotes.map(n => n.midi));
             if (result) {
                const { match, alternatives } = result;
                const measure = Math.floor(startTick / (ppq * tsNum * (4 / tsDenom))) + 1;
                chords.push({
                    timestamp: startTick / ppq,
                    measure,
                    formattedTime: getFormattedTime(startTick, ppq, tsNum, tsDenom),
                    name: match.name,
                    root: match.root,
                    quality: match.quality,
                    bass: match.bass,
                    inversion: match.inversion,
                    ticks: startTick,
                    constituentNotes: Array.from(new Set(uniqueNotes.map(n => n.name))),
                    missingNotes: match.missingNotes,
                    alternatives: alternatives
                });
             }
        }
    }
    return chords;
}

export function detectChordsHybrid(notes: RawNote[], ppq: number, tsNum: number, tsDenom: number, minDurationTicks: number, voiceConfigs: Record<number, string>, arpeggioMode: 'count' | 'beat' | '2beat', arpeggioValue: number): ChordEvent[] {
    const prepared = prepareNotesForChordDetection(notes) as RawNote[];
    const voices: Record<number, RawNote[]> = {};
    prepared.forEach(n => {
        const v = n.voiceIndex ?? -1;
        if (!voices[v]) voices[v] = [];
        voices[v].push(n);
    });

    let processedNotes: RawNote[] = [];
    Object.keys(voices).forEach(vKey => {
        const vIndex = Number(vKey);
        const strategy = voiceConfigs[vIndex] || 'sustain';
        if (strategy === 'ignore') return;
        const vNotes = voices[vIndex].sort((a,b) => a.ticks - b.ticks);
        vNotes.forEach(n => {
            if (n.durationTicks < minDurationTicks) return;
            const clone = { ...n };
            if (strategy === 'attack') clone.durationTicks = Math.min(ppq/8, clone.durationTicks);
            processedNotes.push(clone);
        });
    });
    return detectChordsSustain(processedNotes, ppq, tsNum, tsDenom, 0);
}
