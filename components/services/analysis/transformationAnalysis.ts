
import { Midi, Track } from '@tonejs/midi';
import { ConversionOptions, TransformationStats } from '../../../types';
import { getQuantizationTickValue, quantizeNotes } from '../midiTransform';
import { getFormattedTime } from '../midiHarmony';

export function getQuantizationWarning(midi: Midi, selectedTrackIds: Set<number>, options: ConversionOptions): { message: string, details: string[] } | null {
    const ppq = midi.header.ppq;
    const shadowEnabled = options.primaryRhythm.enabled;
    if ((!shadowEnabled && options.quantizationValue === 'off' && !options.pruneOverlaps) || selectedTrackIds.size === 0) return null;
    const quantizationTicks = shadowEnabled ? getQuantizationTickValue(options.primaryRhythm.minNoteValue, ppq) : getQuantizationTickValue(options.quantizationValue, ppq);
    
    let clampedNotesCount = 0;
    let microNotesCount = 0;
    const microLocations: Set<string> = new Set();

    selectedTrackIds.forEach(id => {
        const track = midi.tracks[id];
        if (!track) return;
        // Warning logic also needs to check UN-SCALED ticks if we are quantizing unscaled ticks
        // But options.quantizationValue applies to the input grid now.
        track.notes.forEach(n => {
            const ticks = n.ticks;
            const dur = n.durationTicks;
            
            if (quantizationTicks > 0) {
                let quantizedDuration = Math.round(dur / quantizationTicks) * quantizationTicks;
                if (quantizedDuration < quantizationTicks) clampedNotesCount++;
                if (quantizedDuration < Math.floor(ppq/32)) {
                    microNotesCount++;
                    microLocations.add(`${n.name} at ${getFormattedTime(ticks, ppq, options.timeSignature.numerator, options.timeSignature.denominator)}`);
                }
            }
        });
    });
    
    if (microNotesCount === 0 && clampedNotesCount === 0) return null;
    
    let msg = "";
    const details: string[] = [];
    if (microNotesCount > 0) {
        msg += `${microNotesCount} tiny notes detected. `;
        microLocations.forEach(l => details.push(`[Micro] ${l}`));
    }
    if (clampedNotesCount > 0) msg += `${clampedNotesCount} notes snapped to min grid.`;
    
    return { message: msg.trim(), details };
}

export function calculateTransformationStats(track: Track, options: ConversionOptions, ppq: number): TransformationStats {
    let workingNotes = track.notes.map((n, idx) => ({ ...n, _analysisId: idx } as any));
    const initialCount = workingNotes.length;

    let removedByDuration = 0;

    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }

    if (options.removeShortNotesThreshold > 0) {
        const before = workingNotes.length;
        workingNotes = workingNotes.filter(n => n.durationTicks >= options.removeShortNotesThreshold);
        removedByDuration = before - workingNotes.length;
    }

    const inputById = new Map<number, { ticks: number; durationTicks: number }>();
    workingNotes.forEach(n => inputById.set((n as any)._analysisId, { ticks: n.ticks, durationTicks: n.durationTicks }));

    const primaryTicks = options.primaryRhythm.enabled ? getQuantizationTickValue(options.primaryRhythm.minNoteValue, ppq) : 0;
    const legacyTicks = getQuantizationTickValue(options.quantizationValue, ppq);
    const measureGrid = primaryTicks > 0 ? primaryTicks : (legacyTicks > 0 ? legacyTicks : ppq / 4);

    const calculateAlignment = (notes: any[]) => {
        if (notes.length === 0) return 0;
        let onGrid = 0;
        notes.forEach(n => {
            const dist = ((n.ticks % measureGrid) + measureGrid) % measureGrid;
            const deviation = Math.min(dist, measureGrid - dist);
            if (deviation < measureGrid * 0.05) onGrid++;
        });
        return onGrid / notes.length;
    };

    const inputGridAlignment = calculateAlignment(workingNotes);

    const quantizedNotes = quantizeNotes(workingNotes.map(n => ({ ...n })), options, ppq).map(n => ({ ...n }));

    let quantizedCount = 0;
    let durationAdjustedCount = 0;
    let notesExtended = 0;
    let notesShortened = 0;
    let totalShift = 0;

    const remainingIds = new Set<number>();
    quantizedNotes.forEach((n: any) => {
        const id = (n as any)._analysisId;
        if (id === undefined) return;
        remainingIds.add(id);
        const before = inputById.get(id);
        if (!before) return;

        const tickShift = Math.abs(n.ticks - before.ticks);
        if (tickShift > 0) {
            quantizedCount++;
            totalShift += tickShift;
        }

        if (n.durationTicks !== before.durationTicks) {
            durationAdjustedCount++;
            if (n.durationTicks > before.durationTicks) notesExtended++;
            if (n.durationTicks < before.durationTicks) notesShortened++;
        }
    });

    const notesRemovedOverlap = Math.max(0, inputById.size - remainingIds.size);
    const notesTruncatedOverlap = options.pruneOverlaps ? notesShortened : 0;

    let outputNotes = quantizedNotes;
    if (timeScale !== 1) {
        outputNotes = outputNotes.map(n => ({
            ...n,
            ticks: Math.round(n.ticks * timeScale),
            durationTicks: Math.round(n.durationTicks * timeScale)
        }));
    }

    const outputGridAlignment = calculateAlignment(outputNotes);

    return {
        totalNotesInput: initialCount,
        totalNotesOutput: outputNotes.length,
        notesRemovedDuration: removedByDuration,
        notesQuantized: quantizedCount,
        notesDurationChanged: durationAdjustedCount,
        notesExtended,
        notesShortened,
        avgShiftTicks: quantizedCount > 0 ? totalShift / quantizedCount : 0,
        notesRemovedOverlap,
        notesTruncatedOverlap,
        inputGridAlignment,
        outputGridAlignment
    };
}
