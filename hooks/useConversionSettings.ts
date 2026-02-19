
import { useState, useCallback, useEffect } from 'react';
import { ConversionOptions, TempoChangeMode, InversionMode, OutputStrategy, RhythmRule, MelodicInversionOptions, ExportRangeOptions, MidiEventType } from '../types';
import { MUSICAL_TIME_OPTIONS } from '../constants';
import { Midi } from '@tonejs/midi';

export const useConversionSettings = (midiData: Midi | null) => {
    // Tempo & Time
    const [originalTempo, setOriginalTempo] = useState<number | null>(null);
    const [newTempo, setNewTempo] = useState<string>('');
    const [originalTimeSignature, setOriginalTimeSignature] = useState<{numerator: number, denominator: number} | null>(null);
    const [newTimeSignature, setNewTimeSignature] = useState({numerator: '', denominator: ''});
    const [tempoChangeMode, setTempoChangeMode] = useState<TempoChangeMode>('speed');
    const [originalDuration, setOriginalDuration] = useState<number | null>(null);
    const [newDuration, setNewDuration] = useState<number | null>(null);
    const [noteTimeScale, setNoteTimeScale] = useState<string>('1');

    // Transposition
    const [transpositionSemitones, setTranspositionSemitones] = useState<string>('0');
    const [transpositionOctaves, setTranspositionOctaves] = useState<string>('0');

    // Transformation
    const [inversionMode, setInversionMode] = useState<InversionMode>('off');
    const [melodicInversion, setMelodicInversion] = useState<MelodicInversionOptions>({ enabled: false, startMeasure: 1, endMeasure: 4 });
    const [exportRange, setExportRange] = useState<ExportRangeOptions>({ enabled: false, startMeasure: 1, endMeasure: 8 });
    const [detectOrnaments, setDetectOrnaments] = useState<boolean>(false);
    const [removeShortNotesThresholdIndex, setRemoveShortNotesThresholdIndex] = useState<number>(0);

    // Rhythm / Quantization
    const [primaryRhythm, setPrimaryRhythm] = useState<RhythmRule>({ enabled: false, family: 'Simple', minNoteValue: '1/16' });
    const [secondaryRhythm, setSecondaryRhythm] = useState<RhythmRule>({ enabled: false, family: 'Triple', minNoteValue: '1/8t' });
    const [quantizeDurationMin, setQuantizeDurationMin] = useState<string>('off');
    const [shiftToMeasure, setShiftToMeasure] = useState<boolean>(false);
    const [pruneOverlaps, setPruneOverlaps] = useState<boolean>(false);
    const [pruneThresholdIndex, setPruneThresholdIndex] = useState<number>(3); 

    // Voice Separation
    const [softOverlapToleranceIndex, setSoftOverlapToleranceIndex] = useState<number>(5); 
    const [pitchBias, setPitchBias] = useState<number>(50); 
    const [maxVoices, setMaxVoices] = useState<number>(0); 
    const [disableChords, setDisableChords] = useState<boolean>(false);
    const [outputStrategy, setOutputStrategy] = useState<OutputStrategy>('combine');

    // Key & Mode
    const [isModalConversionEnabled, setIsModalConversionEnabled] = useState<boolean>(false);
    const [modalRoot, setModalRoot] = useState<number>(0); 
    const [modalModeName, setModalModeName] = useState<string>('Major');
    const [modalMappings, setModalMappings] = useState<Record<number, number>>({});
    const [keySignatureSpelling, setKeySignatureSpelling] = useState<'auto' | 'sharp' | 'flat'>('auto');

    // Filtering
    const [eventsToDelete, setEventsToDelete] = useState<Set<MidiEventType>>(new Set());

    // Helper: Parse scale ratio
    const parseRatio = (ratioString: string) => {
        if (!ratioString.includes('/')) return parseFloat(ratioString) || 1;
        const [numerator, denominator] = ratioString.split('/').map(Number);
        if (isNaN(numerator) || isNaN(denominator) || denominator === 0) return 1;
        return numerator / denominator;
    };

    // Initialization Effect
    useEffect(() => {
        if (midiData) {
            const tempo = midiData.header.tempos[0]?.bpm || 120;
            const tsData = midiData.header.timeSignatures[0]?.timeSignature || [4, 4];
            
            setOriginalTempo(tempo);
            setNewTempo(String(Math.round(tempo)));
            setOriginalTimeSignature({ numerator: tsData[0], denominator: tsData[1] });
            setNewTimeSignature({ numerator: String(tsData[0]), denominator: String(tsData[1]) });
            setOriginalDuration(midiData.duration);
            setNewDuration(midiData.duration);
        }
    }, [midiData]);

    // Duration Recalculation Effect
    useEffect(() => {
        if (!originalTempo || !originalDuration) return;
        const parsedTempo = parseInt(newTempo, 10);
        const parsedScale = parseRatio(noteTimeScale);
        let duration = originalDuration * parsedScale;
        if (!isNaN(parsedTempo) && parsedTempo > 0) {
            if (tempoChangeMode === 'speed') {
                setNewDuration(duration * (originalTempo / parsedTempo));
            } else {
                setNewDuration(duration);
            }
        } else {
            setNewDuration(duration);
        }
    }, [newTempo, tempoChangeMode, originalTempo, originalDuration, noteTimeScale]);
    
    // Reset Logic
    const handleResetSettings = useCallback(() => {
        setOriginalTempo(null);
        setNewTempo('');
        setOriginalTimeSignature(null);
        setNewTimeSignature({numerator: '', denominator: ''});
        setTempoChangeMode('speed');
        setOriginalDuration(null);
        setNewDuration(null);
        setTranspositionSemitones('0');
        setTranspositionOctaves('0');
        setNoteTimeScale('1');
        setInversionMode('off');
        setMelodicInversion({ enabled: false, startMeasure: 1, endMeasure: 4 });
        setExportRange({ enabled: false, startMeasure: 1, endMeasure: 8 });
        setPrimaryRhythm({ enabled: false, family: 'Simple', minNoteValue: '1/16' });
        setSecondaryRhythm({ enabled: false, family: 'Triple', minNoteValue: '1/8t' });
        setQuantizeDurationMin('off');
        setShiftToMeasure(false);
        setDetectOrnaments(false);
        setRemoveShortNotesThresholdIndex(0);
        setPruneOverlaps(false);
        setPruneThresholdIndex(3);
        setSoftOverlapToleranceIndex(5);
        setPitchBias(50);
        setMaxVoices(0);
        setDisableChords(false);
        setOutputStrategy('combine');
        setIsModalConversionEnabled(false);
        setModalRoot(0);
        setModalModeName('Major');
        setKeySignatureSpelling('auto');
        setEventsToDelete(new Set());
        const resetMap: Record<number, number> = {};
        for (let i = 0; i < 12; i++) resetMap[i] = i;
        setModalMappings(resetMap);
    }, []);

    // Initial Modal Mapping
    useEffect(() => {
         const initialMap: Record<number, number> = {};
         for (let i = 0; i < 12; i++) initialMap[i] = i;
         setModalMappings(initialMap);
    }, []);

    const getConversionOptions = useCallback((): ConversionOptions | null => {
        if (!originalTempo || !midiData) return null;

        const parsedTempo = parseInt(newTempo, 10);
        const parsedTsNum = parseInt(newTimeSignature.numerator, 10);
        const parsedTsDenom = parseInt(newTimeSignature.denominator, 10);
        const parsedSemitones = parseInt(transpositionSemitones, 10) || 0;
        const parsedOctaves = parseInt(transpositionOctaves, 10) || 0;

        if (isNaN(parsedTempo) || parsedTempo <= 0) return null;
        if (isNaN(parsedTsNum) || isNaN(parsedTsDenom) || parsedTsNum <= 0 || parsedTsDenom <= 0) return null;

        const removeThresholdTicks = Math.round(midiData.header.ppq * MUSICAL_TIME_OPTIONS[removeShortNotesThresholdIndex].value);
        const softOverlapToleranceTicks = MUSICAL_TIME_OPTIONS[softOverlapToleranceIndex].value;
        const quantizationValue = primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off';

        return {
            tempo: parsedTempo,
            timeSignature: { numerator: parsedTsNum, denominator: parsedTsDenom },
            tempoChangeMode,
            originalTempo,
            transposition: (parsedOctaves * 12) + parsedSemitones,
            noteTimeScale: parseRatio(noteTimeScale),
            inversionMode,
            melodicInversion,
            exportRange,
            primaryRhythm,
            secondaryRhythm,
            quantizationValue, 
            quantizeDurationMin,
            shiftToMeasure,
            detectOrnaments,
            modalConversion: {
                enabled: isModalConversionEnabled,
                root: modalRoot,
                modeName: modalModeName,
                mappings: modalMappings
            },
            removeShortNotesThreshold: removeThresholdTicks,
            pruneOverlaps,
            pruneThresholdIndex,
            voiceSeparationOverlapTolerance: softOverlapToleranceTicks,
            voiceSeparationPitchBias: pitchBias,
            voiceSeparationMaxVoices: maxVoices,
            voiceSeparationDisableChords: disableChords,
            outputStrategy,
            keySignatureSpelling
        };
    }, [newTempo, newTimeSignature, transpositionSemitones, transpositionOctaves, originalTempo, tempoChangeMode, noteTimeScale, inversionMode, melodicInversion, exportRange, primaryRhythm, secondaryRhythm, quantizeDurationMin, shiftToMeasure, detectOrnaments, isModalConversionEnabled, modalRoot, modalModeName, modalMappings, removeShortNotesThresholdIndex, pruneOverlaps, pruneThresholdIndex, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, outputStrategy, keySignatureSpelling, midiData]);

    return {
        settings: {
            originalTempo, newTempo, originalTimeSignature, newTimeSignature, tempoChangeMode, originalDuration, newDuration,
            transpositionSemitones, transpositionOctaves, noteTimeScale, inversionMode, melodicInversion, exportRange,
            primaryRhythm, secondaryRhythm, quantizationValue: primaryRhythm.enabled ? primaryRhythm.minNoteValue : 'off',
            quantizeDurationMin, shiftToMeasure, detectOrnaments, removeShortNotesThresholdIndex, pruneOverlaps,
            pruneThresholdIndex, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, outputStrategy,
            isModalConversionEnabled, modalRoot, modalModeName, modalMappings, keySignatureSpelling, eventsToDelete
        },
        setters: {
            setNewTempo, setNewTimeSignature, setTempoChangeMode, setTranspositionSemitones, setTranspositionOctaves,
            setNoteTimeScale, setInversionMode, setMelodicInversion, setExportRange, setPrimaryRhythm, setSecondaryRhythm,
            setQuantizationValue: (val: string) => { 
                if (val === 'off') setPrimaryRhythm({ ...primaryRhythm, enabled: false });
                else setPrimaryRhythm({ ...primaryRhythm, enabled: true, family: 'Simple', minNoteValue: val }); 
            },
            setQuantizeDurationMin, setShiftToMeasure, setDetectOrnaments, setRemoveShortNotesThresholdIndex,
            setPruneOverlaps, setPruneThresholdIndex, setSoftOverlapToleranceIndex, setPitchBias, setMaxVoices,
            setDisableChords, setOutputStrategy, setIsModalConversionEnabled, setModalRoot, setModalModeName,
            setModalMappings, setKeySignatureSpelling, setEventsToDelete
        },
        handleResetSettings,
        getConversionOptions
    };
};
