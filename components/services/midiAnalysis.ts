
import { Midi } from '@tonejs/midi';
import { TrackAnalysisData, NoteValueStat, ConversionOptions, RawNote } from '../../types';
import { detectAndTagOrnaments, NOTE_NAMES } from './midiCore';
import { distributeToVoices } from './midiVoices';
import { detectChordsSustain, detectChordsAttack, detectChordsBucketed } from './midiHarmony';
import { copyAndTransformTrackEvents } from './midiPipeline';
import { calculateTransformationStats } from './analysis/transformationAnalysis';
import { predictKey } from './analysis/keyPrediction';
import { analyzeRhythm } from './analysis/rhythmAnalysis';
import { getTransformedNotes } from './midiTransform';

function analyzeVoiceLeading(notes: RawNote[]): Record<number, number> {
    const stats: Record<number, number> = {};
    const voices: Record<number, RawNote[]> = {};
    notes.forEach(n => { const v = n.voiceIndex ?? 0; if (!voices[v]) voices[v] = []; voices[v].push(n); });
    Object.values(voices).forEach(vNotes => {
        vNotes.sort((a,b) => a.ticks - b.ticks);
        for(let i=0; i < vNotes.length - 1; i++) {
            const diff = vNotes[i+1].midi - vNotes[i].midi;
            stats[diff] = (stats[diff] || 0) + 1;
        }
    });
    return stats;
}

export function generateAnalysisReport(data: TrackAnalysisData): string {
    const { trackName, chordsSustain, chordsAttack, chordsHybrid, chordsBucketed, topNoteValues, detectedGridType, bestKeyPrediction, voiceIntervals, transformationStats } = data;
    let r = `HARMONIC ANALYSIS REPORT\nGenerated on: ${new Date().toLocaleDateString()}\nTrack: ${trackName}\n--------------------------------------------------\n\n`;
    
    if (transformationStats) {
        const t = transformationStats;
        r += `0. PROCESSING IMPACT SUMMARY (Based on current settings)\n`;
        r += `   Input Notes: ${t.totalNotesInput} -> Output Notes: ${t.totalNotesOutput}\n`;
        r += `   - Quantization: ${t.notesQuantized} notes shifted (Avg Error: ${Math.round(t.avgShiftTicks)} ticks)\n`;
        r += `   - Duration Filtering: ${t.notesRemovedDuration} notes removed (too short)\n`;
        r += `   - Overlap Pruning: ${t.notesRemovedOverlap} notes removed, ${t.notesTruncatedOverlap} shortened\n\n`;
    }

    r += `1. RHYTHMIC ANALYSIS\nDetected Grid: ${detectedGridType}\nNote Breakdown:\n`;
    topNoteValues.forEach((s, i) => { r += `  ${i+1}. ${s.name} (${Math.round(s.percentage)}%) - ${s.count} notes\n`; });
    
    r += `\n2. KEY & HARMONY\nPredicted Key: ${bestKeyPrediction ? `${NOTE_NAMES[bestKeyPrediction.root]} ${bestKeyPrediction.mode} (${Math.round(bestKeyPrediction.score * 100)}%)` : 'Undetermined'}\n\n`;
    
    const print = (title: string, list: any[]) => {
        let out = `3. ${title}\n`;
        if (!list || list.length === 0) out += `No chords detected.\n`;
        else list.forEach(c => out += `${c.formattedTime.padEnd(20)}: ${c.name.padEnd(20)} [${c.constituentNotes.join(', ')}]${c.missingNotes.length ? ` (Missing: ${c.missingNotes.join(', ')})` : ''}\n`);
        return out;
    };
    
    r += print("CHORD PROGRESSION (Sustain)", chordsSustain);
    r += `\n` + print("CHORD PROGRESSION (Attacks)", chordsAttack);
    if (chordsHybrid?.length) r += `\n` + print("CHORD PROGRESSION (Hybrid / Arpeggio)", chordsHybrid);
    if (chordsBucketed?.length) r += `\n` + print("CHORD PROGRESSION (Harmonic Rhythm Normalized)", chordsBucketed);
    
    r += `\n4. VOICE LEADING\n`;
    Object.keys(voiceIntervals).map(Number).sort((a,b) => a-b).forEach(i => r += `  ${(i === 0 ? "Unison" : i > 0 ? `+${i}` : `${i}`).padEnd(8)}: ${voiceIntervals[i]}\n`);
    return r;
}

/**
 * Shared core logic for analysis after notes have been prepared and voices assigned.
 */
