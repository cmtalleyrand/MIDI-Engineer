

export interface TrackInfo {
  id: number;
  name: string;
  instrument: {
    name: string;
    number: number;
    family: string;
  };
  noteCount: number;
  ornamentCount?: number;
}

export enum AppState {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  ERROR = 'ERROR',
  COMBINING = 'COMBINING',
  SUCCESS = 'SUCCESS',
  DOWNLOAD_ERROR = 'DOWNLOAD_ERROR',
}

export type MidiEventType = 'pitchBend' | 'controlChange' | 'programChange';

export interface MidiEventCounts {
  pitchBend: number;
  controlChange: number;
  programChange: number;
}

export type TempoChangeMode = 'speed' | 'time';

export type InversionMode = 'off' | 'global' | '1beat' | '2beats' | 'measure' | '2measures' | '4measures' | '8measures';

export type OutputStrategy = 'combine' | 'separate_tracks' | 'separate_voices';

export type RhythmFamily = 'Simple' | 'Triple' | 'Quintuplet';

export interface RhythmRule {
    enabled: boolean;
    family: RhythmFamily;
    minNoteValue: string; // e.g. '1/16'
}

export interface ModalConversionOptions {
    enabled: boolean;
    root: number; // 0-11 (C=0)
    modeName: string; // 'Major', 'Minor', etc.
    // Map source interval (0-11) relative to root -> target interval (0-11)
    mappings: Record<number, number>; 
}

export type AbcAccidental = '__' | '_' | '=' | '^' | '^^';

export interface AbcAdditionalAccidental {
    letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';
    accidental: AbcAccidental;
}

export interface AbcKeyExportOptions {
    enabled: boolean;
    tonicLetter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
    tonicAccidental: AbcAccidental;
    mode: string;
    additionalAccidentals: AbcAdditionalAccidental[];
}

export interface MelodicInversionOptions {
    enabled: boolean;
    startMeasure: number; // 1-based
    endMeasure: number;   // 1-based, inclusive
}

export interface InversionStats {
    totalNotes: number;
    anchorNoteName: string;
    hasPolyphony: boolean;
    rangeStartTick: number;
    rangeEndTick: number;
}

export interface ExportRangeOptions {
    enabled: boolean;
    startMeasure: number;
    endMeasure: number;
}

export interface ConversionOptions {
    tempo: number;
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    tempoChangeMode: TempoChangeMode;
    originalTempo: number;
    transposition: number;
    noteTimeScale: number;
    
    // Retrograde (Time Inversion)
    inversionMode: InversionMode; 
    
    // New Melodic Inversion
    melodicInversion: MelodicInversionOptions;

    // Export Range
    exportRange: ExportRangeOptions;
    
    // Shadow Grid Options
    primaryRhythm: RhythmRule;
    secondaryRhythm: RhythmRule;
    
    // Legacy mapping (calculated from primary)
    quantizationValue: string; 
    
    quantizeDurationMin: string; // New setting for Minimum Note Value
    shiftToMeasure: boolean;
    detectOrnaments: boolean; 
    modalConversion: ModalConversionOptions;
    removeShortNotesThreshold: number; 
    pruneOverlaps: boolean; 
    pruneThresholdIndex: number;
    // Voice Separation Logic
    voiceSeparationOverlapTolerance: number; // Musical time multiplier (e.g. 0.25 for 1/16)
    voiceSeparationPitchBias: number; // 0 to 100, determines preference for vertical sorting vs horizontal smoothness
    voiceSeparationMaxVoices: number; // 0 = Auto, >0 = Forced Limit
    voiceSeparationDisableChords: boolean; // If true, never merge notes into chords
    // Export Options
    outputStrategy: OutputStrategy;
    
    // Key Signature Preference
    keySignatureSpelling: 'auto' | 'sharp' | 'flat';
    abcKeyExport: AbcKeyExportOptions;
}

export interface VoiceAllocationMath {
    voiceName: string;
    voiceCentroid: string | number;
    noteMidi: number;
    delta: number;
    costSquared: number;
}

export interface VoiceExplanation {
    phase: string;
    text?: string;
    assignedVoice?: number;
    winner?: number;
    math?: VoiceAllocationMath[];
    costs?: { voice: string; cost: string | number; details: string }[];
    reason?: string;
}

