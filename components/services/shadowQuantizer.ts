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

interface ShadowDurationCandidate {
    durationTicks: number;
    error: number;
    family: RhythmFamily;
    noteValue: string;
}

interface ShadowHypothesis {
    onset: ShadowGridCandidate;
    duration: ShadowDurationCandidate;
    family: RhythmFamily;
    noteValue: string;
    quantumTicks: number;
    onsetError: number;
    durationError: number;
}

interface ShadowNoteAnalysis {
    original: RawNote;
    bestCandidate: ShadowHypothesis;
    confidence: ShadowConfidence;
    alternatives: ShadowHypothesis[];
}

interface EvaluatedHypothesis {
    hypothesis: ShadowHypothesis;
    objective: {
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
}

/**
 * Calculates the tick interval for the smallest subdivision allowed by a Rhythm Rule.
 */
function getGridQuantum(ppq: number, rule: RhythmRule): number {
    if (!rule.enabled) return 0;
    return getQuantizationTickValue(rule.minNoteValue, ppq);
}

function clampDuration(durationTicks: number, quantum: number): number {
    if (quantum <= 0) return Math.max(1, durationTicks);
    const snapped = Math.round(durationTicks / quantum) * quantum;
    return Math.max(quantum, snapped);
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

function getClosestDuration(durationTicks: number, quantum: number, family: RhythmFamily, noteValue: string): ShadowDurationCandidate {
    if (quantum <= 0) return { durationTicks, error: 0, family, noteValue };
    const snapped = clampDuration(durationTicks, quantum);
    return {
        durationTicks: snapped,
        error: Math.abs(durationTicks - snapped),
        family,
        noteValue
    };
}

function getConfidenceLabel(confidence: ShadowConfidence): 'Certain' | 'Weak_Primary' | 'Ambiguous' {
    if (confidence === ShadowConfidence.CERTAIN) return 'Certain';
    if (confidence === ShadowConfidence.WEAK_PRIMARY) return 'Weak_Primary';
    return 'Ambiguous';
}

/**
 * Pass 1: Analyze each note against Primary and Secondary grids.
 */
function analyzeShadowCertainty(notes: RawNote[], ppq: number, primary: RhythmRule, secondary: RhythmRule): ShadowNoteAnalysis[] {
    const primaryQuantum = getGridQuantum(ppq, primary);
    const secondaryQuantum = getGridQuantum(ppq, secondary);

    const minQuantum = secondary.enabled && secondaryQuantum > 0 ? Math.min(primaryQuantum, secondaryQuantum) : primaryQuantum;
    const absTolerance = Math.max(minQuantum * 0.15, 5);

    return notes.map(note => {
        const hypotheses: ShadowHypothesis[] = [];

        if (primaryQuantum > 0) {
            const onset = getClosestGridPoint(note.ticks, primaryQuantum, primary.family, primary.minNoteValue);
            const duration = getClosestDuration(note.durationTicks, primaryQuantum, primary.family, primary.minNoteValue);
            hypotheses.push({
                onset,
                duration,
                family: primary.family,
                noteValue: primary.minNoteValue,
                quantumTicks: primaryQuantum,
                onsetError: onset.error,
                durationError: duration.error
            });
        }

        if (secondary.enabled && secondaryQuantum > 0) {
            const onset = getClosestGridPoint(note.ticks, secondaryQuantum, secondary.family, secondary.minNoteValue);
            const duration = getClosestDuration(note.durationTicks, secondaryQuantum, secondary.family, secondary.minNoteValue);
            hypotheses.push({
                onset,
                duration,
                family: secondary.family,
                noteValue: secondary.minNoteValue,
                quantumTicks: secondaryQuantum,
                onsetError: onset.error,
                durationError: duration.error
            });
        }

        if (hypotheses.length === 0) {
            const passthrough: ShadowHypothesis = {
                onset: { ticks: note.ticks, error: 0, family: 'Simple', noteValue: 'Off' },
                duration: { durationTicks: note.durationTicks, error: 0, family: 'Simple', noteValue: 'Off' },
                family: 'Simple',
                noteValue: 'Off',
                quantumTicks: 1,
                onsetError: 0,
                durationError: 0
            };
            return {
                original: note,
                bestCandidate: passthrough,
                confidence: ShadowConfidence.CERTAIN,
                alternatives: []
            };
        }

        hypotheses.sort((a, b) => (a.onsetError + a.durationError) - (b.onsetError + b.durationError));
        const best = hypotheses[0];
        const secondBest = hypotheses[1];

        let confidence = ShadowConfidence.AMBIGUOUS;
        if (best.onsetError <= absTolerance && best.durationError <= absTolerance) {
            confidence = ShadowConfidence.CERTAIN;
        } else if (secondBest) {
            const bestError = best.onsetError + best.durationError;
            const secondError = secondBest.onsetError + secondBest.durationError;
            if (bestError <= 0.5 * secondError) {
                confidence = ShadowConfidence.WEAK_PRIMARY;
            } else {
                confidence = ShadowConfidence.AMBIGUOUS;
            }
        } else {
            confidence = ShadowConfidence.WEAK_PRIMARY;
        }

        if (confidence === ShadowConfidence.AMBIGUOUS && best.family === primary.family) {
            confidence = ShadowConfidence.WEAK_PRIMARY;
        }

        return {
            original: note,
            bestCandidate: best,
            confidence,
            alternatives: hypotheses.slice(1)
        };
    });
}

function countUnisonOverlaps(notes: RawNote[]): number {
    let overlaps = 0;
    for (let i = 0; i < notes.length; i++) {
        for (let j = i + 1; j < notes.length; j++) {
            if (notes[i].midi !== notes[j].midi) continue;
            const aStart = notes[i].ticks;
            const aEnd = notes[i].ticks + notes[i].durationTicks;
            const bStart = notes[j].ticks;
            const bEnd = notes[j].ticks + notes[j].durationTicks;
            if (aStart < bEnd && bStart < aEnd) overlaps += 1;
        }
    }
    return overlaps;
}

function countShortPolyphonyBlips(notes: RawNote[], ppq: number): number {
    const events: Array<{ tick: number; delta: number }> = [];
    notes.forEach(n => {
        events.push({ tick: n.ticks, delta: 1 });
        events.push({ tick: n.ticks + n.durationTicks, delta: -1 });
    });
    events.sort((a, b) => a.tick - b.tick || b.delta - a.delta);

    let active = 0;
    let spikeStart: number | null = null;
    let blips = 0;
    const oneBeat = ppq;

    for (const event of events) {
        const prev = active;
        active += event.delta;
        if (prev <= 1 && active > 1) {
            spikeStart = event.tick;
        }
        if (prev > 1 && active <= 1 && spikeStart !== null) {
            if (event.tick - spikeStart < oneBeat) blips += 1;
            spikeStart = null;
        }
    }

    return blips;
}

function localDominantFamily(analyses: ShadowNoteAnalysis[], index: number): RhythmFamily {
    const start = Math.max(0, index - 3);
    const end = Math.min(analyses.length - 1, index + 3);
    const counts = new Map<RhythmFamily, number>();
    for (let i = start; i <= end; i++) {
        const family = analyses[i].bestCandidate.family;
        counts.set(family, (counts.get(family) ?? 0) + 1);
    }

    let winner: RhythmFamily = analyses[index].bestCandidate.family;
    let best = -1;
    counts.forEach((v, k) => {
        if (v > best) {
            best = v;
            winner = k;
        }
    });
    return winner;
}

function evaluateHypothesisAtIndex(
    index: number,
    analyses: ShadowNoteAnalysis[],
    chosen: RawNote[],
    candidate: ShadowHypothesis,
    ppq: number
): EvaluatedHypothesis {
    const original = analyses[index].original;
    const confidence = analyses[index].confidence;
    const baseline = analyses[index].bestCandidate;

    const testNotes = chosen.map(n => ({ ...n }));
    let note = { ...original, ticks: candidate.onset.ticks, durationTicks: candidate.duration.durationTicks };
    const conflictTypes: Array<'type1_unison_overlap' | 'type2_polyphony_blip' | 'type3_contextual_rhythm'> = [];
    let accommodationApplied: EvaluatedHypothesis['accommodationApplied'] | undefined;

    const minDurationTicks = Math.max(1, candidate.quantumTicks);
    let overlapPenalty = 0;
    let overlapCount = 0;

    for (const existing of testNotes) {
        if (existing.midi !== note.midi) continue;
        const noteEnd = note.ticks + note.durationTicks;
        const existingEnd = existing.ticks + existing.durationTicks;
        if (note.ticks < existingEnd && existing.ticks < noteEnd) {
            overlapCount += 1;
            conflictTypes.push('type1_unison_overlap');

            // Type 1 accommodation-first: shorten longer note above MNV before merge-like behavior.
            const overlapAmount = Math.min(noteEnd, existingEnd) - Math.max(note.ticks, existing.ticks);
            if (overlapAmount > 0) {
                if (note.durationTicks >= existing.durationTicks) {
                    const shortened = Math.max(minDurationTicks, note.durationTicks - overlapAmount);
                    if (shortened < note.durationTicks) {
                        accommodationApplied = {
                            shortenedFrom: note.durationTicks,
                            shortenedTo: shortened,
                            reason: 'Accommodation-first unison overlap shortening applied to candidate note.'
                        };
                        note.durationTicks = shortened;
                    } else {
                        overlapPenalty += 90;
                    }
                } else {
                    const shortenedExisting = Math.max(minDurationTicks, existing.durationTicks - overlapAmount);
                    if (shortenedExisting < existing.durationTicks) {
                        existing.durationTicks = shortenedExisting;
                    } else {
                        overlapPenalty += 90;
                    }
                }
            }
        }
    }

    testNotes.push(note);
    testNotes.sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);

    const baselineOverlaps = countUnisonOverlaps(chosen);
    const candidateOverlaps = countUnisonOverlaps(testNotes);
    overlapPenalty += Math.max(0, candidateOverlaps - baselineOverlaps) * 50;

    // Type 2 blip flattening.
    const baselineBlips = countShortPolyphonyBlips(chosen, ppq);
    const candidateBlips = countShortPolyphonyBlips(testNotes, ppq);
    let blipPenalty = 0;
    if (candidateBlips > baselineBlips) {
        const isLowConfidence = confidence !== ShadowConfidence.CERTAIN;
        blipPenalty += (candidateBlips - baselineBlips) * (isLowConfidence ? 55 : 80);
        conflictTypes.push('type2_polyphony_blip');
    }

    // Type 3 contextual rhythm inconsistency (soft bias).
    const dominant = localDominantFamily(analyses, index);
    let contextPenalty = 0;
    if (candidate.family !== dominant) {
        contextPenalty += confidence === ShadowConfidence.CERTAIN ? 8 : 16;
        conflictTypes.push('type3_contextual_rhythm');
    }

    // Weighted objective terms (ordered).
    const noteRetention = 0; // no deletion allowed in solver path

    const previous = testNotes.length > 1 ? testNotes[testNotes.length - 2] : undefined;
    const ordering = previous && note.ticks < previous.ticks ? 200 : 0;

    const rawDuration = Math.max(1, original.durationTicks);
    const durationRatio = note.durationTicks / rawDuration;
    const durationPenalty = durationRatio < 0.5 || durationRatio > 2 ? 70 : Math.abs(note.durationTicks - rawDuration) / Math.max(1, rawDuration) * 18;

    const onsetShift = Math.abs(note.ticks - original.ticks);
    const onsetLimit = Math.min(ppq / 2, 1.5 * Math.max(1, note.durationTicks));
    const onsetPenalty = onsetShift > onsetLimit ? 70 : onsetShift / Math.max(1, ppq / 8) * 10;
    const movement = durationPenalty + onsetPenalty;

    const overlapAndBlip = overlapPenalty + blipPenalty + contextPenalty + overlapCount * 10;

    const candidateChanged = candidate.onset.ticks !== baseline.onset.ticks || candidate.duration.durationTicks !== baseline.duration.durationTicks;
    let confidenceAwareEdit = 0;
    if (candidateChanged) {
        if (confidence === ShadowConfidence.CERTAIN) confidenceAwareEdit += 35;
        if (confidence === ShadowConfidence.WEAK_PRIMARY) confidenceAwareEdit += 14;
        if (confidence === ShadowConfidence.AMBIGUOUS) confidenceAwareEdit += 4;
    }

    const total = noteRetention + ordering + movement + overlapAndBlip + confidenceAwareEdit;

    return {
        hypothesis: {
            ...candidate,
            duration: {
                ...candidate.duration,
                durationTicks: note.durationTicks
            }
        },
        objective: {
            noteRetention,
            ordering,
            movement,
            overlapAndBlip,
            confidenceAwareEdit,
            total
        },
        conflictTypes: Array.from(new Set(conflictTypes)),
        accommodationApplied
    };
}

/**
 * Pass 2: Contextual conflict solver with neighborhood-aware candidate reselection.
 */
function resolveGridConflicts(analyses: ShadowNoteAnalysis[], ppq: number): RawNote[] {
    const resolved: RawNote[] = [];

    analyses.forEach((analysis, idx) => {
        const candidates = [analysis.bestCandidate, ...analysis.alternatives];
        const evaluated = candidates.map(candidate => evaluateHypothesisAtIndex(idx, analyses, resolved, candidate, ppq));
        evaluated.sort((a, b) => a.objective.total - b.objective.total);

        const winner = evaluated[0];
        const picked = winner.hypothesis;

        resolved.push({
            ...analysis.original,
            ticks: picked.onset.ticks,
            durationTicks: picked.duration.durationTicks,
            shadowDecision: {
                confidence: getConfidenceLabel(analysis.confidence),
                pass1BestFamily: analysis.bestCandidate.family,
                selectedFamily: picked.family,
                selectedNoteValue: picked.noteValue,
                selectedOnsetTicks: picked.onset.ticks,
                selectedDurationTicks: picked.duration.durationTicks,
                objectiveBreakdown: winner.objective,
                conflictTypes: winner.conflictTypes,
                accommodationApplied: winner.accommodationApplied,
                alternatives: evaluated.map(item => ({
                    family: item.hypothesis.family,
                    noteValue: item.hypothesis.noteValue,
                    onsetTicks: item.hypothesis.onset.ticks,
                    durationTicks: item.hypothesis.duration.durationTicks,
                    totalScore: item.objective.total
                }))
            }
        });
    });

    return resolved;
}

/**
 * Main Entry Point for Shadow Quantization
 */
export function applyShadowQuantization(notes: RawNote[], ppq: number, primary: RhythmRule, secondary: RhythmRule): RawNote[] {
    if (!primary.enabled) return notes;

    const analyses = analyzeShadowCertainty(notes, ppq, primary, secondary);
    return resolveGridConflicts(analyses, ppq);
}
