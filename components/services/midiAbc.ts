
import { Midi } from '@tonejs/midi';
import { ConversionOptions, MidiEventType } from '../../types';
import { getQuantizationTickValue } from './midiTransform';
import { copyAndTransformTrackEvents, logExportResolution, resolveExportOptions } from './midiPipeline';
import { distributeToVoices, getVoiceLabel } from './midiVoices';
import { analyzeScale } from './musicTheory';
import {
    determineBestLUnit,
    formatFraction,
    flattenPolyphonyToChords,
    segmentEventsByMeasure,
    getAbcPitch
} from './abcUtils';
import {
    detectOrnamentHypotheses,
    selectOrnamentHypotheses,
    getDefaultOrnamentDetectionParams,
} from './ornamentDetector';

function convertMidiToAbc(midi: Midi, fileName: string, options: ConversionOptions, forcedGridTick: number = 0): string {
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    const ppq = midi.header.ppq;
    let quantGrid = forcedGridTick;
    if (quantGrid <= 0) {
        const all = midi.tracks.flatMap(t => t.notes);
        let tErr = 0, sErr = 0;
        const tT = ppq/3, sT = ppq/4;
        all.forEach(n => { tErr += Math.min(n.ticks % tT, tT - (n.ticks % tT)); sErr += Math.min(n.ticks % sT, sT - (n.ticks % sT)); });
        quantGrid = tErr < sErr ? Math.round(ppq/12) : Math.round(ppq/4);
        if (quantGrid === 0) quantGrid = 1;
    }

    // --- KEY SIGNATURE LOGIC (must come before ornament detection to get scaleMap) ---
    const { scaleMap, keyString, preferFlats } = analyzeScale(options.modalConversion.root, options.modalConversion.modeName, options.keySignatureSpelling);

    // --- ORNAMENT DETECTION (must run BEFORE quantization: short grace notes are expanded by quantGrid snapping) ---
    // allOrnamentMemberIds: note IDs that are ornamental figures (excluded from regular note stream)
    // principalOrnamentData: maps principal note ID → { gracePrefix, decoration }
    const allOrnamentMemberIds = new Set<string>();
    const principalOrnamentData = new Map<string, { gracePrefix?: string; decoration?: string }>();

    midi.tracks.forEach(track => {
        if (track.notes.length === 0) return;
        const ornParams = getDefaultOrnamentDetectionParams(ppq);
        const hypotheses = detectOrnamentHypotheses(track.notes, ornParams);
        const selected = selectOrnamentHypotheses(hypotheses);

        for (const h of selected) {
            if (h.class === 'trill') {
                // For trill, memberNoteIds includes the principal; exclude all but the principal
                h.memberNoteIds
                    .filter(id => id !== h.principalNoteRef)
                    .forEach(id => allOrnamentMemberIds.add(id));
                principalOrnamentData.set(h.principalNoteRef, {
                    ...principalOrnamentData.get(h.principalNoteRef),
                    decoration: '!trill!',
                });
            } else {
                // For grace_group, mordent, turn: memberNoteIds are all non-principal ornament figures
                h.memberNoteIds.forEach(id => allOrnamentMemberIds.add(id));

                if (h.class === 'grace_group') {
                    const graceNotes = track.notes
                        .filter(n => h.memberNoteIds.includes((n as any).id))
                        .sort((a, b) => a.ticks - b.ticks);
                    const graceStr = '{' + graceNotes.map(n => getAbcPitch(n.midi, scaleMap, preferFlats)).join('') + '}';
                    principalOrnamentData.set(h.principalNoteRef, {
                        ...principalOrnamentData.get(h.principalNoteRef),
                        gracePrefix: graceStr,
                    });
                } else if (h.class === 'mordent') {
                    principalOrnamentData.set(h.principalNoteRef, {
                        ...principalOrnamentData.get(h.principalNoteRef),
                        decoration: '!mordent!',
                    });
                } else if (h.class === 'turn') {
                    principalOrnamentData.set(h.principalNoteRef, {
                        ...principalOrnamentData.get(h.principalNoteRef),
                        decoration: '!turn!',
                    });
                }
            }
        }
    });

    // Quantize notes. Ornament members skip the duration-expansion step since their duration is
    // irrelevant in ABC output (grace notes render as {pitch}, decorations are notational symbols).
    midi.tracks.forEach(t => t.notes.forEach(n => {
        n.ticks = Math.round(n.ticks / quantGrid) * quantGrid;
        if (!allOrnamentMemberIds.has((n as any).id)) {
            n.durationTicks = Math.max(quantGrid, Math.round(n.durationTicks / quantGrid) * quantGrid);
        }
    }));

    // Tag principal notes with their ornament data so it flows through flattenPolyphonyToChords.
    midi.tracks.forEach(t => t.notes.forEach(n => {
        const id = (n as any).id;
        if (id && principalOrnamentData.has(id)) {
            const data = principalOrnamentData.get(id)!;
            if (data.gracePrefix) (n as any).gracePrefix = data.gracePrefix;
            if (data.decoration) (n as any).decoration = data.decoration;
        }
    }));

    const allNotes = midi.tracks.flatMap(t => t.notes);
    const maxSongTick = allNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
    const lUnit = determineBestLUnit(allNotes, ppq);

    let abc = `X:1\nT:${fileName.replace(/\.abc$/i, '')}\nM:${ts[0]}/${ts[1]}\nL:${lUnit.str}\nQ:1/4=${Math.round(midi.header.tempos[0]?.bpm || 120)}\n`;
    if (options.modalConversion.root === 0 && options.modalConversion.modeName === 'Major') {
        abc += `% NOTE: Key signature is set to C Major by default.\n`;
    }
    abc += `${keyString}\n`;
    const ticksPerM = Math.round(ppq * 4 * (ts[0] / ts[1]));
    const totalMeasures = Math.ceil(maxSongTick / ticksPerM);

    midi.tracks.forEach((track, trackIndex) => {
        if (track.notes.length === 0) return;

        let voices: any[][] = [];
        if (options.outputStrategy === 'separate_voices') {
            const distribution = distributeToVoices(track.notes, options, ppq);
            voices = distribution.voices;
            if (distribution.orphans.length > 0) {
                // Treat orphans as a final voice for export so data is not dropped
                voices.push(distribution.orphans);
            }
        } else {
            voices = [[...track.notes]];
        }

        voices.forEach((vNotes, vIdx) => {
            const voiceId = options.outputStrategy === 'separate_voices' ? `${trackIndex + 1}_${vIdx + 1}` : `${trackIndex + 1}`;
            let voiceName = options.outputStrategy === 'separate_voices' ? getVoiceLabel(vIdx, voices.length) : track.name;

            abc += `V:${voiceId} name="${voiceName}"\n`;

            // Exclude ornament member notes from regular rendering — they are represented
            // by grace-note prefixes or decoration symbols on their principal notes.
            const mainNotes = vNotes.filter((n: any) => !allOrnamentMemberIds.has(n.id));

            // FLATTEN POLYPHONY
            const flattenedEvents = flattenPolyphonyToChords(mainNotes);
            const measures = segmentEventsByMeasure(flattenedEvents, ticksPerM);

            let abcBody = '';
            let lineMeasureCount = 0;
            for (let m = 0; m < totalMeasures; m++) {
                if (lineMeasureCount === 0) abcBody += `% Measure ${m + 1}\n`;

                const events = measures.get(m) || [];

                if (events.length === 0) {
                    abcBody += `z${formatFraction(ticksPerM, lUnit.ticks)} | `;
                } else {
                    let mStr = '';
                    events.forEach(e => {
                        const durStr = formatFraction(e.durationTicks, lUnit.ticks);
                        if (e.type === 'rest') {
                            mStr += `z${durStr} `;
                        } else if (e.notes) {
                            // Grace prefix and decoration apply once per event (before the chord).
                            const gracePrefix = e.notes.find(n => n.gracePrefix)?.gracePrefix ?? '';
                            const decoration = e.notes.find(n => n.decoration)?.decoration ?? '';
                            const notesStr = e.notes.map(n => getAbcPitch(n.midi, scaleMap, preferFlats) + (n.tied ? '-' : '')).join('');
                            if (e.notes.length > 1) {
                                mStr += `${decoration}${gracePrefix}[${notesStr}]${durStr} `;
                            } else {
                                mStr += `${decoration}${gracePrefix}${notesStr}${durStr} `;
                            }
                        }
                    });
                    abcBody += mStr.trim() + " | ";
                }
                if (++lineMeasureCount >= 4) {
                    abcBody += "\n";
                    lineMeasureCount = 0;
                }
            }
            abc += abcBody.trim() + " |]\n\n";
        });
    });
    return abc;
}

export async function exportTracksToAbc(originalMidi: Midi, trackIds: number[], newFileName: string, eventsToDelete: Set<MidiEventType>, options: ConversionOptions): Promise<void> {
    const { options: resolvedOptions, debug } = resolveExportOptions(options, 'abc');
    logExportResolution(debug);
    const newMidi = new Midi(); 
    if (originalMidi.header.name) newMidi.header.name = originalMidi.header.name;
    newMidi.header.setTempo(resolvedOptions.tempo); 
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [resolvedOptions.timeSignature.numerator, resolvedOptions.timeSignature.denominator] }];
    
    trackIds.forEach(id => { 
        const t = originalMidi.tracks[id]; 
        if (t) { 
            const target = newMidi.addTrack(); 
            target.name = t.name; 
            target.instrument = t.instrument; 
            copyAndTransformTrackEvents(t, target, resolvedOptions, eventsToDelete, newMidi.header, originalMidi.header.ppq); 
        } 
    });
    
    const abcStr = convertMidiToAbc(newMidi, newFileName, resolvedOptions, getQuantizationTickValue(resolvedOptions.quantizationValue, newMidi.header.ppq));
    const blob = new Blob([abcStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = newFileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
