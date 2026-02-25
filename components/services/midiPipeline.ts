
import { Midi, Track } from '@tonejs/midi';
import { ConversionOptions, MidiEventType, PianoRollTrackData } from '../../types';
import { quantizeNotes, performInversion, performModalConversion, pruneOverlaps, performMelodicInversion, cropToRange } from './midiTransform';
import { distributeToVoices } from './midiVoices';

export type ExportTarget = 'midi' | 'abc';

export interface ExportResolutionDebugInfo {
    target: ExportTarget;
    quantizationPath: 'resolved_shadow' | 'bypass';
    explicitUserQuantization: boolean;
    quantizationValue: string;
    quantizeDurationMin: string;
    primaryRhythmEnabled: boolean;
    primaryRhythmValue: string;
    secondaryRhythmEnabled: boolean;
}

export function resolveExportOptions(options: ConversionOptions, target: ExportTarget): { options: ConversionOptions; debug: ExportResolutionDebugInfo } {
    const explicitUserQuantization = options.primaryRhythm.enabled;

    if (target === 'midi' && !explicitUserQuantization) {
        return {
            options: {
                ...options,
                quantizationValue: 'off',
                quantizeDurationMin: 'off',
                primaryRhythm: { ...options.primaryRhythm, enabled: false },
                secondaryRhythm: { ...options.secondaryRhythm, enabled: false }
            },
            debug: {
                target,
                quantizationPath: 'bypass',
                explicitUserQuantization,
                quantizationValue: 'off',
                quantizeDurationMin: 'off',
                primaryRhythmEnabled: false,
                primaryRhythmValue: options.primaryRhythm.minNoteValue,
                secondaryRhythmEnabled: false
            }
        };
    }

    if (target === 'abc' && !explicitUserQuantization) {
        const primaryRhythmValue = options.primaryRhythm.minNoteValue === 'off' ? '1/16' : options.primaryRhythm.minNoteValue;
        return {
            options: {
                ...options,
                quantizationValue: primaryRhythmValue,
                primaryRhythm: { ...options.primaryRhythm, enabled: true, minNoteValue: primaryRhythmValue }
            },
            debug: {
                target,
                quantizationPath: 'resolved_shadow',
                explicitUserQuantization,
                quantizationValue: primaryRhythmValue,
                quantizeDurationMin: options.quantizeDurationMin,
                primaryRhythmEnabled: true,
                primaryRhythmValue,
                secondaryRhythmEnabled: options.secondaryRhythm.enabled
            }
        };
    }

    return {
        options,
        debug: {
            target,
            quantizationPath: explicitUserQuantization ? 'resolved_shadow' : 'bypass',
            explicitUserQuantization,
            quantizationValue: options.quantizationValue,
            quantizeDurationMin: options.quantizeDurationMin,
            primaryRhythmEnabled: options.primaryRhythm.enabled,
            primaryRhythmValue: options.primaryRhythm.minNoteValue,
            secondaryRhythmEnabled: options.secondaryRhythm.enabled
        }
    };
}


export function logExportResolution(debug: ExportResolutionDebugInfo): void {
    console.debug(`[Export Resolution] ${debug.target.toUpperCase()} quantization path`, debug);
}


interface DuplicateNoteIssue {
    midi: number;
    durationBeats: number;
    duplicateCount: number;
    measure: number;
    beat: number;
    beatSubdivision: string;
}

