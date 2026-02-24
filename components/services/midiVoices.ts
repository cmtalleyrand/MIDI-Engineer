
import { RawNote, ConversionOptions, VoiceExplanation } from '../../types';

const getMidi = (n: any | RawNote) => 'midi' in n ? n.midi : (n as any).midi;
const getTicks = (n: any | RawNote) => 'ticks' in n ? n.ticks : (n as any).ticks;
const getDuration = (n: any | RawNote) => 'durationTicks' in n ? n.durationTicks : (n as any).durationTicks;
const getEnd = (n: any | RawNote) => getTicks(n) + getDuration(n);
const getName = (n: any | RawNote) => 'name' in n ? n.name : (n as any).name;

export function getVoiceLabel(index: number, total: number): string {
    if (index === -1) return 'Orph';
    if (total === 1) return 'Melody';
    if (total === 2) return index === 0 ? 'S' : 'B';
    if (total === 3) return ['S', 'T', 'B'][index] || `V${index}`;
    if (total === 4) return ['S', 'A', 'T', 'B'][index] || `V${index}`;
    
    return `V${index}`;
}

interface DensityArea {
    startTick: number;
    endTick: number;
    density: number;
    slices: any[];
}

export interface VoiceDistributionResult {
    voices: (any | RawNote)[][];
    orphans: (any | RawNote)[];
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function getLeapCost(leap: number): { cost: number; parts: string[] } {
    if (leap <= 0) return { cost: 0, parts: ['0'] };

    let cost = leap;
    const parts = [`${leap.toFixed(1)}`];

    // Requested stepwise discontinuities:
    // - minor seventh notch (>= 10)
    // - small notch between m7 and octave
    // - larger notch above octave
    // - smaller additional notch above >16
    if (leap >= 10) {
        cost += 1.8;
        parts.push('+1.8@m7');
    }
    if (leap >= 12) {
        cost += 1.2;
        parts.push('+1.2@8ve');
    }
    if (leap > 12) {
        const aboveOctave = (leap - 12) * 1.15;
        cost += aboveOctave;
        parts.push(`+${aboveOctave.toFixed(1)}>8veSlope`);
    }
    if (leap > 16) {
        cost += 2.4;
        parts.push('+2.4@>16');
    }

    return { cost, parts };
}

function estimateTrackLeapScale(track: (any | RawNote)[]): number {
    if (track.length < 2) return 7;

    const sorted = [...track].sort((a, b) => getTicks(a) - getTicks(b));
    const recent = sorted.slice(-8);
    const leaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
        leaps.push(Math.abs(getMidi(recent[i]) - getMidi(recent[i - 1])));
    }

    return clamp(mean(leaps), 5, 11);
}

function findPrevAndNextInVoice(
    track: (any | RawNote)[],
    nStart: number,
    nEnd: number,
    overlapTolerance: number
): { prev?: any | RawNote; next?: any | RawNote } {
    const effStart = nStart + overlapTolerance;
    const effEnd = nEnd - overlapTolerance;

    const prev = [...track]
        .filter(existing => getEnd(existing) <= effStart)
        .sort((a, b) => {
            const endDelta = getEnd(b) - getEnd(a);
            if (endDelta !== 0) return endDelta;
            return getTicks(b) - getTicks(a);
        })[0];

    const next = [...track]
        .filter(existing => getTicks(existing) >= effEnd)
        .sort((a, b) => getTicks(a) - getTicks(b))[0];

    return { prev, next };
}

