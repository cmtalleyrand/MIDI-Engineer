
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

function getCropWindow(options: ConversionOptions, ppq: number): { enabled: boolean; startTick: number; endTick: number } {
    if (!options.exportRange.enabled) {
        return { enabled: false, startTick: 0, endTick: Infinity };
    }

    const ticksPerMeasure = ppq * 4 * (options.timeSignature.numerator / options.timeSignature.denominator);
    return {
        enabled: true,
        startTick: (options.exportRange.startMeasure - 1) * ticksPerMeasure,
        endTick: options.exportRange.endMeasure * ticksPerMeasure
    };
}

function dedupeConsecutiveTempos(events: Array<{ ticks: number; bpm: number }>): Array<{ ticks: number; bpm: number }> {
    const deduped: Array<{ ticks: number; bpm: number }> = [];
    for (const event of events) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev.bpm !== event.bpm) deduped.push(event);
    }
    return deduped;
}

function dedupeConsecutiveTimeSignatures(events: Array<{ ticks: number; timeSignature: [number, number] }>): Array<{ ticks: number; timeSignature: [number, number] }> {
    const deduped: Array<{ ticks: number; timeSignature: [number, number] }> = [];
    for (const event of events) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev.timeSignature[0] !== event.timeSignature[0] || prev.timeSignature[1] !== event.timeSignature[1]) {
            deduped.push(event);
        }
    }
    return deduped;
}

function transformHeaderTick(
    sourceTick: number,
    ppqRatio: number,
    timeScale: number,
    isGlobalInversion: boolean,
    maxTick: number,
    cropStartTick: number,
    cropEndTick: number
): number | null {
    let ticks = Math.round(sourceTick * ppqRatio);
    ticks = Math.round(ticks * timeScale);
    if (isGlobalInversion) ticks = maxTick - ticks;

    if (cropEndTick !== Infinity) {
        if (ticks < cropStartTick || ticks > cropEndTick) return null;
        ticks = ticks - cropStartTick;
    }

    return Math.max(0, ticks);
}

export function cloneTempoMap(
    sourceHeader: Midi['header'],
    destHeader: Midi['header'],
    ppqRatio: number,
    timeScale: number,
    cropStartTick: number,
    cropEndTick: number,
    isGlobalInversion: boolean,
    maxTick: number
): void {
    const sourceTempos = (sourceHeader.tempos || []).slice().sort((a, b) => a.ticks - b.ticks);
    const fallbackTempo = sourceTempos.find(t => t.ticks <= 0)?.bpm ?? sourceTempos[0]?.bpm ?? 120;
    const transformed = sourceTempos
        .map((tempo) => {
            const ticks = transformHeaderTick(tempo.ticks, ppqRatio, timeScale, isGlobalInversion, maxTick, cropStartTick, cropEndTick);
            if (ticks == null) return null;
            return { ticks, bpm: tempo.bpm };
        })
        .filter((event): event is { ticks: number; bpm: number } => event !== null)
        .sort((a, b) => a.ticks - b.ticks);

    let deduped = dedupeConsecutiveTempos(transformed);

    if (deduped.length === 0 || deduped[0].ticks > 0) {
        const probeTick = cropEndTick !== Infinity ? cropStartTick : 0;
        const prior = sourceTempos.filter(t => t.ticks <= probeTick).pop();
        deduped = [{ ticks: 0, bpm: prior?.bpm ?? fallbackTempo }, ...deduped];
    } else if (deduped[0].ticks < 0) {
        deduped[0].ticks = 0;
    }

    destHeader.tempos = dedupeConsecutiveTempos(deduped);
}

export function cloneTimeSignatureMap(
    sourceHeader: Midi['header'],
    destHeader: Midi['header'],
    ppqRatio: number,
    timeScale: number,
    cropStartTick: number,
    cropEndTick: number,
    isGlobalInversion: boolean,
    maxTick: number
): void {
    const sourceSigs = (sourceHeader.timeSignatures || []).slice().sort((a, b) => a.ticks - b.ticks);
    const fallbackSignature: [number, number] = sourceSigs.find(ts => ts.ticks <= 0)?.timeSignature as [number, number]
        ?? sourceSigs[0]?.timeSignature as [number, number]
        ?? [4, 4];

    const transformed = sourceSigs
        .map((ts) => {
            const ticks = transformHeaderTick(ts.ticks, ppqRatio, timeScale, isGlobalInversion, maxTick, cropStartTick, cropEndTick);
            if (ticks == null) return null;
            return { ticks, timeSignature: [ts.timeSignature[0], ts.timeSignature[1]] as [number, number] };
        })
        .filter((event): event is { ticks: number; timeSignature: [number, number] } => event !== null)
        .sort((a, b) => a.ticks - b.ticks);

    let deduped = dedupeConsecutiveTimeSignatures(transformed);

    if (deduped.length === 0 || deduped[0].ticks > 0) {
        const probeTick = cropEndTick !== Infinity ? cropStartTick : 0;
        const prior = sourceSigs.filter(ts => ts.ticks <= probeTick).pop();
        deduped = [{ ticks: 0, timeSignature: (prior?.timeSignature as [number, number]) ?? fallbackSignature }, ...deduped];
    } else if (deduped[0].ticks < 0) {
        deduped[0].ticks = 0;
    }

    destHeader.timeSignatures = dedupeConsecutiveTimeSignatures(deduped);
}