function dedupeNotesAndReport(notes: any[], trackName: string, timeSignature: ConversionOptions['timeSignature'], ppq: number): any[] {
    const byIdentity = new Map<string, { note: any; duplicates: number }>();

    for (const note of notes) {
        const key = `${note.midi}|${note.ticks}|${note.durationTicks}`;
        const entry = byIdentity.get(key);
        if (entry) {
            entry.duplicates += 1;
        } else {
            byIdentity.set(key, { note, duplicates: 0 });
        }
    }

    const deduped: any[] = [];
    const issues: DuplicateNoteIssue[] = [];
    byIdentity.forEach(({ note, duplicates }) => {
        deduped.push(note);
        if (duplicates > 0) {
            const ticksPerMeasure = ppq * 4 * (timeSignature.numerator / timeSignature.denominator);
            const measure = Math.floor(note.ticks / ticksPerMeasure) + 1;
            const beatTicks = ppq * (4 / timeSignature.denominator);
            const beat = Math.floor((note.ticks % ticksPerMeasure) / beatTicks) + 1;
            const beatPositionWithinMeasure = (note.ticks % ticksPerMeasure) / beatTicks;
            const beatSubdivision = (beatPositionWithinMeasure - (beat - 1)).toFixed(2);
            issues.push({
                midi: note.midi,
                durationBeats: Number((note.durationTicks / beatTicks).toFixed(2)),
                duplicateCount: duplicates,
                measure,
                beat,
                beatSubdivision
            });
        }
    });

    if (issues.length > 0) {
        const removedCount = issues.reduce((sum, issue) => sum + issue.duplicateCount, 0);
        const issueSummary = issues
            .map(issue => `midi=${issue.midi} @M${issue.measure}:B${issue.beat}+${issue.beatSubdivision} duration=${issue.durationBeats} beat(s) (removed=${issue.duplicateCount})`)
            .join('; ');
        console.warn(`[Export Duplicate Notes] Removed ${removedCount} duplicate note(s) from track "${trackName || 'Untitled Track'}": ${issueSummary}`);
    }

    return deduped;
}

/**
 * Copies all tempo and time signature events from the original MIDI header to the destination,
 * adjusting tick positions for PPQ normalization, time scaling, and export range cropping.
 * Tempo BPM values are scaled proportionally if the user changed the base tempo.
 */
export function copyHeaderEvents(
    originalHeader: Midi['header'],
    destHeader: Midi['header'],
    options: ConversionOptions
): void {
    const ppqRatio = destHeader.ppq / originalHeader.ppq;

    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }

    const tempoRatio = (options.originalTempo > 0) ? options.tempo / options.originalTempo : 1;

    const cropEnabled = options.exportRange.enabled;
    let cropStartTick = 0;
    let cropEndTick = Infinity;
    if (cropEnabled) {
        const ticksPerMeasure = destHeader.ppq * 4 * (options.timeSignature.numerator / options.timeSignature.denominator);
        cropStartTick = (options.exportRange.startMeasure - 1) * ticksPerMeasure;
        cropEndTick = options.exportRange.endMeasure * ticksPerMeasure;
    }

    // --- Tempo events ---
    const transformedTempos = originalHeader.tempos
        .slice()
        .sort((a, b) => a.ticks - b.ticks)
        .map(t => ({
            ticks: Math.round(t.ticks * ppqRatio * timeScale),
            bpm: t.bpm * tempoRatio
        }));

    if (cropEnabled) {
        // Find the active tempo at crop start (last tempo event at or before cropStartTick)
        let activeBpm = options.tempo;
        for (const t of transformedTempos) {
            if (t.ticks <= cropStartTick) activeBpm = t.bpm;
            else break;
        }
        destHeader.tempos = [{ ticks: 0, bpm: activeBpm }];
        for (const t of transformedTempos) {
            if (t.ticks > cropStartTick && t.ticks < cropEndTick) {
                destHeader.tempos.push({ ticks: t.ticks - cropStartTick, bpm: t.bpm });
            }
        }
    } else {
        destHeader.tempos = transformedTempos;
    }

    // Ensure a tempo event exists at tick 0
    if (destHeader.tempos.length === 0 || destHeader.tempos[0].ticks !== 0) {
        destHeader.tempos.unshift({ ticks: 0, bpm: options.tempo });
    }

    // --- Time signature events ---
    const transformedTS = originalHeader.timeSignatures
        .slice()
        .sort((a, b) => a.ticks - b.ticks)
        .map((ts, i) => ({
            ticks: Math.round(ts.ticks * ppqRatio * timeScale),
            // First event uses user's time signature (they may have intentionally changed it);
            // subsequent events preserve the original composition's meter changes
            timeSignature: (i === 0)
                ? [options.timeSignature.numerator, options.timeSignature.denominator] as [number, number]
                : [...ts.timeSignature] as [number, number]
        }));

    if (cropEnabled) {
        // Find the active time signature at crop start
        let activeTS: [number, number] = [options.timeSignature.numerator, options.timeSignature.denominator];
        for (const ts of transformedTS) {
            if (ts.ticks <= cropStartTick) activeTS = ts.timeSignature;
            else break;
        }
        destHeader.timeSignatures = [{ ticks: 0, timeSignature: activeTS }];
        for (const ts of transformedTS) {
            if (ts.ticks > cropStartTick && ts.ticks < cropEndTick) {
                destHeader.timeSignatures.push({ ticks: ts.ticks - cropStartTick, timeSignature: ts.timeSignature });
            }
        }
    } else {
        destHeader.timeSignatures = transformedTS;
    }

    if (destHeader.timeSignatures.length === 0) {
        destHeader.timeSignatures = [{ ticks: 0, timeSignature: [options.timeSignature.numerator, options.timeSignature.denominator] }];
    }
}
}