// Helper for combinatorial voice selection
function getCombinations(arr: number[], k: number): number[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    const withFirst = getCombinations(rest, k-1).map(c => [first, ...c]);
    const withoutFirst = getCombinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

/**
 * Structural Analysis based on Density and Sustain criteria.
 */
export function distributeToVoices(notes: any[] | RawNote[], options?: ConversionOptions, ppq: number = 480): VoiceDistributionResult {
    if (notes.length === 0) return { voices: [], orphans: [] };

    const TS_NUM = options?.timeSignature?.numerator || 4;
    const TS_DEN = options?.timeSignature?.denominator || 4;
    const TICKS_PER_MEASURE = ppq * TS_NUM * (4 / TS_DEN);
    const EIGHTH_GAP = ppq / 2;
    
    // Strict Mode: Notes in a voice cannot overlap at all. 
    const strictMonophony = options?.voiceSeparationDisableChords === true;
    const overlapTolerance = options?.voiceSeparationOverlapTolerance || 0;

    const sortedNotes = [...notes].sort((a, b) => getTicks(a) - getTicks(b));
    const allEvents = new Set<number>();
    sortedNotes.forEach(n => { 
        allEvents.add(getTicks(n)); 
        allEvents.add(getEnd(n)); 
    });
    const sortedTimeline = Array.from(allEvents).sort((a,b) => a - b);
    
    // Create slices of the timeline to calculate precise vertical density
    const slices: { start: number, end: number, activeNotes: (any | RawNote)[] }[] = [];
    let maxGlobalDensity = 0;
    
    for (let i = 0; i < sortedTimeline.length - 1; i++) {
        const start = sortedTimeline[i];
        const end = sortedTimeline[i+1];
        const mid = (start + end) / 2;
        const active = sortedNotes.filter(n => getTicks(n) <= mid && getEnd(n) > mid);
        if (active.length > maxGlobalDensity) maxGlobalDensity = active.length;
        slices.push({ start, end, activeNotes: active });
    }

    if (maxGlobalDensity === 0) return { voices: [sortedNotes], orphans: [] };

    const findAreasAtDensity = (targetDensity: number) => {
        const areas: DensityArea[] = [];
        let currentArea: DensityArea | null = null;

        slices.forEach((slice) => {
            if (slice.activeNotes.length >= targetDensity) {
                if (!currentArea) {
                    currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                } else {
                    const gap = slice.start - currentArea.endTick;
                    if (gap <= EIGHTH_GAP) {
                        currentArea.endTick = slice.end;
                        currentArea.slices.push(slice);
                    } else {
                        areas.push(currentArea);
                        currentArea = { startTick: slice.start, endTick: slice.end, density: targetDensity, slices: [slice] };
                    }
                }
            }
        });
        if (currentArea) areas.push(currentArea);
        return areas;
    };

    const checkSustain = (area: DensityArea) => {
        const len = area.endTick - area.startTick;
        return len >= TICKS_PER_MEASURE; 
    };

    let ceilingDensity = maxGlobalDensity;
    while (ceilingDensity >= 1) {
        const areas = findAreasAtDensity(ceilingDensity);
        if (areas.some(checkSustain)) break;
        ceilingDensity--;
    }

    let finalPolyphony = ceilingDensity;
    if (finalPolyphony === 0) finalPolyphony = Math.max(1, maxGlobalDensity - 1); // Fallback

    if (options?.voiceSeparationMaxVoices && options.voiceSeparationMaxVoices > 0) {
        finalPolyphony = options.voiceSeparationMaxVoices;
    }

    const voiceTracks: (any | RawNote)[][] = Array.from({ length: finalPolyphony }, () => []);
    const orphans: (any | RawNote)[] = [];
    const assignedNotes = new Set<any | RawNote>();
    const HARD_CROSSING_MARGIN = 1;
    const HIGH_COST_ORPHAN_THRESHOLD = options?.voiceSeparationOrphanThreshold ?? 120;

    // ---------------------------------------------------------
    // PHASE 1: ITERATIVE ANCHOR ASSIGNMENT (VERTICAL)
    // ---------------------------------------------------------
    // We only iterate down to the point where density implies unambiguous structure.
    for (let d = finalPolyphony; d >= finalPolyphony; d--) {
        const areas = findAreasAtDensity(d);
        const sustainedAreas = areas.filter(checkSustain);

        // Centroids are calculated but only used for display in Phase 1 now, 
        // or for tie-breaking in Phase 2.
        const voiceCentroids: number[] = [];
        for(let v=0; v<finalPolyphony; v++) {
            const notes = voiceTracks[v];
            if (notes.length > 0) {
                 const sum = notes.reduce((s, n) => s + getMidi(n), 0);
                 voiceCentroids[v] = sum / notes.length;
            } else {
                 voiceCentroids[v] = 84 - (v * (48 / Math.max(1, finalPolyphony - 1)));
            }
        }

        sustainedAreas.forEach(area => {
            area.slices.forEach(slice => {
                const activeNotes = slice.activeNotes.sort((a: any, b: any) => getMidi(b) - getMidi(a)); // Always High -> Low
                
                // Identify Unassigned notes in this slice
                const unassignedInSlice = activeNotes.filter((n: any) => !assignedNotes.has(n));
                
                if (unassignedInSlice.length === 0) return;

                // STRATEGY: MAX DENSITY BLOCK ONLY
                if (activeNotes.length >= finalPolyphony) {
                     let mathDetails: any[] = [];
                     
                     for(let k=0; k < activeNotes.length; k++) {
                         if (k >= finalPolyphony) break;

                         const note = activeNotes[k];
                         if (assignedNotes.has(note)) continue; 
                         
                         const targetVoice = k;
                         
                         voiceTracks[targetVoice].push(note);
                         assignedNotes.add(note);
                         (note as any).voiceIndex = targetVoice;
                         
                         mathDetails.push({
                             voiceName: getVoiceLabel(targetVoice, finalPolyphony),
                             voiceCentroid: `Rank ${k}`,
                             noteMidi: getMidi(note),
                             delta: 0,
                             costSquared: 0
                         });

                         (note as any).explanation = {
                            phase: "1 - Anchor (Full Block)",
                            text: `Full Density Block. Assigned to ${getVoiceLabel(targetVoice, finalPolyphony)} (Rank ${k}).`,
                            assignedVoice: targetVoice,
                            math: mathDetails
                        };
                     }
                } 
            });
        });
    }

    // ---------------------------------------------------------
    // PHASE 2: GAP FILLING (HORIZONTAL)
    // ---------------------------------------------------------
    const remainingNotes = sortedNotes.filter(n => !assignedNotes.has(n));
    
    // Changed to standard loop to allow lookahead
    for (let i = 0; i < remainingNotes.length; i++) {
        const note = remainingNotes[i];
        let bestV = -1;
        let minCost = Infinity;
        const nPitch = getMidi(note);
        const nStart = getTicks(note);
        const nEnd = getEnd(note);
        
        // ISLAND PREVENTION: Look ahead to see if this note starts a horizontal line
        let formsPhrase = false;
        // Look up to 10 notes ahead or until time gap is too large
        for(let k = i + 1; k < Math.min(i + 10, remainingNotes.length); k++) {
             const future = remainingNotes[k];
             if (getTicks(future) - nEnd > TICKS_PER_MEASURE) break; // Too far, stop looking
             
             // If a note starts strictly after this one, it extends the timeline
             if (getTicks(future) > nStart) {
                 formsPhrase = true;
                 break;
             }
        }

        const costLog: any[] = [];

        for (let v = 0; v < finalPolyphony; v++) {
            const track = voiceTracks[v];
            const voiceName = getVoiceLabel(v, finalPolyphony);
            
            const overlap = track.some(existing => {
                const eStart = getTicks(existing);
                const eEnd = getEnd(existing);
                const effStart1 = nStart; 
                const effEnd1 = Math.max(nStart, nEnd - overlapTolerance);
                const effStart2 = eStart;
                const effEnd2 = Math.max(eStart, eEnd - overlapTolerance);
                return effStart1 < effEnd2 && effEnd1 > effStart2;
            });
            
            if (overlap && strictMonophony) {
                costLog.push({ voice: voiceName, cost: 'N/A', details: 'Overlap' });
                continue;
            }
            
            // Find nearest temporal neighbors in this voice (end-aligned prev, start-aligned next)
            const { prev, next } = findPrevAndNextInVoice(track, nStart, nEnd, overlapTolerance);

            // Neighbor voices around current time for near-hard crossing pressure checks
            const upperNeighborVoice = v > 0 ? voiceTracks[v - 1] : null;
            const lowerNeighborVoice = v < finalPolyphony - 1 ? voiceTracks[v + 1] : null;
            const upperNeighbor = upperNeighborVoice
                ? upperNeighborVoice.filter(n => getTicks(n) <= nStart && getEnd(n) > nStart).sort((a, b) => getTicks(b) - getTicks(a))[0]
                : undefined;
            const lowerNeighbor = lowerNeighborVoice
                ? lowerNeighborVoice.filter(n => getTicks(n) <= nStart && getEnd(n) > nStart).sort((a, b) => getTicks(b) - getTicks(a))[0]
                : undefined;

            let cost = 0;
            let details = [];

            // 1. Interval Cost
            const leapFromPrev = prev ? Math.abs(getMidi(prev) - nPitch) : 0;
            const leapToNext = next ? Math.abs(getMidi(next) - nPitch) : 0;
            const leapCostPrev = getLeapCost(leapFromPrev);
            const leapCostNext = getLeapCost(leapToNext);

            let intervalCost = 0;
            if (prev) intervalCost += leapCostPrev.cost;
            if (next) intervalCost += leapCostNext.cost;
            cost += intervalCost;
            
            if (intervalCost > 0) {
                details.push(`Dist: ${intervalCost.toFixed(1)} [prev=${leapCostPrev.parts.join('')}; next=${leapCostNext.parts.join('')}]`);
            }
            else details.push(`Dist: 0`);
            
            // 2. Zone/Centroid Bias (Tie-breaker only)
            const targetP = 84 - (v * (36 / Math.max(1, finalPolyphony - 1)));
            const centroidCost = Math.abs(targetP - nPitch) * 0.05;
            cost += centroidCost; 
            details.push(`Zone: ${centroidCost.toFixed(1)}`);

            // 3. Structural Integrity (continuity / crossing / chord plausibility)
            const prevEnd = prev ? getEnd(prev) : -Infinity;
            const nextStart = next ? getTicks(next) : Infinity;
            const gapFromPrev = Number.isFinite(prevEnd) ? nStart - prevEnd : Infinity;
            const gapToNext = Number.isFinite(nextStart) ? nextStart - nEnd : Infinity;
            // Intentionally conservative: chord-addition detection is tied to the selected `prev` neighbor.
            // This means it may under-detect some overlapping contexts (especially at low overlap tolerance),
            // but preserves predictable continuity-first behavior for this scoring path.
            const isChordAddition = prev && (getTicks(prev) === nStart || prevEnd > nStart);
            const trackLeapScale = estimateTrackLeapScale(track);
            const adaptiveLargeLeap = clamp(Math.round(trackLeapScale * 2.2), 11, 16);
            const softCrossingMargin = clamp(Math.round(trackLeapScale / 2), 2, 5);

            let penalty = 0;
            const orphanTriggers: string[] = [];
            if (isChordAddition) {
                penalty = 10;
                details.push("Chord (+10)");
            } else {
                const gapPrevMeasures = Number.isFinite(gapFromPrev) ? gapFromPrev / TICKS_PER_MEASURE : 3;
                const gapNextMeasures = Number.isFinite(gapToNext) ? gapToNext / TICKS_PER_MEASURE : 3;
                const noteDuration = Math.max(1, nEnd - nStart);
                const shortBlipFactor = clamp((ppq - noteDuration) / ppq, 0, 1); // 1 when extremely short, 0 at quarter-note+
                const isolationFactor = clamp(gapPrevMeasures - 1, 0, 1.5) * clamp(gapNextMeasures - 1, 0, 1.5);
                const phraseSupport = formsPhrase ? 1 : 0;
                const continuityStress = (leapFromPrev + leapToNext) / Math.max(1, adaptiveLargeLeap * 2);
                const wakeBlipPressure = shortBlipFactor * isolationFactor * (1 - 0.7 * phraseSupport);

                penalty += wakeBlipPressure * 120;
                details.push(`WakeBlip=${wakeBlipPressure.toFixed(2)} (+${(wakeBlipPressure * 120).toFixed(1)})`);

                if (gapPrevMeasures > 1 && gapNextMeasures <= 1) {
                    penalty += 18;
                    details.push("Late Wake (+18)");
                } else if (gapNextMeasures > 1 && gapPrevMeasures <= 1) {
                    penalty += 5;
                    details.push("End (+5)");
                }

                if (wakeBlipPressure * continuityStress > 0.95) {
                    orphanTriggers.push('Short wake-up with poor continuity (isolated short blip pressure + continuity stress).');
                }
            }

            if (isChordAddition) {
                const chordNeighbors = track.filter(n => {
                    const eStart = getTicks(n);
                    const eEnd = getEnd(n);
                    return eStart <= nStart && eEnd > nStart;
                });
                const span = chordNeighbors.length > 0
                    ? Math.max(...chordNeighbors.map(getMidi), nPitch) - Math.min(...chordNeighbors.map(getMidi), nPitch)
                    : 0;
                const allChordPitches = [...chordNeighbors.map(getMidi), nPitch].sort((a, b) => a - b);
                const maxInnerGap = allChordPitches.length > 1
                    ? Math.max(...allChordPitches.slice(1).map((p, idx) => p - allChordPitches[idx]))
                    : 0;
                const chordMean = mean(allChordPitches);
                const centroidDrift = Math.abs(nPitch - chordMean);
                const chordSize = allChordPitches.length;
                const spanLimit = 12 + Math.max(0, chordSize - 2) * 3;
                const innerGapLimit = 9;
                const driftLimit = 7;

                const spanPressure = clamp((span / Math.max(1, spanLimit)) - 1, 0, 2);
                const spacingPressure = clamp((maxInnerGap / Math.max(1, innerGapLimit)) - 1, 0, 2);
                const driftPressure = clamp((centroidDrift / Math.max(1, driftLimit)) - 1, 0, 2);
                const chordPressure = (spanPressure * 0.55) + (spacingPressure * 0.25) + (driftPressure * 0.2);

                penalty += chordPressure * 90;
                details.push(`ChordP=${chordPressure.toFixed(2)} (+${(chordPressure * 90).toFixed(1)}) [span=${span}/${spanLimit},maxGap=${maxInnerGap}/${innerGapLimit},drift=${centroidDrift.toFixed(1)}/${driftLimit}]`);

                if (chordPressure > 0.9) {
                    orphanTriggers.push('Implausible chord context (span/spacing/center pressure too high).');
                }
            }

            const prevLeapPressure = clamp(leapFromPrev / Math.max(1, adaptiveLargeLeap), 0, 3);
            const nextLeapPressure = clamp(leapToNext / Math.max(1, adaptiveLargeLeap), 0, 3);
            const pathDistortionPressure = prevLeapPressure * nextLeapPressure;
            penalty += pathDistortionPressure * 20;
            details.push(`PathP=${pathDistortionPressure.toFixed(2)} (+${(pathDistortionPressure * 20).toFixed(1)})`);

            if (pathDistortionPressure > 2.3) {
                orphanTriggers.push('Path distortion would be excessive (bidirectional leap pressure too high).');
            }

            if (upperNeighbor) {
                const upperPitch = getMidi(upperNeighbor);
                const upperVoiceName = getVoiceLabel(v - 1, finalPolyphony);
                if (nPitch >= upperPitch - HARD_CROSSING_MARGIN) {
                    orphanTriggers.push(`Near-hard crossing pressure against upper voice (${upperVoiceName}).`);
                } else if (nPitch >= upperPitch - softCrossingMargin) {
                    const distance = (upperPitch - HARD_CROSSING_MARGIN) - nPitch;
                    const normalized = clamp(1 - (distance / Math.max(1, softCrossingMargin - HARD_CROSSING_MARGIN)), 0, 1);
                    const pressurePenalty = 8 + (normalized ** 2) * 18;
                    penalty += pressurePenalty;
                    details.push(`Near Cross↑ (+${pressurePenalty.toFixed(1)})`);
                }
            }

            if (lowerNeighbor) {
                const lowerPitch = getMidi(lowerNeighbor);
                const lowerVoiceName = getVoiceLabel(v + 1, finalPolyphony);
                if (nPitch <= lowerPitch + HARD_CROSSING_MARGIN) {
                    orphanTriggers.push(`Near-hard crossing pressure against lower voice (${lowerVoiceName}).`);
                } else if (nPitch <= lowerPitch + softCrossingMargin) {
                    const distance = nPitch - (lowerPitch + HARD_CROSSING_MARGIN);
                    const normalized = clamp(1 - (distance / Math.max(1, softCrossingMargin - HARD_CROSSING_MARGIN)), 0, 1);
                    const pressurePenalty = 8 + (normalized ** 2) * 18;
                    penalty += pressurePenalty;
                    details.push(`Near Cross↓ (+${pressurePenalty.toFixed(1)})`);
                }
            }

            // Hybrid crossing policy: keep hard guard at note onset (above), then add a soft penalty
            // if adjacent-voice overlap during this note's span becomes too close.
            const overlappingUpper = upperNeighborVoice
                ? upperNeighborVoice.filter(n => getTicks(n) < nEnd && getEnd(n) > nStart)
                : [];
            if (overlappingUpper.length > 0) {
                const minUpperClearance = Math.min(...overlappingUpper.map(n => getMidi(n) - nPitch));
                if (Number.isFinite(minUpperClearance) && minUpperClearance < softCrossingMargin) {
                    const normalized = clamp(1 - ((minUpperClearance - HARD_CROSSING_MARGIN) / Math.max(1, softCrossingMargin - HARD_CROSSING_MARGIN)), 0, 1);
                    const spanPenalty = 6 + (normalized ** 2) * 14;
                    penalty += spanPenalty;
                    details.push(`Span Cross↑ (+${spanPenalty.toFixed(1)})`);
                }
            }

            const overlappingLower = lowerNeighborVoice
                ? lowerNeighborVoice.filter(n => getTicks(n) < nEnd && getEnd(n) > nStart)
                : [];
            if (overlappingLower.length > 0) {
                const minLowerClearance = Math.min(...overlappingLower.map(n => nPitch - getMidi(n)));
                if (Number.isFinite(minLowerClearance) && minLowerClearance < softCrossingMargin) {
                    const normalized = clamp(1 - ((minLowerClearance - HARD_CROSSING_MARGIN) / Math.max(1, softCrossingMargin - HARD_CROSSING_MARGIN)), 0, 1);
                    const spanPenalty = 6 + (normalized ** 2) * 14;
                    penalty += spanPenalty;
                    details.push(`Span Cross↓ (+${spanPenalty.toFixed(1)})`);
                }
            }

            cost += penalty;

            if (orphanTriggers.length > 0) {
                costLog.push({ voice: voiceName, cost: 'ORPHAN', details: orphanTriggers.join(' | ') });
                continue;
            }

            costLog.push({ voice: voiceName, cost: cost.toFixed(1), details: details.join(', ') });

            if (cost < minCost) {
                minCost = cost;
                bestV = v;
            }
        }

        if (bestV !== -1 && minCost <= HIGH_COST_ORPHAN_THRESHOLD) {
            voiceTracks[bestV].push(note);
            assignedNotes.add(note);
            (note as any).voiceIndex = bestV;
            (note as any).explanation = {
                phase: "2 - Gap Fill",
                winner: bestV,
                text: "Cost minimization.",
                costs: costLog
            };
        } else {
            orphans.push(note);
            assignedNotes.add(note);
            (note as any).voiceIndex = -1;
            (note as any).explanation = {
                phase: "3 - Orphan",
                reason: bestV === -1
                    ? "Forced orphan: implausible continuity/crossing/chord constraints in all voices."
                    : `Forced orphan: best continuity cost too high (${minCost.toFixed(1)}).`,
                pathIndependent: true,
                excludedFromContinuity: true,
                costs: costLog
            };
        }
    }

    voiceTracks.forEach(t => t.sort((a,b) => getTicks(a) - getTicks(b)));
    orphans.sort((a,b) => getTicks(a) - getTicks(b));

    return { voices: voiceTracks, orphans };
}
