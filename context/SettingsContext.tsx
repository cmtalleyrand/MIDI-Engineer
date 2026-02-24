
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Midi } from '@tonejs/midi';
import { ConversionOptions, TempoChangeMode, InversionMode, OutputStrategy, RhythmRule, MelodicInversionOptions, ExportRangeOptions, MidiEventType, AbcKeyExportOptions } from '../types';
import { MUSICAL_TIME_OPTIONS } from '../constants';

interface SettingsState {
    // Tempo & Time
    originalTempo: number | null;
    newTempo: string;
    originalTimeSignature: { numerator: number, denominator: number } | null;
    newTimeSignature: { numerator: string, denominator: string };
    tempoChangeMode: TempoChangeMode;
    originalDuration: number | null;
    newDuration: number | null;
    noteTimeScale: string;

    // Transformation
    transpositionSemitones: string;
    transpositionOctaves: string;
    inversionMode: InversionMode;
    melodicInversion: MelodicInversionOptions;
    exportRange: ExportRangeOptions;
    detectOrnaments: boolean;
    removeShortNotesThresholdIndex: number;

    // Rhythm
    primaryRhythm: RhythmRule;
    secondaryRhythm: RhythmRule;
    quantizeDurationMin: string;
    shiftToMeasure: boolean;
    pruneOverlaps: boolean;
    pruneThresholdIndex: number;

    // Voice Separation
    softOverlapToleranceIndex: number;
    pitchBias: number;
    maxVoices: number;
    disableChords: boolean;
    outputStrategy: OutputStrategy;

    // Key & Mode
    isModalConversionEnabled: boolean;
    modalRoot: number;
    modalModeName: string;
    modalMappings: Record<number, number>;
    keySignatureSpelling: 'auto' | 'sharp' | 'flat';
    abcKeyExport: AbcKeyExportOptions;

    // Filter
    eventsToDelete: Set<MidiEventType>;
}

interface SettingsContextType {
    settings: SettingsState;
    setters: {
        setNewTempo: (val: string) => void;
        setNewTimeSignature: (val: { numerator: string, denominator: string }) => void;
        setTempoChangeMode: (val: TempoChangeMode) => void;
        setTranspositionSemitones: (val: string) => void;
        setTranspositionOctaves: (val: string) => void;
        setNoteTimeScale: (val: string) => void;
        setInversionMode: (val: InversionMode) => void;
        setMelodicInversion: (val: MelodicInversionOptions) => void;
        setExportRange: (val: ExportRangeOptions) => void;
        setPrimaryRhythm: (val: RhythmRule) => void;
        setSecondaryRhythm: (val: RhythmRule) => void;
        setQuantizationValue: (val: string) => void;
        setQuantizeDurationMin: (val: string) => void;
        setShiftToMeasure: (val: boolean) => void;
        setDetectOrnaments: (val: boolean) => void;
        setRemoveShortNotesThresholdIndex: (val: number) => void;
        setPruneOverlaps: (val: boolean) => void;
        setPruneThresholdIndex: (val: number) => void;
        setSoftOverlapToleranceIndex: (val: number) => void;
        setPitchBias: (val: number) => void;
        setMaxVoices: (val: number) => void;
        setDisableChords: (val: boolean) => void;
        setOutputStrategy: (val: OutputStrategy) => void;
        setIsModalConversionEnabled: (val: boolean) => void;
        setModalRoot: (val: number) => void;
        setModalModeName: (val: string) => void;
        setModalMappings: (val: Record<number, number>) => void;
        setKeySignatureSpelling: (val: 'auto' | 'sharp' | 'flat') => void;
        setAbcKeyExport: (val: AbcKeyExportOptions) => void;
        setEventsToDelete: (val: Set<MidiEventType> | ((prev: Set<MidiEventType>) => Set<MidiEventType>)) => void;
    };
    initializeDefaults: (midiData: Midi) => void;
    handleResetSettings: () => void;
    getConversionOptions: () => ConversionOptions | null;
}


const DEFAULT_ABC_KEY_EXPORT: AbcKeyExportOptions = {
    enabled: false,
    tonicLetter: 'C',
    tonicAccidental: '=',
    mode: 'maj',
    additionalAccidentals: []
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (!context) throw new Error('useSettings must be used within a SettingsProvider');
    return context;
};