export function copyAndTransformTrackEvents(
    sourceTrack: Track, 
    destinationTrack: Track, 
    options: ConversionOptions, 
    eventsToDelete: Set<MidiEventType>, 
    destinationHeader: Midi['header'], 
    sourcePPQ: number
) {
    const destPPQ = destinationHeader.ppq;
    const ppqRatio = destPPQ / sourcePPQ;

    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }

    // 1. Initial Copy, Transposition & PPQ Normalization
    let transformedNotes: any[] = sourceTrack.notes.map((note: any) => {
        let newMidi = note.midi + options.transposition;
        newMidi = Math.max(0, Math.min(127, newMidi));
        
        const { name, ...rest } = note;

        // Normalize ticks to destination PPQ immediately
        const normalizedTicks = Math.round(note.ticks * ppqRatio);
        const normalizedDuration = Math.round(note.durationTicks * ppqRatio);

        return { 
            ...rest, 
            midi: newMidi, 
            ticks: normalizedTicks, 
            durationTicks: normalizedDuration,
            velocity: note.velocity,
        } as any;
    });

    // 2. Filter Short Notes (On original timeframe, effectively dest timeframe now)
    // removeShortNotesThreshold is carried in source-PPQ ticks.
    // Normalize it to destination PPQ alongside note durations.
    const scaledThreshold = Math.round(options.removeShortNotesThreshold * ppqRatio);
    if (scaledThreshold > 0) {
        transformedNotes = transformedNotes.filter(n => n.durationTicks >= scaledThreshold);
    }

    // 3. Quantize (On destination timeframe)
    transformedNotes = quantizeNotes(transformedNotes, options, destPPQ);

    // 4. Apply Time Scaling (Augmentation/Diminution)
    if (timeScale !== 1) {
        transformedNotes = transformedNotes.map(n => ({
            ...n,
            ticks: Math.round(n.ticks * timeScale),
            durationTicks: Math.round(n.durationTicks * timeScale)
        }));
    }

    const maxTick = transformedNotes.length > 0 ? Math.max(...transformedNotes.map(n => n.ticks + n.durationTicks)) : 0;
    
    // 5. Retrograde (Time Inversion)
    transformedNotes = performInversion(transformedNotes, options.inversionMode, destPPQ, options.timeSignature, maxTick);
    
    // 6. Melodic Inversion
    transformedNotes = performMelodicInversion(transformedNotes, options.melodicInversion, destPPQ, options.timeSignature);
    
    // 7. Modal Conversion
    transformedNotes = performModalConversion(transformedNotes, options);

    // 8. Export Cropping
    const cropEnabled = options.exportRange.enabled;
    let cropStartTick = 0;
    let cropEndTick = Infinity;
    
    if (cropEnabled) {
        const ticksPerMeasure = destPPQ * 4 * (options.timeSignature.numerator / options.timeSignature.denominator);
        cropStartTick = (options.exportRange.startMeasure - 1) * ticksPerMeasure;
        cropEndTick = options.exportRange.endMeasure * ticksPerMeasure;
        
        transformedNotes = cropToRange(transformedNotes, options, destPPQ);
    }

    transformedNotes = dedupeNotesAndReport(transformedNotes, sourceTrack.name, options.timeSignature, destPPQ);

    const secondsPerTick = (60 / options.tempo) / destPPQ;
    transformedNotes = transformedNotes.map(n => ({ ...n, time: n.ticks * secondsPerTick, duration: n.durationTicks * secondsPerTick }));
    transformedNotes.forEach(note => destinationTrack.addNote(note));
    
    const isGlobalInversion = options.inversionMode === 'global';
    
    const transformEvent = (e: any) => {
        // Normalize
        let ticks = Math.round(e.ticks * ppqRatio);
        
        // Scale
        ticks = Math.round(ticks * timeScale);
        
        if (isGlobalInversion) ticks = maxTick - ticks;
        
        // Handle Cropping shift for events
        if (cropEnabled) {
            if (ticks < cropStartTick || ticks > cropEndTick) return null; // Filter out
            ticks = ticks - cropStartTick;
        }
        
        return { ...e, ticks, time: ticks * secondsPerTick };
    };

    if (!eventsToDelete.has('controlChange')) {
        Object.values(sourceTrack.controlChanges).flat().forEach((cc: any) => { 
            const t = transformEvent(cc); 
            if (t) destinationTrack.addCC(t); 
        });
    }
    if (!eventsToDelete.has('pitchBend')) {
        (sourceTrack.pitchBends || []).forEach((pb: any) => { 
            const t = transformEvent(pb);
            if (t) destinationTrack.addPitchBend(t); 
        });
    }
    if (!eventsToDelete.has('programChange')) {
        ((sourceTrack as any).programChanges || []).forEach((pc: any) => { 
            const t = transformEvent(pc);
            if (t) (destinationTrack as any).addProgramChange(pc.number, t.time); 
        });
    }
}

