
import { Midi } from '@tonejs/midi';
import { ConversionOptions, MidiEventType } from '../../types';
import { getQuantizationTickValue } from './midiTransform';
import { copyAndTransformTrackEvents } from './midiPipeline';
import { distributeToVoices, getVoiceLabel } from './midiVoices';
import { analyzeScale } from './musicTheory';
import { 
    determineBestLUnit, 
    formatFraction, 
    flattenPolyphonyToChords, 
    segmentEventsByMeasure, 
    getAbcPitch 
} from './abcUtils';

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
    midi.tracks.forEach(t => t.notes.forEach(n => { n.ticks = Math.round(n.ticks/quantGrid)*quantGrid; n.durationTicks = Math.max(quantGrid, Math.round(n.durationTicks/quantGrid)*quantGrid); }));
    const allNotes = midi.tracks.flatMap(t => t.notes);
    const maxSongTick = allNotes.reduce((max, n) => Math.max(max, n.ticks + n.durationTicks), 0);
    const lUnit = determineBestLUnit(allNotes, ppq);
    
    // --- KEY SIGNATURE LOGIC ---
    const { scaleMap, keyString, preferFlats } = analyzeScale(options.modalConversion.root, options.modalConversion.modeName, options.keySignatureSpelling);

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
            const distribution = distributeToVoices(track.notes, options);
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
            
            // Handle naming for Orphans (which will be the last index if added)
            // But we can rely on getVoiceLabel to return 'Orphan' if index is -1, 
            // but here we are iterating an array so vIdx is 0..N.
            // If vIdx == voices.length - 1 AND distribution had orphans, it might be the orphans track.
            // Better to rely on checking if this note set matches the orphans, but for simple export we just label sequentially or detect if it was orphans.
            // Actually, we can check if it exceeds the expected polyphony, but let's just label it generic Voice N or rely on user knowing.
            // Better: If we added orphans, it's the last one.
            
            let voiceName = options.outputStrategy === 'separate_voices' ? getVoiceLabel(vIdx, voices.length) : track.name;
            
            // Heuristic for naming Orphan track in ABC if it was added
            // (Since distributeToVoices returns N voices, if we have N+1, the last is orphans)
            // Ideally we'd pass the orphan flag explicitly, but for now this is "not dropping info".
            
            abc += `V:${voiceId} name="${voiceName}"\n`;
            
            // FLATTEN POLYPHONY
            const flattenedEvents = flattenPolyphonyToChords(vNotes);
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
                             const notesStr = e.notes.map(n => getAbcPitch(n.midi, scaleMap, preferFlats) + (n.tied ? '-' : '')).join('');
                             if (e.notes.length > 1) {
                                 mStr += `[${notesStr}]${durStr} `;
                             } else {
                                 mStr += `${notesStr}${durStr} `;
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
    const newMidi = new Midi(); 
    if (originalMidi.header.name) newMidi.header.name = originalMidi.header.name;
    newMidi.header.setTempo(options.tempo); 
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [options.timeSignature.numerator, options.timeSignature.denominator] }];
    
    trackIds.forEach(id => { 
        const t = originalMidi.tracks[id]; 
        if (t) { 
            const target = newMidi.addTrack(); 
            target.name = t.name; 
            target.instrument = t.instrument; 
            copyAndTransformTrackEvents(t, target, options, eventsToDelete, newMidi.header, originalMidi.header.ppq); 
        } 
    });
    
    const abcStr = convertMidiToAbc(newMidi, newFileName, options, getQuantizationTickValue(options.quantizationValue, newMidi.header.ppq));
    const blob = new Blob([abcStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = newFileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