export const SettingsProvider = ({ children }: { children?: ReactNode }) => {
    // --- State Definitions ---
    const [originalTempo, setOriginalTempo] = useState<number | null>(null);
    const [newTempo, setNewTempo] = useState<string>('');
    const [originalTimeSignature, setOriginalTimeSignature] = useState<{numerator: number, denominator: number} | null>(null);
    const [newTimeSignature, setNewTimeSignature] = useState({numerator: '', denominator: ''});
    const [tempoChangeMode, setTempoChangeMode] = useState<TempoChangeMode>('speed');
    const [originalDuration, setOriginalDuration] = useState<number | null>(null);
    const [newDuration, setNewDuration] = useState<number | null>(null);
    const [noteTimeScale, setNoteTimeScale] = useState<string>('1');

    const [transpositionSemitones, setTranspositionSemitones] = useState<string>('0');
    const [transpositionOctaves, setTranspositionOctaves] = useState<string>('0');
    
    const [inversionMode, setInversionMode] = useState<InversionMode>('off');
    const [melodicInversion, setMelodicInversion] = useState<MelodicInversionOptions>({ enabled: false, startMeasure: 1, endMeasure: 4 });
    const [exportRange, setExportRange] = useState<ExportRangeOptions>({ enabled: false, startMeasure: 1, endMeasure: 8 });
    const [detectOrnaments, setDetectOrnaments] = useState<boolean>(false);
    const [removeShortNotesThresholdIndex, setRemoveShortNotesThresholdIndex] = useState<number>(0);

    const [primaryRhythm, setPrimaryRhythm] = useState<RhythmRule>({ enabled: false, family: 'Simple', minNoteValue: '1/16' });
    const [secondaryRhythm, setSecondaryRhythm] = useState<RhythmRule>({ enabled: false, family: 'Triple', minNoteValue: '1/8t' });
    const [quantizeDurationMin, setQuantizeDurationMin] = useState<string>('off');
    const [shiftToMeasure, setShiftToMeasure] = useState<boolean>(false);
    const [pruneOverlaps, setPruneOverlaps] = useState<boolean>(false);
    const [pruneThresholdIndex, setPruneThresholdIndex] = useState<number>(3);

    const [softOverlapToleranceIndex, setSoftOverlapToleranceIndex] = useState<number>(5);
    const [pitchBias, setPitchBias] = useState<number>(50);
    const [maxVoices, setMaxVoices] = useState<number>(0);
    const [disableChords, setDisableChords] = useState<boolean>(false);
    const [outputStrategy, setOutputStrategy] = useState<OutputStrategy>('combine');

    const [isModalConversionEnabled, setIsModalConversionEnabled] = useState<boolean>(false);
    const [modalRoot, setModalRoot] = useState<number>(0);
    const [modalModeName, setModalModeName] = useState<string>('Major');
    const [modalMappings, setModalMappings] = useState<Record<number, number>>({});
    const [keySignatureSpelling, setKeySignatureSpelling] = useState<'auto' | 'sharp' | 'flat'>('auto');
    const [abcKeyExport, setAbcKeyExport] = useState<AbcKeyExportOptions>(DEFAULT_ABC_KEY_EXPORT);

    const [eventsToDelete, setEventsToDelete] = useState<Set<MidiEventType>>(new Set());

    // --- Helper Logic ---
    const parseRatio = (ratioString: string) => {
        if (!ratioString.includes('/')) return parseFloat(ratioString) || 1;
        const [numerator, denominator] = ratioString.split('/').map(Number);
        if (isNaN(numerator) || isNaN(denominator) || denominator === 0) return 1;
        return numerator / denominator;
    };

    const initializeDefaults = useCallback((midiData: Midi) => {
        const tempo = midiData.header.tempos[0]?.bpm || 120;
        const tsData = midiData.header.timeSignatures[0]?.timeSignature || [4, 4];
        
        setOriginalTempo(tempo);
        setNewTempo(String(Math.round(tempo)));
        setOriginalTimeSignature({ numerator: tsData[0], denominator: tsData[1] });
        setNewTimeSignature({ numerator: String(tsData[0]), denominator: String(tsData[1]) });
        setOriginalDuration(midiData.duration);
        setNewDuration(midiData.duration);
    }, []);

    // Recalculate duration when tempo/time scale changes
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
        setAbcKeyExport(DEFAULT_ABC_KEY_EXPORT);
        setEventsToDelete(new Set());
        const resetMap: Record<number, number> = {};
        for (let i = 0; i < 12; i++) resetMap[i] = i;
        setModalMappings(resetMap);
    }, []);

    useEffect(() => {
         const initialMap: Record<number, number> = {};
         for (let i = 0; i < 12; i++) initialMap[i] = i;
         setModalMappings(initialMap);
    }, []);

    const getConversionOptions = useCallback((): ConversionOptions | null => {
        if (!originalTempo) return null; 

        const parsedTempo = parseInt(newTempo, 10);
        const parsedTsNum = parseInt(newTimeSignature.numerator, 10);
        const parsedTsDenom = parseInt(newTimeSignature.denominator, 10);
        const parsedSemitones = parseInt(transpositionSemitones, 10) || 0;
        const parsedOctaves = parseInt(transpositionOctaves, 10) || 0;

        if (isNaN(parsedTempo) || parsedTempo <= 0) return null;
        if (isNaN(parsedTsNum) || isNaN(parsedTsDenom) || parsedTsNum <= 0 || parsedTsDenom <= 0) return null;

        // Note: For ticks calculation, we assume standard 480 PPQ for UI purposes if midiData isn't immediately available.
        // The pipeline re-scales this if the file differs.
        const ppq = 480; 
        
        const removeThresholdTicks = Math.round(ppq * MUSICAL_TIME_OPTIONS[removeShortNotesThresholdIndex].value);
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
            keySignatureSpelling,
            abcKeyExport
        };
    }, [newTempo, newTimeSignature, transpositionSemitones, transpositionOctaves, originalTempo, tempoChangeMode, noteTimeScale, inversionMode, melodicInversion, exportRange, primaryRhythm, secondaryRhythm, quantizeDurationMin, shiftToMeasure, detectOrnaments, isModalConversionEnabled, modalRoot, modalModeName, modalMappings, removeShortNotesThresholdIndex, pruneOverlaps, pruneThresholdIndex, softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, outputStrategy, keySignatureSpelling, abcKeyExport]);

    const settingsState: SettingsState = {
        originalTempo, newTempo, originalTimeSignature, newTimeSignature, tempoChangeMode, originalDuration, newDuration, noteTimeScale,
        transpositionSemitones, transpositionOctaves, inversionMode, melodicInversion, exportRange, detectOrnaments, removeShortNotesThresholdIndex,
        primaryRhythm, secondaryRhythm, quantizeDurationMin, shiftToMeasure, pruneOverlaps, pruneThresholdIndex,
        softOverlapToleranceIndex, pitchBias, maxVoices, disableChords, outputStrategy,
        isModalConversionEnabled, modalRoot, modalModeName, modalMappings, keySignatureSpelling, abcKeyExport, eventsToDelete
    };

    const setters = {
        setNewTempo, setNewTimeSignature, setTempoChangeMode, setTranspositionSemitones, setTranspositionOctaves, setNoteTimeScale,
        setInversionMode, setMelodicInversion, setExportRange, setPrimaryRhythm, setSecondaryRhythm,
        setQuantizationValue: (val: string) => { 
            if (val === 'off') setPrimaryRhythm({ ...primaryRhythm, enabled: false });
            else setPrimaryRhythm({ ...primaryRhythm, enabled: true, family: 'Simple', minNoteValue: val }); 
        },
        setQuantizeDurationMin, setShiftToMeasure, setDetectOrnaments, setRemoveShortNotesThresholdIndex,
        setPruneOverlaps, setPruneThresholdIndex, setSoftOverlapToleranceIndex, setPitchBias, setMaxVoices,
        setDisableChords, setOutputStrategy, setIsModalConversionEnabled, setModalRoot, setModalModeName,
        setModalMappings, setKeySignatureSpelling, setAbcKeyExport, setEventsToDelete
    };

    return (
        <SettingsContext.Provider value={{ settings: settingsState, setters, initializeDefaults, handleResetSettings, getConversionOptions }}>
            {children}
        </SettingsContext.Provider>
    );
};