export function createPreviewMidi(originalMidi: Midi, trackId: number, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Midi {
    if (trackId < 0 || trackId >= originalMidi.tracks.length) throw new Error(`Track ${trackId} not found.`);

    // Create fresh Midi (defaults to 480 PPQ)
    const newMidi = new Midi();
    if (originalMidi.header.name) newMidi.header.name = originalMidi.header.name;
    copyHeaderEvents(originalMidi.header, newMidi.header, options);

    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    newTrack.instrument.number = originalTrack.instrument.number;
    newTrack.instrument.name = originalTrack.instrument.name;
    
    copyAndTransformTrackEvents(originalTrack, newTrack, options, eventsToDelete, newMidi.header, originalMidi.header.ppq);
    return newMidi;
}

export function getTransformedTrackDataForPianoRoll(originalMidi: Midi, trackId: number, options: ConversionOptions): PianoRollTrackData {
    const newMidi = new Midi();
    copyHeaderEvents(originalMidi.header, newMidi.header, options);

    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    
    copyAndTransformTrackEvents(originalTrack, newTrack, options, new Set(), newMidi.header, originalMidi.header.ppq);
    
    const distribution = distributeToVoices(newTrack.notes, options);
    const noteVoiceMap = new Map<any, number>();
    const noteExplanationMap = new Map<any, any>();
    const noteShadowDecisionMap = new Map<any, any>();
    
    // Map assigned voices
    distribution.voices.forEach((voiceNotes, voiceIdx) => { 
        voiceNotes.forEach(n => {
            noteVoiceMap.set(n, voiceIdx);
            noteExplanationMap.set(n, (n as any).explanation);
            noteShadowDecisionMap.set(n, (n as any).shadowDecision);
        }); 
    });
    
    // Map orphans (index -1)
    distribution.orphans.forEach(n => {
        noteVoiceMap.set(n, -1);
        noteExplanationMap.set(n, (n as any).explanation);
        noteShadowDecisionMap.set(n, (n as any).shadowDecision);
    });
    
    return {
        notes: newTrack.notes.map(n => ({ 
            midi: n.midi, 
            ticks: n.ticks, 
            durationTicks: n.durationTicks, 
            velocity: n.velocity, 
            name: n.name, 
            voiceIndex: noteVoiceMap.get(n), // Undefined if something went wrong, -1 if orphan, >=0 if voice
            isOrnament: (n as any).isOrnament,
            explanation: noteExplanationMap.get(n),
            shadowDecision: noteShadowDecisionMap.get(n)
        })),
        name: newTrack.name,
        ppq: newMidi.header.ppq,
        timeSignature: options.timeSignature
    };
}

export async function combineAndDownload(originalMidi: Midi, trackIds: number[], newFileName: string, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Promise<void> {
    if (trackIds.length < 1) throw new Error("At least one track must be selected.");
    const { options: resolvedOptions, debug } = resolveExportOptions(options, 'midi');
    logExportResolution(debug);
    
    const newMidi = new Midi();
    if (originalMidi.header.name) newMidi.header.name = originalMidi.header.name;
    copyHeaderEvents(originalMidi.header, newMidi.header, resolvedOptions);

    const selectedTrackIds = new Set(trackIds);

    // Strategy 1: Keep Separate Tracks
    if (resolvedOptions.outputStrategy === 'separate_tracks') {
        originalMidi.tracks.forEach((track, index) => {
            if (selectedTrackIds.has(index)) {
                const newTrack = newMidi.addTrack();
                newTrack.name = track.name;
                newTrack.instrument.number = track.instrument.number;
                newTrack.instrument.name = track.instrument.name;
                copyAndTransformTrackEvents(track, newTrack, resolvedOptions, eventsToDelete, newMidi.header, originalMidi.header.ppq);
                
                if (resolvedOptions.pruneOverlaps) {
                    const multipliers: number[] = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
                    const pruneThresholdTicks = Math.round(newMidi.header.ppq * multipliers[resolvedOptions.pruneThresholdIndex]);
                    newTrack.notes = pruneOverlaps(newTrack.notes, pruneThresholdTicks);
                }
            }
        });
    } 
    // Strategy 2 & 3: Combine first (then optionally separate by voice)
    else {
        const combinedTrack = newMidi.addTrack();
        const first = originalMidi.tracks.find((_, index) => selectedTrackIds.has(index));
        if (first) { 
            combinedTrack.instrument.number = first.instrument.number; 
            combinedTrack.instrument.name = first.instrument.name; 
            combinedTrack.name = trackIds.length === 1 ? first.name : "Ensemble";
        }

        originalMidi.tracks.forEach((track, index) => {
            if (selectedTrackIds.has(index)) {
                copyAndTransformTrackEvents(track, combinedTrack, resolvedOptions, eventsToDelete, newMidi.header, originalMidi.header.ppq);
            }
        });

        if (resolvedOptions.pruneOverlaps) {
            const multipliers: number[] = [0, 0.03125, 0.0416, 0.0625, 0.0833, 0.125, 0.1666, 0.25, 0.3333, 0.5, 1.0];
            const pruneThresholdTicks = Math.round(newMidi.header.ppq * multipliers[resolvedOptions.pruneThresholdIndex]);
            combinedTrack.notes = pruneOverlaps(combinedTrack.notes, pruneThresholdTicks);
        }

        // Strategy 3: Separate Voices
        if (resolvedOptions.outputStrategy === 'separate_voices') {
            const distribution = distributeToVoices(combinedTrack.notes, resolvedOptions);
            newMidi.tracks.pop(); // Remove combined track
            
            // Add Voices
            distribution.voices.forEach((vNotes, idx) => {
                const voiceTrack = newMidi.addTrack();
                voiceTrack.name = `${combinedTrack.name} - Voice ${idx + 1}`;
                voiceTrack.instrument = combinedTrack.instrument;
                vNotes.forEach(n => voiceTrack.addNote(n));
            });
            
            // Add Orphans (if any)
            if (distribution.orphans.length > 0) {
                const orphanTrack = newMidi.addTrack();
                orphanTrack.name = `${combinedTrack.name} - Orphans`;
                orphanTrack.instrument = combinedTrack.instrument;
                distribution.orphans.forEach(n => orphanTrack.addNote(n));
            }
        }
    }

    const midiBytes = newMidi.toArray();
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = newFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
