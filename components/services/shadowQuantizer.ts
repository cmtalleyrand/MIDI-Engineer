
import { RawNote, RhythmRule, RhythmFamily } from '../../types';
import { getQuantizationTickValue } from './midiTransform';

enum ShadowConfidence {
    CERTAIN = 3,
    WEAK_PRIMARY = 2,
    AMBIGUOUS = 1
}

interface ShadowGridCandidate {
    ticks: number;
    error: number;
    family: RhythmFamily;
    noteValue: string;
}

interface ShadowNoteAnalysis {
    original: RawNote;
    bestCandidate: ShadowGridCandidate;
    confidence: ShadowConfidence;
    alternatives: ShadowGridCandidate[];
}

/**
 * Calculates the tick interval for the smallest subdivision allowed by a Rhythm Rule.
 */
function getGridQuantum(ppq: number, rule: RhythmRule): number {
    if (!rule.enabled) return 0;
    return getQuantizationTickValue(rule.minNoteValue, ppq);
}

/**
 * Finds the closest grid point for a given time in ticks against a specific grid quantum.
 */
function getClosestGridPoint(ticks: number, quantum: number, family: RhythmFamily, noteValue: string): ShadowGridCandidate {
    if (quantum <= 0) return { ticks, error: 0, family, noteValue };
    const snapped = Math.round(ticks / quantum) * quantum;
    return {
        ticks: snapped,
        error: Math.abs(ticks - snapped),
        family,
        noteValue
    };
}

/**
 * Pass 1: Analyze each note against Primary and Secondary grids.
 * Determines "Certainty" based on error margins.
 */
function analyzeShadowCertainty(notes: RawNote[], ppq: number, primary: RhythmRule, secondary: RhythmRule): ShadowNoteAnalysis[] {
    const primaryQuantum = getGridQuantum(ppq, primary);
    const secondaryQuantum = getGridQuantum(ppq, secondary);
    
    // Absolute tolerance for "Certain" (e.g., 5% of a 1/16th note at 480 PPQ is ~6 ticks)
    // We'll use a dynamic tolerance based on the finer grid.
    const minQuantum = secondary.enabled && secondaryQuantum > 0 ? Math.min(primaryQuantum, secondaryQuantum) : primaryQuantum;
    const absTolerance = Math.max(minQuantum * 0.15, 5); // 15% slop allowed

    return notes.map(note => {
        // 1. Get Candidates
        const candidates: ShadowGridCandidate[] = [];
        
        // Primary
        if (primaryQuantum > 0) {
            candidates.push(getClosestGridPoint(note.ticks, primaryQuantum, primary.family, primary.minNoteValue));
        }
        
        // Secondary
        if (secondary.enabled && secondaryQuantum > 0) {
            candidates.push(getClosestGridPoint(note.ticks, secondaryQuantum, secondary.family, secondary.minNoteValue));
        }

        // If no quantization, return as is
        if (candidates.length === 0) {
             return {
                 original: note,
                 bestCandidate: { ticks: note.ticks, error: 0, family: 'Simple', noteValue: 'Off' },
                 confidence: ShadowConfidence.CERTAIN,
                 alternatives: []
             };
        }

        // Sort by Error
        candidates.sort((a, b) => a.error - b.error);
        const best = candidates[0];
        const secondBest = candidates[1]; // May be undefined if only primary enabled

        let confidence = ShadowConfidence.AMBIGUOUS;

        // 2a. Absolute Precision Gate
        if (best.error <= absTolerance) {
            confidence = ShadowConfidence.CERTAIN;
        } 
        // 2b. Relative Clarity Gate (The "50% Rule")
        else if (secondBest) {
            if (best.error <= 0.5 * secondBest.error) {
                // It's significantly closer to one than the other, but still sloppy
                confidence = ShadowConfidence.WEAK_PRIMARY; // Tentative, check below
            } else {
                confidence = ShadowConfidence.AMBIGUOUS;
            }
        } 
        // 2c. Primary Bias Fallback (Single Grid)
        else {
            // Only primary exists, but error is high > tolerance
            confidence = ShadowConfidence.WEAK_PRIMARY;
        }

        // Apply Primary Bias adjustment for Weak signals
        if (confidence === ShadowConfidence.AMBIGUOUS) {
            // If the best match IS Primary, bump it to Weak Primary
            if (best.family === primary.family) {
                confidence = ShadowConfidence.WEAK_PRIMARY;
            }
        }

        return {
            original: note,
            bestCandidate: best,
            confidence,
            alternatives: candidates.slice(1)
        };
    });
}

/**
 * Pass 2: Resolve Grid Conflicts.
 * Currently implements a simplified cost logic:
 * - If Certain, keep best.
 * - If Weak/Ambiguous, prefer Primary grid if error difference is small.
 * - Future: Check density spikes and overlap.
 */
function resolveGridConflicts(analyses: ShadowNoteAnalysis[]): RawNote[] {
    return analyses.map(analysis => {
        const { original, bestCandidate, confidence, alternatives } = analysis;
        
        // Simple Resolution: Just take the best candidate for now.
        // In full implementation, we would look at neighbors here.
        
        // Example "Contextual Inconsistency" logic stub:
        // If AMBIGUOUS and Best is 'Triple' but we are in a 'Simple' section, switch to Simple alternative?
        // For now, we trust the Pass 1 sorting (Error minimization).
        
        return {
            ...original,
            ticks: bestCandidate.ticks,
            // We also need to quantize duration to the same grid quantum
            // This is a simplification; ideally duration uses the same logic.
            // For now, allow midiTransform to handle duration quantization or apply here.
        };
    });
}

/**
 * Main Entry Point for Shadow Quantization
 */
export function applyShadowQuantization(notes: RawNote[], ppq: number, primary: RhythmRule, secondary: RhythmRule): RawNote[] {
    if (!primary.enabled) return notes;

    // Pass 1: Analysis
    const analyses = analyzeShadowCertainty(notes, ppq, primary, secondary);

    // Pass 2: Resolution
    const resolvedNotes = resolveGridConflicts(analyses);

    // Duration Quantization (Applied to resolved notes)
    // We use the grid of the chosen candidate for duration snapping
    resolvedNotes.forEach((note, idx) => {
        const analysis = analyses[idx];
        const chosenQuantum = getQuantizationTickValue(analysis.bestCandidate.noteValue, ppq);
        if (chosenQuantum > 0) {
            let dur = Math.round(note.durationTicks / chosenQuantum) * chosenQuantum;
            if (dur === 0) dur = chosenQuantum;
            note.durationTicks = dur;
        }
    });

    return resolvedNotes;
}
