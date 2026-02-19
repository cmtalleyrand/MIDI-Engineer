
// Mode Intervals
export const MODE_INTERVALS: { [key: string]: number[] } = {
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Natural Minor': [0, 2, 3, 5, 7, 8, 10],
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11], // 7th is raised
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'Locrian': [0, 1, 3, 5, 6, 8, 10],
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

// UI Source of Truth for "Default" naming
// This list dictates the Auto-Spelling preference.
// e.g. Index 6 is "F#", so Auto mode will ALWAYS select Sharps for root 6.
export const CHROMATIC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11]; // Pitches for C D E F G A B

export interface ScaleNoteMap {
    letter: string;
    acc: string; 
    octaveOffset: number; 
}

export function getRootInfo(root: number, preferFlats: boolean) {
    // Default Mapping (Standard)
    // 0: C, 1: C#, 2: D, 3: Eb, 4: E, 5: F, 6: F#, 7: G, 8: Ab, 9: A, 10: Bb, 11: B
    const defaults = {
        0: { letterIndex: 0, letterName: 'C' },
        1: { letterIndex: 0, letterName: 'C' }, // C#
        2: { letterIndex: 1, letterName: 'D' },
        3: { letterIndex: 2, letterName: 'E' }, // Eb
        4: { letterIndex: 2, letterName: 'E' },
        5: { letterIndex: 3, letterName: 'F' },
        6: { letterIndex: 3, letterName: 'F' }, // F#
        7: { letterIndex: 4, letterName: 'G' },
        8: { letterIndex: 5, letterName: 'A' }, // Ab
        9: { letterIndex: 5, letterName: 'A' },
        10: { letterIndex: 6, letterName: 'B' }, // Bb
        11: { letterIndex: 6, letterName: 'B' }
    };
    
    // Override based on Enharmonic Preference
    if (preferFlats) {
        if (root === 1) return { letterIndex: 1, letterName: 'D' }; // Db
        if (root === 6) return { letterIndex: 4, letterName: 'G' }; // Gb
        if (root === 11) return { letterIndex: 0, letterName: 'C' }; // Cb
        // 3(Eb), 8(Ab), 10(Bb) are already correct in default map (they map to E, A, B)
    } else {
        // Prefer Sharps
        if (root === 1) return { letterIndex: 0, letterName: 'C' }; // C#
        if (root === 3) return { letterIndex: 1, letterName: 'D' }; // D# instead of Eb
        if (root === 6) return { letterIndex: 3, letterName: 'F' }; // F#
        if (root === 8) return { letterIndex: 4, letterName: 'G' }; // G# instead of Ab
        if (root === 10) return { letterIndex: 5, letterName: 'A' }; // A# instead of Bb
        // 11(B) is standard B. 
    }
    
    // Fallback to default if no specific override logic matched (e.g. natural notes)
    return defaults[root as keyof typeof defaults];
}

export function analyzeScale(root: number, modeName: string, spellingPreference: 'auto' | 'sharp' | 'flat') {
    const intervals = MODE_INTERVALS[modeName] || MODE_INTERVALS['Major'];
    
    // Determine Spelling Preference (Sharp vs Flat)
    let preferFlats = false;

    if (spellingPreference === 'flat') {
        preferFlats = true;
    } else if (spellingPreference === 'sharp') {
        preferFlats = false;
    } else {
        // Auto Mode: STRICTLY follow the default name convention.
        // F# -> Sharps. Eb -> Flats.
        // This prevents algorithmic "optimizations" from overriding user intent.
        const defaultName = CHROMATIC_NAMES[root];
        if (defaultName.includes('b')) {
            preferFlats = true;
        } else if (defaultName.includes('#')) {
            preferFlats = false;
        } else {
            // Natural Root (C, D, E, F, G, A, B)
            // For natural roots, the "preference" mainly affects if we treat the key as Flat-biased or Sharp-biased
            // purely for the sake of specific edge cases or theoretical labeling.
            // However, note generation for natural roots is structurally fixed by the letter sequence.
            // F Major (1b) vs G Major (1#).
            // We can default to Flats for F (index 5) to be safe, though usually irrelevant for note spelling.
            preferFlats = (root === 5);
        }
    }
    
    const scaleMap: Record<number, ScaleNoteMap> = {};
    const scaleAccidentals: Record<string, string> = {}; 

    // Determine Starting Letter based on Preference
    const rootInfo = getRootInfo(root, preferFlats);
    let currentLetterIndex = rootInfo.letterIndex;

    // Generate Scale Map
    intervals.forEach((interval) => {
        const pc = (root + interval) % 12; 
        
        const targetLetter = NOTE_LETTERS[currentLetterIndex];
        const targetNaturalPC = NATURAL_PITCHES[currentLetterIndex];

        let diff = pc - targetNaturalPC;
        if (diff > 6) diff -= 12;
        if (diff < -6) diff += 12;

        let acc = '';
        if (diff === 1) acc = '#';
        else if (diff === 2) acc = '##';
        else if (diff === -1) acc = 'b';
        else if (diff === -2) acc = 'bb';
        
        let offset = 0;
        if (currentLetterIndex === 6 && pc === 0) offset = -1; 
        if (currentLetterIndex === 6 && pc === 1) offset = -1; 
        if (currentLetterIndex === 0 && pc === 11) offset = 1; 
        
        scaleMap[pc] = { letter: targetLetter, acc, octaveOffset: offset };
        scaleAccidentals[targetLetter] = acc;

        currentLetterIndex = (currentLetterIndex + 1) % 7;
    });

    // Key Signature String Construction
    const isMinor = modeName.includes('Minor') || modeName === 'Dorian' || modeName === 'Phrygian' || modeName === 'Locrian';
    let baseKeyMode = isMinor ? 'm' : 'Maj';
    
    let rootName = rootInfo.letterName; 
    
    // Determine accidental of the root itself for the Label
    const rootNaturalPC = NATURAL_PITCHES[rootInfo.letterIndex];
    let rootDiff = root - rootNaturalPC;
    if (rootDiff > 6) rootDiff -= 12;
    if (rootDiff < -6) rootDiff += 12;
    if (rootDiff === 1) rootName += '#';
    if (rootDiff === -1) rootName += 'b';
    
    // ABC K: field requires standard accidentals (FCGDAEB sequence)
    // We construct explicit accidentals (using ^, _, =) to force the exact scale spelling
    // This is safer than relying on standard key signatures for exotic modes
    const explicitMods: string[] = [];

    ['C','D','E','F','G','A','B'].forEach(letter => {
        const required = scaleAccidentals[letter] || ''; 
        // We compare against C Major (Natural) as baseline for explicit definition
        if (required !== '') {
            let symbol = '';
            if (required === '#') symbol = '^';
            else if (required === '##') symbol = '^^';
            else if (required === 'b') symbol = '_';
            else if (required === 'bb') symbol = '__';
            
            explicitMods.push(`${symbol}${letter}`);
        }
    });
    
    const keyString = `K:${rootName}${baseKeyMode}`;

    return { scaleMap, keyString, preferFlats };
}