export interface PianoRollTrackData {
    notes: {
        midi: number;
        ticks: number;
        durationTicks: number;
        velocity: number;
        name: string;
        voiceIndex?: number;
        isOrnament?: boolean;
        explanation?: VoiceExplanation; // Debug info for voice allocation
        shadowDecision?: RawNote['shadowDecision'];
    }[]; 
    name: string;
    ppq: number;
    timeSignature: {
        numerator: number;
        denominator: number;
    };
}

export interface NoteValueStat {
    name: string;
    count: number;
    percentage: number;
    standardMultiplier: number; // e.g., 1 for quarter, 0.5 for eighth
}

export interface ChordMatch {
    name: string;
    root: string;
    quality: string;
    bass?: string;
    inversion?: string;
    score: number;
    missingNotes: string[];
}

export interface ChordEvent {
    timestamp: number; // Seconds (approx start time)
    measure: number;   // Measure number (1-based)
    formattedTime: string; // e.g. "Meas 1 | Beat 1.00"
    name: string;      // e.g. "C Maj"
    root: string;
    quality: string;
    bass?: string;     // For inversions, e.g. "E" in C/E
    inversion?: string; // e.g. "/E"
    ticks: number;     // MIDI ticks
    constituentNotes: string[]; // e.g. ["C3", "E3", "G3"]
    missingNotes: string[]; // e.g. ["G"] (Note names)
    alternatives: ChordMatch[]; // Top N alternative detections
}

export interface RawNote {
    midi: number;
    ticks: number;
    durationTicks: number;
    velocity: number;
    name: string;
    time?: number;
    duration?: number;
    voiceIndex?: number;
    isOrnament?: boolean;
    explanation?: VoiceExplanation; // Debug info for voice allocation logic
    shadowDecision?: {
        confidence: 'Certain' | 'Weak_Primary' | 'Ambiguous';
        pass1BestFamily: RhythmFamily;
        selectedFamily: RhythmFamily;
        selectedNoteValue: string;
        selectedOnsetTicks: number;
        selectedDurationTicks: number;
        objectiveBreakdown: {
            noteRetention: number;
            ordering: number;
            movement: number;
            overlapAndBlip: number;
            confidenceAwareEdit: number;
            total: number;
        };
        conflictTypes: Array<'type1_unison_overlap' | 'type2_polyphony_blip' | 'type3_contextual_rhythm'>;
        accommodationApplied?: {
            shortenedFrom: number;
            shortenedTo: number;
            reason: string;
        };
        alternatives: Array<{
            family: RhythmFamily;
            noteValue: string;
            onsetTicks: number;
            durationTicks: number;
            totalScore: number;
        }>;
    };
}

export interface TransformationStats {
    notesQuantized: number;
    notesDurationChanged: number;
    notesExtended: number;
    notesShortened: number;
    avgShiftTicks: number;
    notesRemovedDuration: number;
    notesRemovedOverlap: number;
    notesTruncatedOverlap: number;
    totalNotesInput: number;
    totalNotesOutput: number;
    inputGridAlignment: number;
    outputGridAlignment: number;
}

export interface TrackAnalysisData {
    trackName: string;
    topNoteValues: NoteValueStat[];
    outputNoteValues?: NoteValueStat[]; // Distribution after processing
    gridAlignmentScore: number; // 0 to 1 (1 being perfectly quantized)
    durationConsistencyScore: number; // 0 to 1 (1 being perfect durations)
    averageOffsetTicks: number;
    totalNotes: number;
    detectedGridType: string; // e.g. "1/16 Standard", "1/8 Triplet"
    pitchClassHistogram: Record<number, number>; // count per pitch class 0-11
    chordsSustain: ChordEvent[]; // Detection based on all active voices
    chordsAttack: ChordEvent[];  // Detection based on new note attacks only
    chordsHybrid?: ChordEvent[]; // Detection based on hybrid strategy
    chordsBucketed?: ChordEvent[]; // Harmonic Rhythm Normalization
    bestKeyPrediction?: { root: number, mode: string, score: number };
    
    // Voice Interval Analysis (Histogram of semitone jumps)
    voiceIntervals: Record<number, number>; 
    
    // Transformation Impact
    transformationStats?: TransformationStats;

    // Raw data for re-calculation (using RawNote interface to guarantee property access)
    notesRaw: RawNote[]; 
    ppq: number;
    timeSignature: { numerator: number, denominator: number };
    tempo: number;
    
    // Voice info
    voiceCount: number;
}