function getHeaderTransformContext(options: ConversionOptions, sourceHeader: Midi['header'], destinationHeader: Midi['header'], maxTick: number): {
    ppqRatio: number;
    timeScale: number;
    cropStartTick: number;
    cropEndTick: number;
    isGlobalInversion: boolean;
    maxTick: number;
} {
    let timeScale = options.noteTimeScale;
    if (options.tempoChangeMode === 'time' && options.originalTempo > 0 && options.tempo > 0) {
        timeScale *= options.originalTempo / options.tempo;
    }

    const cropWindow = getCropWindow(options, destinationHeader.ppq);

    return {
        ppqRatio: destinationHeader.ppq / sourceHeader.ppq,
        timeScale,
        cropStartTick: cropWindow.startTick,
        cropEndTick: cropWindow.endTick,
        isGlobalInversion: options.inversionMode === 'global',
        maxTick
    };
}

function applyTransformedHeaderMap(sourceHeader: Midi['header'], destinationHeader: Midi['header'], options: ConversionOptions, maxTick: number): void {
    const context = getHeaderTransformContext(options, sourceHeader, destinationHeader, maxTick);

    cloneTempoMap(
        sourceHeader,
        destinationHeader,
        context.ppqRatio,
        context.timeScale,
        context.cropStartTick,
        context.cropEndTick,
        context.isGlobalInversion,
        context.maxTick
    );

    cloneTimeSignatureMap(
        sourceHeader,
        destinationHeader,
        context.ppqRatio,
        context.timeScale,
        context.cropStartTick,
        context.cropEndTick,
        context.isGlobalInversion,
        context.maxTick
    );

    const forcedNumerator = options.timeSignature.numerator;
    const forcedDenominator = options.timeSignature.denominator;
    if (destinationHeader.timeSignatures.length > 0 && destinationHeader.timeSignatures.every(ts => ts.timeSignature[0] === forcedNumerator && ts.timeSignature[1] === forcedDenominator)) {
        return;
    }

    if (sourceHeader.timeSignatures.length === 0 && (forcedNumerator !== 4 || forcedDenominator !== 4)) {
        destinationHeader.timeSignatures = [{ ticks: 0, timeSignature: [forcedNumerator, forcedDenominator] }];
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
    const cropWindow = getCropWindow(options, destPPQ);
    const cropEnabled = cropWindow.enabled;
    const cropStartTick = cropWindow.startTick;
    const cropEndTick = cropWindow.endTick;

    if (cropEnabled) transformedNotes = cropToRange(transformedNotes, options, destPPQ);

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

    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    newTrack.instrument.number = originalTrack.instrument.number;
    newTrack.instrument.name = originalTrack.instrument.name;
    
    copyAndTransformTrackEvents(originalTrack, newTrack, options, eventsToDelete, newMidi.header, originalMidi.header.ppq);

    applyTransformedHeaderMap(originalMidi.header, newMidi.header, options, getMaxNoteEndTick(newMidi));
    return newMidi;
}

export function getTransformedTrackDataForPianoRoll(originalMidi: Midi, trackId: number, options: ConversionOptions): PianoRollTrackData {
    const newMidi = new Midi();

    const originalTrack = originalMidi.tracks[trackId];
    const newTrack = newMidi.addTrack();
    newTrack.name = originalTrack.name;
    
    copyAndTransformTrackEvents(originalTrack, newTrack, options, new Set(), newMidi.header, originalMidi.header.ppq);

    applyTransformedHeaderMap(originalMidi.header, newMidi.header, options, getMaxNoteEndTick(newMidi));

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



function getMaxNoteEndTick(midi: Midi): number {
    return midi.tracks.reduce((maxTrackTick, track) => {
        const trackMax = track.notes.reduce((maxNoteTick, note) => Math.max(maxNoteTick, note.ticks + note.durationTicks), 0);
        return Math.max(maxTrackTick, trackMax);
    }, 0);
}

export async function combineAndDownload(originalMidi: Midi, trackIds: number[], newFileName: string, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Promise<void> {
    if (trackIds.length < 1) throw new Error("At least one track must be selected.");
    const { options: resolvedOptions, debug } = resolveExportOptions(options, 'midi');
    logExportResolution(debug);
    
    const newMidi = new Midi();
    if (originalMidi.header.name) newMidi.header.name = originalMidi.header.name;

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

    applyTransformedHeaderMap(originalMidi.header, newMidi.header, resolvedOptions, getMaxNoteEndTick(newMidi));

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