function analyzePreparedNotes(notes: any[], trackName: string, ppq: number, ts: number[], bpm: number, voiceCount: number, transformStats?: any, outputNoteValues?: NoteValueStat[]): TrackAnalysisData {
    const notesRaw: RawNote[] = notes.map(n => ({ 
        midi: n.midi, 
        ticks: n.ticks, 
        durationTicks: n.durationTicks, 
        velocity: n.velocity, 
        name: n.name, 
        time: n.time, 
        duration: n.duration, 
        voiceIndex: (n as any).voiceIndex ?? 0, 
        isOrnament: (n as any).isOrnament 
    }));

    if (notes.length === 0) return { trackName, topNoteValues: [], outputNoteValues: [], gridAlignmentScore: 0, durationConsistencyScore: 0, averageOffsetTicks: 0, totalNotes: 0, detectedGridType: "None", pitchClassHistogram: {}, chordsSustain: [], chordsAttack: [], notesRaw: [], ppq, timeSignature: { numerator: ts[0], denominator: ts[1] }, tempo: bpm, voiceCount, voiceIntervals: {} };

    // Analyze Input Rhythm
    const rhythmStats = analyzeRhythm(notes, ppq, ts);
    
    const histogram: Record<number, number> = {};
    for (let i = 0; i < 12; i++) histogram[i] = 0;
    notes.forEach(n => histogram[n.midi % 12]++);

    const chordsBucketed = detectChordsBucketed(notesRaw, ppq, ts[0], ts[1], 1);

    return {
        trackName, 
        topNoteValues: rhythmStats.topNoteValues, 
        outputNoteValues: outputNoteValues,
        gridAlignmentScore: rhythmStats.gridAlignmentScore, 
        durationConsistencyScore: rhythmStats.durationConsistencyScore, 
        averageOffsetTicks: rhythmStats.averageOffsetTicks, 
        totalNotes: notes.length, 
        detectedGridType: rhythmStats.detectedGridType, 
        pitchClassHistogram: histogram, 
        chordsSustain: detectChordsSustain(notesRaw, ppq, ts[0], ts[1]), 
        chordsAttack: detectChordsAttack(notesRaw, ppq, ts[0], ts[1]), 
        chordsBucketed,
        transformationStats: transformStats,
        notesRaw, 
        ppq, 
        timeSignature: { numerator: ts[0], denominator: ts[1] }, 
        tempo: bpm, 
        voiceCount, 
        voiceIntervals: analyzeVoiceLeading(notesRaw),
        bestKeyPrediction: predictKey(histogram, notes.length, false)[0]?.winner
    };
}

export function analyzeTrack(midi: Midi, trackId: number, options?: ConversionOptions): TrackAnalysisData {
    const track = midi.tracks[trackId];
    const ppq = midi.header.ppq || 480;
    let notes: any[] = track.notes.map(n => ({...n} as any));
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    
    if (options?.detectOrnaments) notes = detectAndTagOrnaments(notes, ppq);
    
    const transformStats = options ? calculateTransformationStats(track, options, ppq) : undefined;
    
    const distribution = distributeToVoices(notes, options, ppq);
    // Use voices for count. Orphans are not considered a "Voice" for SATB analysis purposes.
    const voices = distribution.voices;
    
    // Calculate Output Rhythm Stats
    let outputNoteValues: NoteValueStat[] | undefined = undefined;
    if (options) {
        // Use the newly extracted function from midiTransform to simulate the output notes
        const transformedNotes = getTransformedNotes(track.notes.map(n => ({...n})), options, ppq);
        const outRhythm = analyzeRhythm(transformedNotes, ppq, options.timeSignature ? [options.timeSignature.numerator, options.timeSignature.denominator] : ts);
        outputNoteValues = outRhythm.topNoteValues;
    }

    // Assign voice index
    const noteVoiceMap = new Map<any, number>();
    voices.forEach((vNotes, vIdx) => vNotes.forEach(n => noteVoiceMap.set(n, vIdx)));
    
    // Map orphans to -1
    distribution.orphans.forEach(n => noteVoiceMap.set(n, -1));

    notes.forEach(n => n.voiceIndex = noteVoiceMap.get(n));
    
    return analyzePreparedNotes(
        notes, 
        track.name, 
        ppq, 
        ts, 
        midi.header.tempos[0]?.bpm || 120, 
        voices.length, 
        transformStats,
        outputNoteValues
    );
}

export function analyzeTrackSelection(midi: Midi, trackIds: number[], options?: ConversionOptions): TrackAnalysisData {
    const ppq = midi.header.ppq || 480;
    const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
    const bpm = midi.header.tempos[0]?.bpm || 120;
    
    // Create a virtual combined track
    const newMidi = midi.clone();
    newMidi.tracks = [];
    newMidi.header.setTempo(options?.tempo || bpm);
    newMidi.header.timeSignatures = [{ ticks: 0, timeSignature: [ts[0], ts[1]] }];

    let aggregatedNotes: any[] = [];
    
    trackIds.forEach((id, voiceIndex) => {
        const originalTrack = midi.tracks[id];
        if (!originalTrack) return;
        
        // Use a temporary track to apply transformations (quantization, etc.)
        const tempTrack = newMidi.addTrack(); 
        if (options) {
             copyAndTransformTrackEvents(originalTrack, tempTrack, options, new Set(), newMidi.header, midi.header.ppq);
        } else {
             // Basic copy if no options
             originalTrack.notes.forEach(n => tempTrack.addNote(n));
        }

        // Assign voice index strictly based on track selection order
        tempTrack.notes.forEach(n => {
            (n as any).voiceIndex = voiceIndex;
            aggregatedNotes.push(n);
        });
    });
    
    let outputNoteValues: NoteValueStat[] | undefined = undefined;
    if (options) {
        // Since the notes are already transformed in the block above (inside copyAndTransformTrackEvents), 
        // aggregatedNotes technically REPRESENTS the output state. 
        // So we can just run rhythm analysis on aggregatedNotes.
        const outRhythm = analyzeRhythm(aggregatedNotes, ppq, options.timeSignature ? [options.timeSignature.numerator, options.timeSignature.denominator] : ts);
        outputNoteValues = outRhythm.topNoteValues;
    }
    
    const combinedName = `Selection (${trackIds.length} tracks)`;
    
    return analyzePreparedNotes(
        aggregatedNotes,
        combinedName,
        ppq,
        ts,
        bpm,
        trackIds.length,
        undefined, // Stats are complex to aggregate, skipping for multi-track analysis
        outputNoteValues
    );
}
